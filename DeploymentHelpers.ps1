Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Copy-HubPayload {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Destination,
        [string[]]$ExcludeFiles = @(),
        [string[]]$ExcludeDirectories = @()
    )

    if (-not [IO.Directory]::Exists($Source)) { throw "Payload directory is missing: $Source" }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    $arguments = [Collections.Generic.List[string]]::new()
    foreach ($argument in @($Source, $Destination, '/E', '/IS', '/IT', '/COPY:DAT', '/DCOPY:DAT', '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')) {
        [void]$arguments.Add($argument)
    }
    if ($ExcludeFiles) {
        [void]$arguments.Add('/XF')
        foreach ($file in $ExcludeFiles) { [void]$arguments.Add($file) }
    }
    if ($ExcludeDirectories) {
        [void]$arguments.Add('/XD')
        foreach ($directory in $ExcludeDirectories) { [void]$arguments.Add($directory) }
    }

    & robocopy.exe @($arguments.ToArray()) | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -gt 7) { throw "Payload copy failed: Source=$Source Destination=$Destination ExitCode=$exitCode" }
    return [pscustomobject]@{ Source = $Source; Destination = $Destination; ExitCode = [int]$exitCode }
}

function Get-HubBotServiceForPath {
    param([Parameter(Mandatory)][string]$BotPath)

    $target = [IO.Path]::GetFullPath($BotPath).TrimEnd([char[]]@('\', '/'))
    $services = @(Get-CimInstance -ClassName Win32_Service | Where-Object {
        $servicePath = [string]$_.PathName
        -not [string]::IsNullOrWhiteSpace($servicePath) -and
        $servicePath.IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0
    })

    if ($services.Count -eq 0) { return $null }
    if ($services.Count -ne 1) {
        throw "Bot payload copy failed and multiple Windows services reference ${target}: $($services.Name -join ', ')"
    }

    $service = $services[0]
    return [pscustomobject]@{
        Name = [string]$service.Name
        WasRunning = ([string]$service.State -eq 'Running')
    }
}

function Stop-HubBotServiceForReplacement {
    param([Parameter(Mandatory)][pscustomobject]$Service)

    if (-not $Service.WasRunning) { return }
    Add-Type -AssemblyName System.ServiceProcess
    Stop-Service -Name $Service.Name -ErrorAction Stop
    $controller = Get-Service -Name $Service.Name -ErrorAction Stop
    $controller.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(30))
}

function Start-HubBotServiceAfterReplacement {
    param([Parameter(Mandatory)][pscustomobject]$Service)

    if (-not $Service.WasRunning) { return }
    Add-Type -AssemblyName System.ServiceProcess
    Start-Service -Name $Service.Name -ErrorAction Stop
    $controller = Get-Service -Name $Service.Name -ErrorAction Stop
    $controller.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))
}

function Copy-HubBotPayload {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Destination,
        [string[]]$ExcludeFiles = @(),
        [string[]]$ExcludeDirectories = @()
    )

    try {
        return Copy-HubPayload -Source $Source -Destination $Destination -ExcludeFiles $ExcludeFiles -ExcludeDirectories $ExcludeDirectories
    }
    catch {
        $copyFailure = $_.Exception.Message
    }

    $service = Get-HubBotServiceForPath -BotPath $Destination
    if ($null -eq $service) {
        throw "Bot payload copy failed and no Windows service references $Destination. Stop the Bot process, then rerun deployment. CopyError=$copyFailure"
    }

    Write-Host "Bot payload copy was blocked; stopping service $($service.Name) for replacement."
    Stop-HubBotServiceForReplacement -Service $service
    try {
        return Copy-HubPayload -Source $Source -Destination $Destination -ExcludeFiles $ExcludeFiles -ExcludeDirectories $ExcludeDirectories
    }
    finally {
        Start-HubBotServiceAfterReplacement -Service $service
    }
}

