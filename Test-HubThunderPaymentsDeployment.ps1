[CmdletBinding()]
param(
    [string]$WebRoot = 'C:\Sites\HubThunder\Web',
    [string]$ApiRoot = 'C:\Sites\HubThunder\Api',
    [string]$BotRoot = 'C:\Services\DiscordBot',
    [string]$WebOrigin = 'https://hub-thunder.online',
    [string]$ApiOrigin = 'https://api.hub-thunder.online',
    [string]$TunnelConfig = 'C:\ProgramData\HubThunder\cloudflared\config.yml',
    [switch]$ExternalOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Check([string]$Name, [object]$Value) {
    [pscustomobject]@{ Check = $Name; Result = $Value } | ConvertTo-Json -Depth 5 -Compress | Write-Output
}

function Add-Settings([hashtable]$Target, [object]$Object, [string]$Prefix = '') {
    if ($null -eq $Object) { return }
    foreach ($property in $Object.PSObject.Properties) {
        $key = if ($Prefix) { $Prefix + ':' + $property.Name } else { $property.Name }
        if ($property.Value -is [pscustomobject]) { Add-Settings $Target $property.Value $key }
        else { $Target[$key.Replace('__', ':')] = [string]$property.Value }
    }
}

function Read-Settings([string]$Root) {
    $values = @{}
    foreach ($name in @('appsettings.json', 'appsettings.Production.json')) {
        $file = Join-Path $Root $name
        if (Test-Path -LiteralPath $file) { Add-Settings $values (Get-Content -LiteralPath $file -Raw | ConvertFrom-Json) }
    }
    foreach ($scope in @('Machine', 'Process')) {
        foreach ($item in [Environment]::GetEnvironmentVariables($scope).GetEnumerator()) {
            $values[([string]$item.Key).Replace('__', ':')] = [string]$item.Value
        }
    }
    $webConfig = Join-Path $Root 'web.config'
    if (Test-Path -LiteralPath $webConfig) {
        [xml]$xml = Get-Content -LiteralPath $webConfig -Raw
        foreach ($variable in $xml.SelectNodes('//aspNetCore/environmentVariables/environmentVariable')) {
            $values[$variable.GetAttribute('name').Replace('__', ':')] = $variable.GetAttribute('value')
        }
    }
    return $values
}

function Setting([hashtable]$Values, [string]$Name, [string]$Fallback) {
    if ($Values.ContainsKey($Name)) { return ([string]$Values[$Name]).Trim() }
    return ([string]$Values[$Fallback]).Trim()
}

function Probe([string]$Name, [string]$Origin, [string]$Path, [string]$Method, [string]$Secret = '', [string]$HostHeader = '') {
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(15)
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), $Origin.TrimEnd('/') + $Path)
    try {
        if ($HostHeader) {
            $request.Headers.Host = $HostHeader
            $request.Headers.TryAddWithoutValidation('X-Forwarded-Proto', 'https') | Out-Null
        }
        if ($Method -eq 'POST') {
            # Signed, deliberately non-payment payload verifies the route without creating/granting anything.
            $request.Content = [Net.Http.StringContent]::new('{}', [Text.Encoding]::UTF8, 'application/json')
            if ($Secret) {
                $hmac = [Security.Cryptography.HMACSHA512]::new([Text.Encoding]::UTF8.GetBytes($Secret))
                try { $signature = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes('{}')))).Replace('-', '').ToLowerInvariant() }
                finally { $hmac.Dispose() }
                $request.Headers.TryAddWithoutValidation('x-nowpayments-sig', $signature) | Out-Null
            }
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        try {
            $errorCode = ''
            if ($response.Content.Headers.ContentType -and $response.Content.Headers.ContentType.MediaType -eq 'application/json') {
                try {
                    $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
                    if ($json.PSObject.Properties['error'] -and $json.error -in @('invalid_signature', 'invalid_notification', 'payment_unavailable')) { $errorCode = $json.error }
                } catch { }
            }
            Write-Check $Name @{ Http = [int]$response.StatusCode; Error = $errorCode; Redirect = $null -ne $response.Headers.Location; TlsValidated = $Origin.StartsWith('https://') }
        } finally { $response.Dispose() }
    } catch { $cause = $_.Exception.GetBaseException(); Write-Check $Name @{ Http = 0; ErrorType = $cause.GetType().Name; HResult = $cause.HResult } }
    finally { $request.Dispose(); $client.Dispose() }
}

