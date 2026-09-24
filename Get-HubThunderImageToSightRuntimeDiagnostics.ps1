[CmdletBinding()]
param([string]$RuntimeRoot = 'C:\HubThunderRuntime\Python')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedPythonVersion = 'Python 3.13.13'
$AdministratorPythonRoot = 'C:\Users\Administrator\AppData\Local\Programs\Python'

function ConvertTo-HubWindowsCommandLineArgument {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value -or $Value.Length -eq 0) { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\\"')
    $escaped = [regex]::Replace($escaped, '(\\*)$', '$1$1')
    return '"' + $escaped + '"'
}

function Invoke-HubReadOnlyPython {
    param([Parameter(Mandatory)][string]$Executable, [Parameter(Mandatory)][string[]]$Arguments)

    if (-not [IO.File]::Exists($Executable)) { return [pscustomobject]@{ ExitCode = -1; Stdout = ''; Stderr = 'executable missing' } }
    try {
        $start = [Diagnostics.ProcessStartInfo]::new()
        $start.FileName = $Executable
        $start.Arguments = (($Arguments | ForEach-Object { ConvertTo-HubWindowsCommandLineArgument ([string]$_) }) -join ' ')
        $start.UseShellExecute = $false
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        $start.CreateNoWindow = $true
        $process = [Diagnostics.Process]::new()
        $process.StartInfo = $start
        if (-not $process.Start()) { return [pscustomobject]@{ ExitCode = -1; Stdout = ''; Stderr = 'process did not start' } }
        try {
            $stdout = $process.StandardOutput.ReadToEndAsync()
            $stderr = $process.StandardError.ReadToEndAsync()
            $process.WaitForExit()
            return [pscustomobject]@{ ExitCode = [int]$process.ExitCode; Stdout = $stdout.GetAwaiter().GetResult().Trim(); Stderr = $stderr.GetAwaiter().GetResult().Trim() }
        }
        finally { $process.Dispose() }
    }
    catch { return [pscustomobject]@{ ExitCode = -1; Stdout = ''; Stderr = $_.Exception.Message } }
}

function Get-HubVenvConfigValues {
    param([Parameter(Mandatory)][string]$ConfigPath)
    $values = @{}
    if (-not [IO.File]::Exists($ConfigPath)) { return $values }
    foreach ($line in [IO.File]::ReadLines($ConfigPath)) {
        $separator = $line.IndexOf('=')
        if ($separator -lt 0) { continue }
        $key = $line.Substring(0, $separator).Trim()
        if ($key.Length -gt 0) { $values[$key] = $line.Substring($separator + 1).Trim() }
    }
    return $values
}

