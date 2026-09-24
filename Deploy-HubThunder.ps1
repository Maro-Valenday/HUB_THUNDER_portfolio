[CmdletBinding()]
param([string]$PackageRoot = $PSScriptRoot, [switch]$SkipDatabaseMigration)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DeploymentHelpers.ps1')
. (Join-Path $PSScriptRoot 'Update-HubThunderPublicSettings.ps1')

$WebTarget = 'C:\Sites\HubThunder\Web'
$ApiTarget = 'C:\Sites\HubThunder\Api'
$BotTarget = 'C:\Services\DiscordBot'
$PythonRoot = 'C:\HubThunderRuntime\Python'
$PythonPath = 'C:\HubThunderRuntime\Python\.venv313\Scripts\python.exe'
$ImageToSightTemp = 'C:\HubThunderData\Temp\ImageToSight'
$AdministratorPythonRoot = 'C:\Users\Administrator\AppData\Local\Programs\Python'
$AppSettingsExclusions = @('web.config', 'appsettings*.json')

function Assert-HubDeploymentAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run Deploy-HubThunder.ps1 from an elevated PowerShell session.'
    }
}

function Get-HubDeploymentPayload {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$Name)

    $path = Join-Path ([IO.Path]::GetFullPath($Root)) $Name
    if (-not [IO.Directory]::Exists($path)) { throw "Package payload is missing: $path" }
    return $path
}

function Test-HubAdministratorVenvPath {
    param([Parameter(Mandatory)][string]$ConfigPath)

    if (-not [IO.File]::Exists($ConfigPath)) { return $false }
    foreach ($line in [IO.File]::ReadLines($ConfigPath)) {
        $separator = $line.IndexOf('=')
        if ($separator -lt 0) { continue }
        $key = $line.Substring(0, $separator).Trim()
        if ($key -notin @('home', 'executable')) { continue }
        $value = $line.Substring($separator + 1).Trim()
        if ($value.IndexOf($AdministratorPythonRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
}

Assert-HubDeploymentAdministrator
$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
$WebPayload = Get-HubDeploymentPayload -Root $PackageRoot -Name 'HubThunder-Web'
$ApiPayload = Get-HubDeploymentPayload -Root $PackageRoot -Name 'HubThunder-Api'
$BotPayload = Join-Path $PackageRoot 'DiscordBot'
$HasBotPayload = [IO.Directory]::Exists($BotPayload)

if (-not $SkipDatabaseMigration) {
    $migrationRunner = Join-Path $PackageRoot 'Migrations\HubThunder.Migrations.exe'
    if (-not [IO.File]::Exists($migrationRunner)) { throw "Package migration runner is missing: $migrationRunner" }
    & $migrationRunner --configuration-root $WebTarget
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Application files were not replaced.' }
}

$webOffline = Enter-HubApplicationOffline -ApplicationPath $WebTarget
try {
    [void](Copy-HubPayload -Source $WebPayload -Destination $WebTarget -ExcludeFiles $AppSettingsExclusions -ExcludeDirectories @('App_Data', 'logs'))
    Update-HubPublicSettings -SourcePath (Join-Path $WebPayload 'appsettings.json') -TargetRoot $WebTarget

    $venvConfig = Join-Path $PythonRoot '.venv313\pyvenv.cfg'
    if (Test-HubAdministratorVenvPath -ConfigPath $venvConfig) {
        $repairScript = Join-Path $PackageRoot 'Repair-HubThunderImageToSightRuntime.ps1'
        if (-not [IO.File]::Exists($repairScript)) { throw "Broken production venv detected but repair script is missing: $repairScript" }
        Write-Host "Broken production pyvenv.cfg detected; starting Image To Sight runtime repair."
        $repairResult = & $repairScript -PackageRoot $PackageRoot -RuntimeRoot $PythonRoot -WebRoot $WebTarget
        if ($null -eq $repairResult -or $repairResult.Result -ne 'PASS') { throw 'Image To Sight runtime repair did not return PASS.' }
        Write-Host "Image To Sight runtime repair completed: Action=$($repairResult.Action)"
    }

    if (-not [IO.File]::Exists($PythonPath)) {
        throw "Production Python runtime is missing: $PythonPath. Run Repair-HubThunderImageToSightRuntime.ps1 from this package."
    }
    [void](Set-HubImageToSightWebConfig -ConfigPath (Join-Path $WebTarget 'web.config') -PythonPath $PythonPath)
    New-Item -ItemType Directory -Force -Path $ImageToSightTemp | Out-Null
    [void](Grant-HubDeploymentAccess -Path $PythonRoot -Identity 'IIS AppPool\HubThunder-Web' -Permission RX)
    [void](Grant-HubDeploymentAccess -Path $ImageToSightTemp -Identity 'IIS AppPool\HubThunder-Web' -Permission M)
}
finally {
    Exit-HubApplicationOffline -OfflineFile $webOffline
}

$apiOffline = Enter-HubApplicationOffline -ApplicationPath $ApiTarget
try {
    [void](Copy-HubPayload -Source $ApiPayload -Destination $ApiTarget -ExcludeFiles $AppSettingsExclusions -ExcludeDirectories @('App_Data', 'logs'))
    Update-HubPublicSettings -SourcePath (Join-Path $ApiPayload 'appsettings.json') -TargetRoot $ApiTarget
}
finally {
    Exit-HubApplicationOffline -OfflineFile $apiOffline
}

if ($HasBotPayload) {
    [void](Copy-HubBotPayload -Source $BotPayload -Destination $BotTarget -ExcludeFiles @('*.db', '*.db-shm', '*.db-wal', 'appsettings*.json') -ExcludeDirectories @('logs', 'App_Data', 'imports'))
}

Write-Host "DEPLOY PASS Web=$WebTarget Api=$ApiTarget BotPayload=$HasBotPayload Python=$PythonPath" -ForegroundColor Green
$paymentsDiagnostic = Join-Path $PackageRoot 'Test-HubThunderPaymentsDeployment.ps1'
if (Test-Path -LiteralPath $paymentsDiagnostic) {
    & $paymentsDiagnostic -WebRoot $WebTarget -ApiRoot $ApiTarget -BotRoot $BotTarget
}
$sitemapDiagnostic = Join-Path $PackageRoot 'Test-HubThunderSitemap.ps1'
if (Test-Path -LiteralPath $sitemapDiagnostic) {
    try { & $sitemapDiagnostic }
    catch { Write-Warning "SEO verification failed after file deployment: $($_.Exception.Message). Run Test-HubThunderSitemap.ps1 again after checking the public site." }
}
