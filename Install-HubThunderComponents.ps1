[CmdletBinding()]
param(
    [string]$PackageRoot = $PSScriptRoot,
    [string]$RuntimeRoot = 'C:\HubThunderRuntime\Python',
    [string]$WebRoot = 'C:\Sites\HubThunder\Web',
    [string]$HostingBundlePath = '',
    [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess) {
    throw 'Use 64-bit Windows PowerShell on the Windows x64 VPS.'
}
$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$WebRoot = [IO.Path]::GetFullPath($WebRoot)
$modulePath = Join-Path $env:ProgramFiles 'IIS\Asp.Net Core Module\V2\aspnetcorev2.dll'
$iisAvailable = $null -ne (Get-Service W3SVC -ErrorAction SilentlyContinue)
$moduleReady = [IO.File]::Exists($modulePath) -and [Diagnostics.FileVersionInfo]::GetVersionInfo($modulePath).FileMajorPart -ge 18
$requiredPayload = @(
    'Repair-HubThunderImageToSightRuntime.ps1', 'DeploymentHelpers.ps1',
    'ImageToSightRuntime\Base\python.exe', 'ImageToSightRuntime\requirements.txt',
    'ImageToSightRuntime\Wheels\pillow-11.3.0-cp313-cp313-win_amd64.whl',
    'ImageToSightRuntime\Wheels\numpy-2.2.6-cp313-cp313-win_amd64.whl',
    'ImageToSightRuntime\Wheels\vtracer-0.6.15-cp313-cp313-win_amd64.whl',
    'ImageToSightRuntime\fixtures\image-to-sight-smoke.png',
    'ImageToSightRuntime\fixtures\image-to-sight-smoke.jpg',
    'ImageToSightRuntime\fixtures\image-to-sight-smoke.webp',
    'HubThunder-Web\tools\vtracer_worker.py'
)
$missing = @($requiredPayload | Where-Object { -not [IO.File]::Exists((Join-Path $PackageRoot $_)) })

if ($CheckOnly) {
    [pscustomobject]@{
        IISInstalled = $iisAvailable
        AspNetCoreModuleReady = $moduleReady
        PackageReady = $missing.Count -eq 0
        MissingPayload = $missing
        PythonPresent = [IO.File]::Exists((Join-Path $RuntimeRoot '.venv313\Scripts\python.exe'))
        RuntimeRoot = $RuntimeRoot
        BuildsSource = $false
        DeploysApplication = $false
    }
    return
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run the component installer from an elevated 64-bit PowerShell session, or use -CheckOnly.'
}
if ($missing.Count) { throw "Incomplete release package. Missing: $($missing -join ', ')" }

if (-not $iisAvailable) {
    Import-Module ServerManager -ErrorAction Stop
    $feature = Install-WindowsFeature Web-Server -IncludeManagementTools
    if (-not $feature.Success) { throw 'IIS installation failed.' }
    if ($feature.RestartNeeded -eq 'Yes') { throw 'IIS requires a Windows restart. Restart during maintenance and rerun this installer.' }
}

if (-not $moduleReady -or -not $iisAvailable) {
    if ([string]::IsNullOrWhiteSpace($HostingBundlePath)) {
        $downloadRoot = Join-Path ([IO.Path]::GetTempPath()) ('HubThunderHosting-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $downloadRoot | Out-Null
        $HostingBundlePath = Join-Path $downloadRoot 'dotnet-hosting-8.exe'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri 'https://aka.ms/dotnet/8.0/dotnet-hosting-win.exe' -OutFile $HostingBundlePath
    }
    $HostingBundlePath = [IO.Path]::GetFullPath($HostingBundlePath)
    $signature = Get-AuthenticodeSignature -LiteralPath $HostingBundlePath
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') {
        throw 'The ASP.NET Core Hosting Bundle must have a valid Microsoft Authenticode signature.'
    }
    $installer = Start-Process -FilePath $HostingBundlePath -ArgumentList '/install /quiet /norestart' -Wait -PassThru -WindowStyle Hidden
    if ($installer.ExitCode -notin @(0, 3010)) { throw "Hosting Bundle installation failed: exit code $($installer.ExitCode)." }
    if ($installer.ExitCode -eq 3010) { throw 'Hosting Bundle requires a Windows restart. Restart during maintenance and rerun this installer.' }
    if (-not [IO.File]::Exists($modulePath) -or [Diagnostics.FileVersionInfo]::GetVersionInfo($modulePath).FileMajorPart -lt 18) {
        throw 'ASP.NET Core Module V2 was not installed correctly.'
    }
}

. (Join-Path $PackageRoot 'DeploymentHelpers.ps1')
$offline = $null
$offlinePath = Join-Path $WebRoot 'app_offline.htm'
try {
    # Reuse a caller's maintenance page; remove only the page created here.
    if ([IO.Directory]::Exists($WebRoot) -and -not [IO.File]::Exists($offlinePath)) {
        $offline = Enter-HubApplicationOffline -ApplicationPath $WebRoot
    }
    $runtime = & (Join-Path $PackageRoot 'Repair-HubThunderImageToSightRuntime.ps1') `
        -PackageRoot $PackageRoot -RuntimeRoot $RuntimeRoot -WebRoot (Join-Path $PackageRoot 'HubThunder-Web')
    if ($null -eq $runtime -or $runtime.Result -ne 'PASS') { throw 'Python dependency installation or image smoke test failed.' }
}
finally {
    if ($null -ne $offline) { Exit-HubApplicationOffline -OfflineFile $offline }
}

[pscustomobject]@{
    Result = 'PASS'
    IISInstalled = $true
    AspNetCoreModuleReady = $true
    PythonAction = $runtime.Action
    Python = $runtime.VenvPython
    Pillow = $runtime.Pillow
    NumPy = $runtime.NumPy
    VTracer = $runtime.VTracer
    WorkerSmoke = $runtime.WorkerSmoke
    BuildsSource = $false
    DeploysApplication = $false
}
