[CmdletBinding()]
param(
    [string]$BaseUrl = 'https://hub-thunder.online',
    [string]$RequiredModSlug = 'peacshooter',
    [string]$SchemaDirectory = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SchemaDirectory)) { $SchemaDirectory = Join-Path $PSScriptRoot 'tests\fixtures\seo' }
$namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'
$origin = 'https://hub-thunder.online'
$schemas = [Xml.Schema.XmlSchemaSet]::new()
[void]$schemas.Add($namespace, (Join-Path $SchemaDirectory 'sitemap.xsd'))
[void]$schemas.Add($namespace, (Join-Path $SchemaDirectory 'siteindex.xsd'))
$schemas.Compile()
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

function Get-PublicResponse([string]$Url) {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 60
    if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode): $Url" }
    return $response
}

function Test-SitemapDocument([string]$Url, [bool]$AllowIndex) {
    $response = Get-PublicResponse $Url
    if ($response.Headers['Content-Type'] -notmatch '^application/xml(?:;|$)') { throw "Wrong content type: $Url" }
    if ([Text.Encoding]::UTF8.GetByteCount($response.Content) -gt 50MB) { throw "Sitemap exceeds 50 MiB: $Url" }
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $settings.ValidationType = [Xml.ValidationType]::Schema
    $settings.Schemas = $schemas
    $reader = [Xml.XmlReader]::Create([IO.StringReader]::new($response.Content), $settings)
    $document = [Xml.XmlDocument]::new()
    $document.XmlResolver = $null
    try { $document.Load($reader) } finally { $reader.Dispose() }
    if ($document.DocumentElement.NamespaceURI -ne $namespace) { throw "Invalid sitemap namespace: $Url" }
    $manager = [Xml.XmlNamespaceManager]::new($document.NameTable)
    $manager.AddNamespace('s', $namespace)
    if ($document.DocumentElement.LocalName -eq 'sitemapindex') {
        if (-not $AllowIndex) { throw 'Nested sitemap indexes are not supported.' }
        $partitions = $document.SelectNodes('/s:sitemapindex/s:sitemap/s:loc', $manager)
        if ($partitions.Count -gt 50000) { throw 'Sitemap index exceeds 50,000 entries.' }
        foreach ($partition in $partitions) {
            $address = [Uri]$partition.InnerText
            if ($address.GetLeftPart([UriPartial]::Authority) -ne $origin -or $address.AbsolutePath -notmatch '^/sitemap-[1-9][0-9]*\.xml$' -or $address.Query -or $address.Fragment) {
                throw "Unexpected sitemap partition: $address"
            }
            Test-SitemapDocument ($BaseUrl.TrimEnd('/') + $address.AbsolutePath) $false
        }
    }
    elseif ($document.DocumentElement.LocalName -eq 'urlset') {
        $locations = $document.SelectNodes('/s:urlset/s:url/s:loc', $manager)
        if ($locations.Count -gt 50000) { throw "More than 50,000 URLs: $Url" }
        foreach ($location in $locations) {
            $address = [Uri]$location.InnerText
            if ($address.GetLeftPart([UriPartial]::Authority) -ne $origin -or $address.Query -or $address.Fragment) {
                throw "Noncanonical URL: $address"
            }
            if ($address.AbsolutePath -match '^/(admin|account|profile|api|auth|login|register|health|error|_test|download|media|search|upload|culture)(/|$)' -or $address.AbsolutePath.EndsWith('/moderation-preview')) {
                throw "Technical/private URL: $address"
            }
            if (-not $seen.Add($location.InnerText)) { throw "Duplicate URL: $address" }
        }
    }
    else { throw "Invalid sitemap root: $Url" }
    Write-Host "XML PASS $Url (HTTP 200, application/xml, official XSD)"
}

Test-SitemapDocument ($BaseUrl.TrimEnd('/') + '/sitemap.xml') $true
$requiredUrl = "$origin/mods/$RequiredModSlug"
if (-not $seen.Contains($requiredUrl)) { throw "Missing published mod: $requiredUrl" }
$robots = Get-PublicResponse ($BaseUrl.TrimEnd('/') + '/robots.txt')
if ($robots.Content -notmatch '(?m)^Sitemap: https://hub-thunder\.online/sitemap\.xml\s*$') { throw 'Missing robots.txt sitemap directive.' }
[void](Get-PublicResponse ($BaseUrl.TrimEnd('/') + '/mods/' + $RequiredModSlug))
Write-Host "SITEMAP PASS URLs=$($seen.Count) Mod=$requiredUrl robots.txt=PASS"
