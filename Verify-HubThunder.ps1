[CmdletBinding()]
param([switch]$Smoke)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DeploymentHelpers.ps1')

$WebTarget = 'C:\Sites\HubThunder\Web'
$ApiTarget = 'C:\Sites\HubThunder\Api'
$BotTarget = 'C:\Services\DiscordBot'
$PythonPath = 'C:\HubThunderRuntime\Python\.venv313\Scripts\python.exe'
$ImageToSightTemp = 'C:\HubThunderData\Temp\ImageToSight'

function Show-HubDeploymentFile {
    param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][string]$Path)
    $status = if ([IO.File]::Exists($Path)) { 'PRESENT' } else { 'MISSING' }
    Write-Host "$Name=$status Path=$Path"
}

function Show-HubDeploymentDirectory {
    param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][string]$Path)
    $status = if ([IO.Directory]::Exists($Path)) { 'PRESENT' } else { 'MISSING' }
    Write-Host "$Name=$status Path=$Path"
}

Show-HubDeploymentFile -Name 'WebBinary' -Path (Join-Path $WebTarget 'HubThunder.exe')
Show-HubDeploymentFile -Name 'ApiBinary' -Path (Join-Path $ApiTarget 'HubThunder.exe')
Show-HubDeploymentFile -Name 'BotBinary' -Path (Join-Path $BotTarget 'DiscordBot.exe')
Show-HubDeploymentFile -Name 'Python' -Path $PythonPath
Show-HubDeploymentDirectory -Name 'ImageToSightTemp' -Path $ImageToSightTemp

$webConfigPath = Join-Path $WebTarget 'web.config'
if ([IO.File]::Exists($webConfigPath)) {
    try {
        [xml]$webConfig = [IO.File]::ReadAllText($webConfigPath)
        Write-Host "IMAGE_TO_SIGHT_PYTHON=$(Get-HubWebConfigValue -Config $webConfig -Name 'IMAGE_TO_SIGHT_PYTHON')"
        Write-Host "ImageToSight__PythonPath=$(Get-HubWebConfigValue -Config $webConfig -Name 'ImageToSight__PythonPath')"
    }
    catch { Write-Warning "web.config diagnostic failed: $($_.Exception.Message)" }
}
else {
    Write-Host "WebConfig=MISSING Path=$webConfigPath"
}

Write-Host 'Deploy uses app_offline.htm and does not query or control IIS infrastructure.'
if ($Smoke) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 30
        Write-Host "SmokeHTTP=$($response.StatusCode)"
    }
    catch { Write-Warning "Optional smoke is unavailable: $($_.Exception.Message)" }
}
