[CmdletBinding()]
param(
    [string]$PackageRoot = $PSScriptRoot,
    [string]$RuntimeRoot = 'C:\HubThunderRuntime\Python',
    [string]$WebRoot = 'C:\Sites\HubThunder\Web'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedPythonVersion = 'Python 3.13.13'
$ExpectedPillowVersion = '11.3.0'
$ExpectedNumPyVersion = '2.2.6'
$ExpectedVTracerVersion = '0.6.15'
$AdministratorPythonRoot = 'C:\Users\Administrator\AppData\Local\Programs\Python'

function ConvertTo-HubWindowsCommandLineArgument {
    param([AllowNull()][string]$Value)

    if ($null -eq $Value -or $Value.Length -eq 0) { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\\"')
    $escaped = [regex]::Replace($escaped, '(\\*)$', '$1$1')
    return '"' + $escaped + '"'
}

function Invoke-HubRuntimeProcess {
    param(
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Stage,
        [string]$WorkingDirectory = ''
    )

    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Executable
    $start.Arguments = (($Arguments | ForEach-Object { ConvertTo-HubWindowsCommandLineArgument ([string]$_) }) -join ' ')
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.CreateNoWindow = $true
    if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) { $start.WorkingDirectory = $WorkingDirectory }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    if (-not $process.Start()) { throw "Could not start ${Stage}: $Executable" }
    try {
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        return [pscustomobject]@{
            Stage = $Stage
            ExitCode = [int]$process.ExitCode
            Stdout = $stdoutTask.GetAwaiter().GetResult().Trim()
            Stderr = $stderrTask.GetAwaiter().GetResult().Trim()
        }
    }
    finally { $process.Dispose() }
}

function Assert-HubRuntimeProcessSuccess {
    param([Parameter(Mandatory)][pscustomobject]$Result)

    if ($Result.ExitCode -ne 0) {
        $output = ((@($Result.Stdout, $Result.Stderr) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join [Environment]::NewLine)
        throw "Image To Sight runtime stage failed: $($Result.Stage). ExitCode=$($Result.ExitCode) Output=$output"
    }
    return $Result
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

function Get-HubRuntimeState {
    param(
        [Parameter(Mandatory)][string]$BasePython,
        [Parameter(Mandatory)][string]$VenvPython,
        [Parameter(Mandatory)][string]$VenvConfig
    )

    $baseVersion = $null
    if ([IO.File]::Exists($BasePython)) {
        $baseVersion = Invoke-HubRuntimeProcess -Executable $BasePython -Arguments @('--version') -Stage 'production base Python version'
    }
    $baseHealthy = $null -ne $baseVersion -and $baseVersion.ExitCode -eq 0 -and $baseVersion.Stdout -eq $ExpectedPythonVersion

    $config = Get-HubVenvConfigValues -ConfigPath $VenvConfig
    $venvHome = if ($config.ContainsKey('home')) { [string]$config['home'] } else { '' }
    $executable = if ($config.ContainsKey('executable')) { [string]$config['executable'] } else { '' }
    $administratorPathDetected = $venvHome.IndexOf($AdministratorPythonRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $executable.IndexOf($AdministratorPythonRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
    $metadataHealthy = [IO.File]::Exists($VenvConfig) -and
        -not $administratorPathDetected -and
        (Test-HubPathEquals -Actual $venvHome -Expected (Split-Path -Parent $BasePython)) -and
        (Test-HubPathEquals -Actual $executable -Expected $BasePython)

    $venvVersion = $null
    $dependencies = $null
    if ([IO.File]::Exists($VenvPython) -and $metadataHealthy) {
        $venvVersion = Invoke-HubRuntimeProcess -Executable $VenvPython -Arguments @('--version') -Stage 'production venv Python version'
        if ($venvVersion.ExitCode -eq 0 -and $venvVersion.Stdout -eq $ExpectedPythonVersion) {
            $dependencyCode = 'import sys, PIL, numpy, vtracer; from importlib.metadata import version; print(''sys.executable='' + sys.executable); print(''Pillow='' + PIL.__version__); print(''NumPy='' + numpy.__version__); print(''VTracer='' + version(''vtracer''))'
            $dependencies = Invoke-HubRuntimeProcess -Executable $VenvPython -Arguments @('-c', $dependencyCode) -Stage 'production venv dependency imports'
        }
    }
    $dependenciesHealthy = $null -ne $dependencies -and $dependencies.ExitCode -eq 0 -and
        $dependencies.Stdout.Contains("Pillow=$ExpectedPillowVersion") -and
        $dependencies.Stdout.Contains("NumPy=$ExpectedNumPyVersion") -and
        $dependencies.Stdout.Contains("VTracer=$ExpectedVTracerVersion")
    $venvHealthy = $metadataHealthy -and $null -ne $venvVersion -and $venvVersion.ExitCode -eq 0 -and
        $venvVersion.Stdout -eq $ExpectedPythonVersion -and $dependenciesHealthy

    return [pscustomobject]@{
        BaseHealthy = $baseHealthy
        BaseVersion = $baseVersion
        VenvHealthy = $venvHealthy
        VenvVersion = $venvVersion
        Dependencies = $dependencies
        VenvHome = if ($venvHome) { $venvHome } else { '<missing>' }
        VenvExecutable = if ($executable) { $executable } else { '<missing>' }
        AdministratorPathDetected = $administratorPathDetected
    }
}

function Install-HubBundledBasePython {
    param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$Destination)

    if (-not [IO.Directory]::Exists($Source)) { throw "Bundled production base Python is missing: $Source" }
    if ([IO.Directory]::Exists($Destination)) { throw "Production base Python directory already exists but is not usable: $Destination. It was not changed." }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    & robocopy.exe $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Bundled production base Python copy failed: Source=$Source Destination=$Destination ExitCode=$LASTEXITCODE" }
}

function Remove-HubVenvOnly {
    param([Parameter(Mandatory)][string]$RuntimeRoot, [Parameter(Mandatory)][string]$VenvPath)

    $expectedVenvPath = Join-Path $RuntimeRoot '.venv313'
    if (-not (Test-HubPathEquals -Actual $VenvPath -Expected $expectedVenvPath)) {
        throw "Refusing to remove an unexpected venv path: $VenvPath"
    }
    if ([IO.Directory]::Exists($VenvPath)) {
        Write-Host "Removing only the Image To Sight venv: $VenvPath"
        Remove-Item -LiteralPath $VenvPath -Recurse -Force
    }
}

function Test-HubWorker {
    param(
        [Parameter(Mandatory)][string]$Python,
        [Parameter(Mandatory)][string]$Worker,
        [Parameter(Mandatory)][string]$FixtureRoot
    )

    if (-not [IO.File]::Exists($Worker)) { throw "Image To Sight worker is missing: $Worker" }
    $fixtureNames = @('image-to-sight-smoke.png', 'image-to-sight-smoke.jpg', 'image-to-sight-smoke.webp')
    $probeRoot = Join-Path ([IO.Path]::GetTempPath()) ('HubThunderImageToSightRuntime-' + [guid]::NewGuid().ToString('N'))
    $results = [Collections.Generic.List[object]]::new()
    try {
        New-Item -ItemType Directory -Force -Path $probeRoot | Out-Null
        foreach ($fixtureName in $fixtureNames) {
            $fixture = Join-Path $FixtureRoot $fixtureName
            if (-not [IO.File]::Exists($fixture)) { throw "Bundled Image To Sight fixture is missing: $fixture" }
            $input = Join-Path $probeRoot $fixtureName
            $output = Join-Path $probeRoot ($fixtureName + '.json')
            Copy-Item -LiteralPath $fixture -Destination $input -Force
            $result = Invoke-HubRuntimeProcess -Executable $Python -WorkingDirectory (Split-Path -Parent $Worker) -Stage "Image To Sight worker $fixtureName" -Arguments @(
                $Worker, '--input', $input, '--output', $output,
                '--scale', '25', '--detail', '60', '--threshold', '128',
                '--max-objects', '2500', '--max-lines', '2500', '--line-weight', '1',
                '--n-segments', '12', '--mode', 'line-art'
            )
            Assert-HubRuntimeProcessSuccess -Result $result | Out-Null
            $svg = [IO.Path]::ChangeExtension($output, '.svg')
            if (-not [IO.File]::Exists($output) -or (Get-Item -LiteralPath $output).Length -eq 0) { throw "Worker produced no JSON: $output" }
            if (-not [IO.File]::Exists($svg) -or (Get-Item -LiteralPath $svg).Length -eq 0) { throw "Worker produced no SVG: $svg" }
            $results.Add([pscustomobject]@{ Fixture = $fixtureName; ExitCode = $result.ExitCode; JsonExists = $true; SvgExists = $true })
        }
        return @($results)
    }
    finally {
        if ([IO.Directory]::Exists($probeRoot)) { Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$WebRoot = [IO.Path]::GetFullPath($WebRoot)
$RuntimePayload = Join-Path $PackageRoot 'ImageToSightRuntime'
$BundledBase = Join-Path $RuntimePayload 'Base'
$BundledWheels = Join-Path $RuntimePayload 'Wheels'
$BundledRequirements = Join-Path $RuntimePayload 'requirements.txt'
$BundledFixtures = Join-Path $RuntimePayload 'fixtures'
$BasePython = Join-Path $RuntimeRoot 'base\python.exe'
$VenvPath = Join-Path $RuntimeRoot '.venv313'
$VenvPython = Join-Path $VenvPath 'Scripts\python.exe'
$VenvConfig = Join-Path $VenvPath 'pyvenv.cfg'
$Worker = Join-Path $WebRoot 'tools\vtracer_worker.py'

if (-not [IO.Directory]::Exists($RuntimeRoot)) {
    Write-Host "Creating missing production runtime root: $RuntimeRoot"
    New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
}

$before = Get-HubRuntimeState -BasePython $BasePython -VenvPython $VenvPython -VenvConfig $VenvConfig
$action = 'ReusedValidVenv'
if (-not $before.BaseHealthy) {
    $baseDirectory = Split-Path -Parent $BasePython
    if ([IO.Directory]::Exists($baseDirectory)) {
        throw "Production base Python is not runnable at $BasePython. The existing base directory was not changed; repair it explicitly before replacing the venv."
    }
    Write-Host "Provisioning production-local base Python from package payload: $BasePython"
    Install-HubBundledBasePython -Source $BundledBase -Destination $baseDirectory
    $action = 'InstalledBase'
}

$afterBase = Get-HubRuntimeState -BasePython $BasePython -VenvPython $VenvPython -VenvConfig $VenvConfig
if (-not $afterBase.BaseHealthy) {
    $actual = if ($null -eq $afterBase.BaseVersion) { '<not executable>' } else { "$($afterBase.BaseVersion.Stdout) $($afterBase.BaseVersion.Stderr)".Trim() }
    throw "Production base Python validation failed. Path=$BasePython Expected=$ExpectedPythonVersion Actual=$actual"
}

if (-not $afterBase.VenvHealthy) {
    if (-not [IO.Directory]::Exists($BundledWheels)) { throw "Bundled wheelhouse is missing: $BundledWheels" }
    if (-not [IO.File]::Exists($BundledRequirements)) { throw "Bundled requirements.txt is missing: $BundledRequirements" }
    Remove-HubVenvOnly -RuntimeRoot $RuntimeRoot -VenvPath $VenvPath
    Assert-HubRuntimeProcessSuccess -Result (Invoke-HubRuntimeProcess -Executable $BasePython -Arguments @('-m', 'venv', $VenvPath) -Stage 'create production venv') | Out-Null
    Assert-HubRuntimeProcessSuccess -Result (Invoke-HubRuntimeProcess -Executable $VenvPython -Arguments @('-m', 'pip', 'install', '--disable-pip-version-check', '--no-index', '--find-links', $BundledWheels, '--requirement', $BundledRequirements) -Stage 'install bundled Image To Sight requirements') | Out-Null
    $action = if ($action -eq 'InstalledBase') { 'InstalledBaseAndRecreatedVenv' } else { 'RecreatedBrokenOrInvalidVenv' }
}

$after = Get-HubRuntimeState -BasePython $BasePython -VenvPython $VenvPython -VenvConfig $VenvConfig
if (-not $after.VenvHealthy -or $after.AdministratorPathDetected) {
    $venvDetails = if ($null -eq $after.VenvVersion) { '<not run>' } else { "ExitCode=$($after.VenvVersion.ExitCode) Stdout=$($after.VenvVersion.Stdout) Stderr=$($after.VenvVersion.Stderr)" }
    $dependencyDetails = if ($null -eq $after.Dependencies) { '<not run>' } else { "ExitCode=$($after.Dependencies.ExitCode) Stdout=$($after.Dependencies.Stdout) Stderr=$($after.Dependencies.Stderr)" }
    throw "Image To Sight runtime validation failed. BaseHealthy=$($after.BaseHealthy) VenvHealthy=$($after.VenvHealthy) BasePython=$BasePython VenvPython=$VenvPython VenvHome=$($after.VenvHome) VenvExecutable=$($after.VenvExecutable) AdministratorPathDetected=$($after.AdministratorPathDetected) VenvVersion=[$venvDetails] Dependencies=[$dependencyDetails]"
}

$workerResults = Test-HubWorker -Python $VenvPython -Worker $Worker -FixtureRoot $BundledFixtures
$pyvenvConfigText = [IO.File]::ReadAllText($VenvConfig).Trim()
Write-Host "Image To Sight runtime Action=$action BasePython=$BasePython VenvPython=$VenvPython"
Write-Host "pyvenv.cfg:`n$pyvenvConfigText"

[pscustomobject]@{
    Result = 'PASS'
    Action = $action
    BasePython = $BasePython
    BasePythonVersion = $after.BaseVersion.Stdout
    VenvPython = $VenvPython
    VenvVersion = $after.VenvVersion.Stdout
    VenvConfig = $VenvConfig
    VenvHome = $after.VenvHome
    VenvExecutable = $after.VenvExecutable
    AdministratorPathDetected = $after.AdministratorPathDetected
    Pillow = $ExpectedPillowVersion
    NumPy = $ExpectedNumPyVersion
    VTracer = $ExpectedVTracerVersion
    WorkerSmoke = $workerResults
}