function Set-HubImageToSightWebConfig {
    param(
        [Parameter(Mandatory)][string]$ConfigPath,
        [Parameter(Mandatory)][string]$PythonPath
    )

    if (-not [IO.File]::Exists($ConfigPath)) { throw "Existing web.config is missing: $ConfigPath" }
    [xml]$config = [IO.File]::ReadAllText($ConfigPath)
    $aspNetCore = $config.SelectSingleNode('/configuration/location/system.webServer/aspNetCore')
    if ($null -eq $aspNetCore) { $aspNetCore = $config.SelectSingleNode('/configuration/system.webServer/aspNetCore') }
    if ($null -eq $aspNetCore) { throw "aspNetCore node is missing: $ConfigPath" }

    $variables = $aspNetCore.SelectSingleNode('environmentVariables')
    $changed = $false
    if ($null -eq $variables) {
        $variables = $config.CreateElement('environmentVariables')
        [void]$aspNetCore.AppendChild($variables)
        $changed = $true
    }

    foreach ($name in @('IMAGE_TO_SIGHT_PYTHON', 'ImageToSight__PythonPath')) {
        $variable = $variables.SelectSingleNode("environmentVariable[@name='$name']")
        if ($null -eq $variable) {
            $variable = $config.CreateElement('environmentVariable')
            [void]$variable.SetAttribute('name', $name)
            [void]$variables.AppendChild($variable)
            $changed = $true
        }
        if ([string]$variable.GetAttribute('value') -ne $PythonPath) {
            [void]$variable.SetAttribute('value', $PythonPath)
            $changed = $true
        }
    }

    if ($changed) {
        $settings = [Xml.XmlWriterSettings]::new()
        $settings.Indent = $true
        $settings.Encoding = [Text.UTF8Encoding]::new($false)
        $writer = [Xml.XmlWriter]::Create($ConfigPath, $settings)
        try { $config.Save($writer) } finally { $writer.Dispose() }
    }

    [xml]$readBack = [IO.File]::ReadAllText($ConfigPath)
    foreach ($name in @('IMAGE_TO_SIGHT_PYTHON', 'ImageToSight__PythonPath')) {
        if ((Get-HubWebConfigValue -Config $readBack -Name $name) -ne $PythonPath) {
            throw "web.config read-back failed: Name=$name Path=$ConfigPath"
        }
    }

    return [pscustomobject]@{ Path = $ConfigPath; Changed = $changed; ReadBack = $true }
}

function Get-HubWebConfigValue {
    param([Parameter(Mandatory)][xml]$Config, [Parameter(Mandatory)][string]$Name)

    $variable = $Config.SelectSingleNode("/configuration/location/system.webServer/aspNetCore/environmentVariables/environmentVariable[@name='$Name']")
    if ($null -eq $variable) { $variable = $Config.SelectSingleNode("/configuration/system.webServer/aspNetCore/environmentVariables/environmentVariable[@name='$Name']") }
    if ($null -eq $variable) { return $null }
    return [string]$variable.GetAttribute('value')
}

function Grant-HubDeploymentAccess {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Identity,
        [Parameter(Mandatory)][ValidateSet('RX', 'M')][string]$Permission
    )

    if (-not [IO.Directory]::Exists($Path)) { throw "ACL target directory is missing: $Path" }
    & icacls.exe $Path /grant "${Identity}:(OI)(CI)$Permission" /T /C | Out-Null
    if ($LASTEXITCODE -gt 1) { throw "ACL update failed: Path=$Path Identity=$Identity Permission=$Permission" }
    return [pscustomobject]@{ Path = $Path; Identity = $Identity; Permission = $Permission }
}

function Enter-HubApplicationOffline {
    param([Parameter(Mandatory)][string]$ApplicationPath)

    New-Item -ItemType Directory -Force -Path $ApplicationPath | Out-Null
    $offlineFile = Join-Path $ApplicationPath 'app_offline.htm'
    [IO.File]::WriteAllText($offlineFile, '<!doctype html><html><body>Deployment in progress.</body></html>', [Text.UTF8Encoding]::new($false))
    Start-Sleep -Seconds 2
    return $offlineFile
}

function Exit-HubApplicationOffline {
    param([Parameter(Mandatory)][string]$OfflineFile)

    if ([IO.File]::Exists($OfflineFile)) { Remove-Item -LiteralPath $OfflineFile -Force }
}