function Test-HubPathEquals {
    param([string]$Actual, [string]$Expected)
    if ([string]::IsNullOrWhiteSpace($Actual) -or [string]::IsNullOrWhiteSpace($Expected)) { return $false }
    if ($null -eq ('HubThunderRuntimeNativePath' -as [type])) {
        Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public static class HubThunderRuntimeNativePath { [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern uint GetLongPathName(string shortPath, StringBuilder longPath, int cchBuffer); }'
    }
    $actualPath = [IO.Path]::GetFullPath($Actual)
    $expectedPath = [IO.Path]::GetFullPath($Expected)
    foreach ($candidate in @(@{ Name = 'actualPath'; Value = $actualPath }, @{ Name = 'expectedPath'; Value = $expectedPath })) {
        $buffer = [Text.StringBuilder]::new(32768)
        $length = [HubThunderRuntimeNativePath]::GetLongPathName($candidate.Value, $buffer, $buffer.Capacity)
        if ($length -gt 0 -and $length -lt $buffer.Capacity) { Set-Variable -Name $candidate.Name -Value $buffer.ToString() }
    }
    return $actualPath.TrimEnd([char[]]@('\', '/')).Equals($expectedPath.TrimEnd([char[]]@('\', '/')), [StringComparison]::OrdinalIgnoreCase)
}

$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$basePython = Join-Path $RuntimeRoot 'base\python.exe'
$venvPath = Join-Path $RuntimeRoot '.venv313'
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
$venvConfig = Join-Path $venvPath 'pyvenv.cfg'
$config = Get-HubVenvConfigValues -ConfigPath $venvConfig
$venvHome = if ($config.ContainsKey('home')) { [string]$config['home'] } else { '<missing>' }
$venvExecutable = if ($config.ContainsKey('executable')) { [string]$config['executable'] } else { '<missing>' }
$configText = if ([IO.File]::Exists($venvConfig)) { [IO.File]::ReadAllText($venvConfig).Trim() } else { '<missing>' }
$administratorPathDetected = $venvHome.IndexOf($AdministratorPythonRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
    $venvExecutable.IndexOf($AdministratorPythonRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
$baseVersion = Invoke-HubReadOnlyPython -Executable $basePython -Arguments @('--version')
$venvVersion = Invoke-HubReadOnlyPython -Executable $venvPython -Arguments @('--version')
$probeCode = 'import json,sys; import PIL,numpy,vtracer; from importlib.metadata import version; print(json.dumps({''sys.executable'':sys.executable,''sys.prefix'':sys.prefix,''sys.base_prefix'':sys.base_prefix,''Pillow'':PIL.__version__,''NumPy'':numpy.__version__,''VTracer'':version(''vtracer'')}))'
$probe = Invoke-HubReadOnlyPython -Executable $venvPython -Arguments @('-c', $probeCode)
$probeData = $null
if ($probe.ExitCode -eq 0) { try { $probeData = $probe.Stdout | ConvertFrom-Json } catch { } }
$metadataValid = $venvHome -ne '<missing>' -and $venvExecutable -ne '<missing>' -and
    (Test-HubPathEquals -Actual $venvHome -Expected (Split-Path -Parent $basePython)) -and
    (Test-HubPathEquals -Actual $venvExecutable -Expected $basePython)
$runtimeValid = $metadataValid -and $baseVersion.ExitCode -eq 0 -and $baseVersion.Stdout -eq $ExpectedPythonVersion -and
    $venvVersion.ExitCode -eq 0 -and $venvVersion.Stdout -eq $ExpectedPythonVersion -and $null -ne $probeData
$productionVenv = if ($administratorPathDetected) { 'BROKEN' } elseif ($runtimeValid) { 'VALID' } elseif (-not [IO.File]::Exists($venvConfig)) { 'MISSING' } else { 'INVALID' }

[pscustomobject]@{
    RuntimeRoot = $RuntimeRoot
    BasePython = $basePython
    BasePythonVersion = if ($baseVersion.ExitCode -eq 0) { $baseVersion.Stdout } else { "<unavailable:$($baseVersion.ExitCode)> $($baseVersion.Stderr)".Trim() }
    VenvPython = $venvPython
    VenvPythonVersion = if ($venvVersion.ExitCode -eq 0) { $venvVersion.Stdout } else { "<unavailable:$($venvVersion.ExitCode)> $($venvVersion.Stderr)".Trim() }
    PyVenvCfg = $venvConfig
    PyVenvCfgContent = $configText
    PyVenvHome = $venvHome
    PyVenvExecutable = $venvExecutable
    SysExecutable = if ($null -ne $probeData) { $probeData.'sys.executable' } else { '<unavailable>' }
    SysPrefix = if ($null -ne $probeData) { $probeData.'sys.prefix' } else { '<unavailable>' }
    SysBasePrefix = if ($null -ne $probeData) { $probeData.'sys.base_prefix' } else { '<unavailable>' }
    Pillow = if ($null -ne $probeData) { $probeData.Pillow } else { '<unavailable>' }
    NumPy = if ($null -ne $probeData) { $probeData.NumPy } else { '<unavailable>' }
    VTracer = if ($null -ne $probeData) { $probeData.VTracer } else { '<unavailable>' }
    AdministratorPathDetected = $administratorPathDetected
    ProductionVenv = $productionVenv
} | ConvertTo-Json -Depth 4