function Probe-Routes([string]$Name, [string]$Origin, [string]$Secret = '', [string]$HostHeader = '') {
    Probe "$Name.create-anonymous-expect-401" $Origin '/api/payments/nowpayments/create' 'POST' '' $HostHeader
    Probe "$Name.order-anonymous-expect-401" $Origin '/api/payments/nowpayments/orders/HT-00000000000000000000000000000000' 'GET' '' $HostHeader
    Probe "$Name.ipn-unsigned-expect-401-invalid_signature" $Origin '/api/payments/nowpayments/ipn' 'POST' '' $HostHeader
    if ($Secret) { Probe "$Name.ipn-signed-invalid-payload-expect-400-invalid_notification" $Origin '/api/payments/nowpayments/ipn' 'POST' $Secret $HostHeader }
}

$webSettings = @{}
$apiSettings = @{}
$botSettings = @{}
Probe 'NOWPayments.public.status' 'https://api.nowpayments.io' '/v1/status' 'GET'
if (!$ExternalOnly) {
    foreach ($target in @(@{ Name = 'Web'; Root = $WebRoot }, @{ Name = 'Api'; Root = $ApiRoot }, @{ Name = 'Bot'; Root = $BotRoot })) {
        try {
            $settings = Read-Settings $target.Root
            if ($target.Name -eq 'Web') { $webSettings = $settings }
            if ($target.Name -eq 'Api') { $apiSettings = $settings }
            if ($target.Name -eq 'Bot') { $botSettings = $settings }
            $dll = Join-Path $target.Root 'HubThunder.dll'
            $hash = if (Test-Path -LiteralPath $dll) { (Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash } else { 'missing' }
            Write-Check ($target.Name + '.configuration') @{ RootExists = Test-Path -LiteralPath $target.Root; AssemblySha256 = $hash;
                ApiKeyPresent = ![string]::IsNullOrWhiteSpace((Setting $settings 'NOWPAYMENTS_API_KEY' 'NowPayments:ApiKey'));
                IpnSecretPresent = ![string]::IsNullOrWhiteSpace((Setting $settings 'NOWPAYMENTS_IPN_SECRET' 'NowPayments:IpnSecret'));
                ApiKeyHasWhitespace = (Setting $settings 'NOWPAYMENTS_API_KEY' 'NowPayments:ApiKey') -match '\s';
                ApiEndpointValid = !$settings['NowPayments:ApiBaseUrl'] -or $settings['NowPayments:ApiBaseUrl'] -ceq 'https://api.nowpayments.io/v1/' }
            if ($target.Name -eq 'Bot') { Write-Check 'Bot.role-worker' @{ Enabled = $settings['DiscordBot:Enabled']; Mode = $settings['DiscordBot:StartupMode']; TokenPresent = ![string]::IsNullOrWhiteSpace($settings['DiscordBot:Token']); GuildPresent = ![string]::IsNullOrWhiteSpace($settings['DiscordBot:GuildId']); RolePresent = ![string]::IsNullOrWhiteSpace($settings['DiscordBot:PremiumRoleId']) } }
        } catch { Write-Check ($target.Name + '.configuration') @{ ErrorType = $_.Exception.GetType().Name } }
    }
    $webKey = Setting $webSettings 'NOWPAYMENTS_API_KEY' 'NowPayments:ApiKey'
    $apiKey = Setting $apiSettings 'NOWPAYMENTS_API_KEY' 'NowPayments:ApiKey'
    $webSecret = Setting $webSettings 'NOWPAYMENTS_IPN_SECRET' 'NowPayments:IpnSecret'
    $apiSecret = Setting $apiSettings 'NOWPAYMENTS_IPN_SECRET' 'NowPayments:IpnSecret'
    Write-Check 'Web-Api.secrets-match' @{ ApiKey = $webKey -and $webKey -ceq $apiKey; IpnSecret = $webSecret -and $webSecret -ceq $apiSecret }
    foreach ($field in @('GuildId', 'PremiumRoleId')) {
        $webValue = [string]$webSettings[('Discord:' + $field)]
        $apiValue = [string]$apiSettings[('Discord:' + $field)]
        $botValue = [string]$botSettings[('DiscordBot:' + $field)]
        Write-Check ('Discord.' + $field) @{ WebPresent = !!$webValue; ApiPresent = !!$apiValue; BotPresent = !!$botValue;
            WebApiMatch = !!$webValue -and $webValue -ceq $apiValue; WebBotMatch = !!$webValue -and $webValue -ceq $botValue }
    }
    try {
        $assembly = Join-Path $env:windir 'System32/inetsrv/Microsoft.Web.Administration.dll'
        Add-Type -Path $assembly
        $manager = [Microsoft.Web.Administration.ServerManager]::new()
        try {
            foreach ($site in $manager.Sites) {
                foreach ($application in $site.Applications) {
                    $root = [Environment]::ExpandEnvironmentVariables($application.VirtualDirectories['/'].PhysicalPath).TrimEnd('\')
                    $name = if ($root -ieq $ApiRoot.TrimEnd('\')) { 'Api' } elseif ($root -ieq $WebRoot.TrimEnd('\')) { 'Web' } else { continue }
                    Write-Check ($name + '.iis') @{ Site = $site.Name; State = [string]$site.State; AppPool = $application.ApplicationPoolName; Bindings = @($site.Bindings | ForEach-Object { $_.Protocol + ' ' + $_.BindingInformation }) }
                    foreach ($binding in $site.Bindings) {
                        if ($binding.Protocol -ne 'http') { continue }
                        $origin = 'http://127.0.0.1:' + $binding.EndPoint.Port
                        $header = if ($binding.Host) { $binding.Host } elseif ($name -eq 'Api') { ([uri]$ApiOrigin).Host } else { ([uri]$WebOrigin).Host }
                        Write-Check ($name + '.expected-tunnel-service') $origin
                        $secret = if ($name -eq 'Api') { $apiSecret } else { $webSecret }
                        Probe-Routes ($name + '.local') $origin $secret $header
                    }
                }
            }
        } finally { $manager.Dispose() }
    } catch { Write-Check 'IIS.discovery' @{ ErrorType = $_.Exception.GetType().Name; Action = 'Run elevated on the VPS with IIS installed.' } }
    try {
        $service = Get-CimInstance Win32_Service -Filter "Name='cloudflared'"
        if ($service) {
            Write-Check 'Tunnel.service' @{ State = $service.State; StartMode = $service.StartMode; TokenManaged = $service.PathName.Contains('--token'); LocalConfigExists = Test-Path -LiteralPath $TunnelConfig }
        } else { Write-Check 'Tunnel.service' 'not-found' }
        $cloudflared = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
        if ($cloudflared -and (Test-Path -LiteralPath $TunnelConfig)) {
            $rule = & $cloudflared.Source --config $TunnelConfig tunnel ingress rule ($ApiOrigin + '/api/payments/nowpayments/ipn') 2>&1 | Out-String
            $match = [regex]::Match($rule, 'service:\s*(https?://(?:127\.0\.0\.1|localhost|\[::1\]):\d+)')
            Write-Check 'Tunnel.local-config-api-service' $(if ($match.Success) { $match.Groups[1].Value } else { 'not-detected; verify ingress in Cloudflare' })
        }
    } catch { Write-Check 'Tunnel.discovery' @{ ErrorType = $_.Exception.GetType().Name } }
}
Probe-Routes 'Web.public' $WebOrigin (Setting $webSettings 'NOWPAYMENTS_IPN_SECRET' 'NowPayments:IpnSecret')
Probe-Routes 'Api.public' $ApiOrigin (Setting $apiSettings 'NOWPAYMENTS_IPN_SECRET' 'NowPayments:IpnSecret')
Write-Check 'Manual.acceptance' 'Sign in, create a real 4.99 USD invoice, pay, verify finished, Premium expiry, Discord role, then resend the same IPN. This diagnostic does not create invoices or grant Premium.'
