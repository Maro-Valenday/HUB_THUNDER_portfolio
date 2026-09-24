Set-StrictMode -Version Latest

function Update-HubPublicSettings {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$TargetRoot
    )

    $source = [IO.File]::ReadAllText($SourcePath) | ConvertFrom-Json
    $expectedWeights = @{ 'ru:SOCPUBLIC' = 25; 'ru:UeBot' = 25; 'ru:Nodule' = 25; 'ru:LIS SKINS' = 25; 'foreign:LIS SKINS' = 100 }
    $campaigns = @($source.CatalogAdvertising.Campaigns)
    if ($campaigns.Count -ne $expectedWeights.Count) {
        throw 'The public settings payload must contain four equal RU campaigns and foreign LIS SKINS only.'
    }
    $seen = @{}
    foreach ($campaign in $campaigns) {
        $audience = if ($campaign.PSObject.Properties['Audience']) { $campaign.Audience } else { 'ru' }
        $key = "$($audience):$($campaign.Name)"
        if (-not $expectedWeights.ContainsKey($key) -or $seen.ContainsKey($key) -or $campaign.Weight -ne $expectedWeights[$key]) {
            throw 'The public settings payload does not match the approved advertiser weights.'
        }
        $seen[$key] = $true
        if ($campaign.Name -eq 'LIS SKINS') {
            $banner = if ($audience -eq 'ru') { '07eefd23-1d55-41a0-a3e3-f6a28ff24a92.png' } else { '5a9a3d9a-5817-4b16-b240-495e136331ed.png' }
            if ($campaign.Directory -ne 'LIS_SKINS' -or $campaign.PrimaryBanner -ne $banner -or
                $campaign.TargetUrl -ne 'https://lis-skins.com/?rf=1794687') { throw 'Unexpected LIS SKINS banner language or URL.' }
        }
        if ($campaign.Directory -in @('.', '..') -or $campaign.Directory -ne [IO.Path]::GetFileName($campaign.Directory) -or
            $campaign.PrimaryBanner -ne [IO.Path]::GetFileName($campaign.PrimaryBanner) -or
            -not [IO.File]::Exists((Join-Path (Split-Path -Parent $SourcePath) "AD\$($campaign.Directory)\$($campaign.PrimaryBanner)"))) {
            throw "The configured primary AD banner is missing or invalid: $($campaign.Name)"
        }
    }
    if ($source.Premium.PatreonUrl -ne 'https://www.patreon.com/cw/N1ckLanN') { throw 'Unexpected Patreon URL in public settings payload.' }

    # Validate every JSON file before writing any of them. Preserve secrets and unrelated settings.
    $changes = @()
    foreach ($file in Get-ChildItem -LiteralPath $TargetRoot -Filter 'appsettings*.json' -File) {
        $settings = [IO.File]::ReadAllText($file.FullName) | ConvertFrom-Json
        foreach ($section in @('Premium', 'CatalogAdvertising')) {
            if ($null -eq $settings.PSObject.Properties[$section] -or $null -eq $settings.$section) {
                $settings | Add-Member -NotePropertyName $section -NotePropertyValue ([pscustomobject]@{}) -Force
            }
        }
        $settings.Premium | Add-Member -NotePropertyName PatreonUrl -NotePropertyValue $source.Premium.PatreonUrl -Force
        $settings.CatalogAdvertising | Add-Member -NotePropertyName Campaigns -NotePropertyValue $campaigns -Force
        $settings.CatalogAdvertising | Add-Member -NotePropertyName AdEnabled -NotePropertyValue $true -Force
        $changes += [pscustomobject]@{ Path = $file.FullName; Json = ($settings | ConvertTo-Json -Depth 100) }
    }
    if ($changes.Count -eq 0) { throw "Existing appsettings configuration is missing: $TargetRoot" }
    $backupRoot = Join-Path $TargetRoot ('App_Data\deployment-backups\' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    foreach ($change in $changes) {
        $temporary = $change.Path + '.pending'
        try {
            [IO.File]::WriteAllText($temporary, $change.Json, [Text.UTF8Encoding]::new($false))
            [IO.File]::Replace($temporary, $change.Path, (Join-Path $backupRoot ([IO.Path]::GetFileName($change.Path))))
        }
        finally { if ([IO.File]::Exists($temporary)) { Remove-Item -LiteralPath $temporary -Force } }
    }
    Write-Host "Public settings updated: Patreon, four equal RU campaigns and foreign LIS SKINS. Backup=$backupRoot"
}
