# Hub Thunder: SEO, Draw, payments and views

This report supersedes the production observations in the earlier September 14
payment and API audit reports. No remote deployment was performed. The release
uses the existing Windows VPS installer, with no SSH or WinRM integration.

## Production observations

- `https://hub-thunder.online/sitemap.xml`: HTTP 200, `application/xml`, valid
  official Sitemap XSD, 32 unique URLs, including `/mods/peacshooter`.
- `https://hub-thunder.online/robots.txt`: HTTP 200 and the canonical Sitemap line.
- `/mods/peacshooter`: HTTP 200 without login, server-rendered content, correct
  canonical, no noindex. The deployed version still has an empty description and
  a short title; the new release supplies dynamic metadata and related links.
- A browser navigation to that deployed page showed Views=1, then Views=1 on
  refresh; Downloads=8. A missing increment could not be reproduced in that
  navigation. Admin views and repeated guest requests from the same IP are
  deliberately filtered by the existing implementation.
- Anonymous create and order-status requests return 401 on both Web and Api.
  An unsigned IPN returns 401 `invalid_signature`, without a login redirect.
  Public HTTPS certificate validation succeeded. The earlier 404/405/API routing
  observations are no longer current.
- These requests establish external HTTP reachability, not a successful real
  purchase or the exact IIS/tunnel port. Those require the VPS diagnostic and an
  authenticated checkout with the configured merchant credentials.

## Payments

The confirmed code defect was a single frontend message that blamed Discord for
every checkout failure, including provider/configuration/database failures. It
has been replaced with specific localized messages and a safe error code/trace
reference. The actual cause of the reported production purchase rejection cannot
be identified without that response or the corresponding server log.

Membership checking remains mandatory. Existing `DiscordAccounts` data, supplied
by OAuth and the existing Bot synchronization, maps the website user to Discord.
Missing mapping and nonmembership now return distinct 403 errors. Web does not
create a second Discord client or assume membership from an email address.

Provider HTTP 401/403, 429, other 4xx, transport/5xx failures and database errors
have distinct diagnostics. Logs contain order/user/HTTP/error-type/trace data,
not API keys, IPN secrets or raw provider bodies. Configuration values are trimmed.
The deployment diagnostic also compares Web/Api/Bot guild and Premium role
settings, reporting only presence and equality.

The existing dynamic invoice, order ownership, signature and Premium mechanisms
are retained. Only verified `finished` payments activate Premium. The server
checks the provider payment against the saved order, invoice, amount and currency,
adds exactly 30 days from max(now, existing expiration), and records activation in
the existing operation ledger. Repeated callbacks do not extend the term again.
Discord role failures retain the paid term and use the existing durable retry.

Endpoints remain:

- `POST /api/payments/nowpayments/create`: authentication and antiforgery required.
- `GET /api/payments/nowpayments/orders/{orderId}`: only the owning user.
- `POST /api/payments/nowpayments/ipn`: anonymous, signature required, no CSRF.

Checkout uses same-origin Web cookies; it does not require cross-origin browser
cookies or new CORS permissions. The IPN URL remains on `api.hub-thunder.online`.
Current official NOWPayments invoice documentation was checked, including
`order_id`, invoice response, success/cancel/partially-paid URLs and status names:
https://documenter.getpostman.com/view/7907941/2s93JusNJt

## Views

`Mod.ViewsCount`, `ModViewVisits`, `ModViewService` and the existing profile SUM
are reused. The detail handler records eligible page navigations even when a
published page displays an access gate. The full-mod/API/list/download paths do
not independently count views. View/download increments do not notify IndexNow.

The cooldown is 30 minutes, with user ID for signed-in users and salted, hashed
normalized IP for guests. Admin, obvious bot, HEAD, AJAX/fetch and prefetch requests
are excluded. Different signed-in users count independently. Guests sharing one
public IP share a cooldown; this is an intentional limitation of the lightweight
existing mechanism, not a claim of exact unique-human analytics.

SQL Server locks the mod row, increments the counter atomically and commits the
cooldown record in the same transaction. A migration test upgraded a pre-views
record to Views=0 while preserving Downloads=42. Concurrent same-visitor and
different-visitor tests passed. There is no new tracking endpoint or JS request.

Views appear beside Downloads on the detail page, on shared catalog/author cards,
and in the profile as Total mod views. Cards use the existing loaded `Mod` data.
Profile totals use SQL `SUM(ViewsCount)` filtered by the author's ID, with zero for
an empty set; another author's mods are excluded.

## Draw

Editor Elements remain separate and editable. The existing inspector Elements
list remains. The new compact band above the canvas shows both Elements and
BLK Objects, with separate localized tooltips. No Elements are merged or removed.

BLK Objects are counted by running the existing `BlkWriter` and parsing its actual
output with `BlkDocumentCodec`. The counter counts native line/circle/quad/text
records (including supported retained native records and direct drawQuad), not
metadata, block containers, coordinates or the length of `Elements`. Brush,
Hatch, Fill, shapes and polylines are expanded by the same exporter used to save
BLK. Counts are debounced by 250 ms, ignore stale responses, and update with undo,
redo, edits and imports. Export returns a count from the actual generated file in
`X-BLK-Object-Count`.

At 2200 the count warns; at 2500 and above it shows the stronger warning. Neither
editing nor export is blocked at 2500. Existing resource limits for extreme
100,000-primitive documents remain. Notification grid rows reserve space so a
late count response cannot move the canvas while the next stroke is being drawn.

Optimize is manual. Each Brush centerline is simplified using the existing
Clipper Ramer-Douglas-Peucker implementation. Stroke endpoints, width, element ID,
game fields, metadata and other Elements are retained. Candidate outlines must
preserve the number of contours, change at most 1.5% of stroke area and lose at
most 1% of original area. A candidate is accepted only if the complete exported
BLK has fewer objects. No improvement produces no history entry. Accepted results
use existing history, JSON persistence and embedded BLK editor metadata.

Measured examples:

| Example | Before | After | Reduction | Outline difference |
| --- | ---: | ---: | ---: | ---: |
| Nearly straight sampled Brush plus two Elements | 429 | 29 | 93.2% | 0.6891% |
| Curved sampled Brush plus two Elements | 2339 | 240 | 89.7% | 0.8942% |
| Browser curved Brush plus one circle | 2336 | 237 | 89.9% | 0.8942% |

The enlarged browser canvas had about 1.11% changed silhouette pixels on desktop
and 1.03% on mobile. These are measured fixture results, not guaranteed reduction
ratios for every drawing. Small edge details can change. Undo/redo and optimized
JSON/BLK reimport were checked. Brush has a one-time dismissible warning per page.

New Draw endpoints: `POST /tools/draw/blk-metrics` and
`POST /tools/draw/optimize`, using existing document parsing and validation.

## SEO and IndexNow

The existing database-backed Sitemap is extended, not replaced with a hand-built
XML list. It includes home, real tools, guides, category catalogs, approved and
published unrestricted SFW mods, and authors with such public mods. Pending,
deleted, private, Premium-gated/NSFW-gated and technical pages are excluded.
The exclusion matches noindex on gated pages whose main content requires access.
URL count/byte limits automatically switch to a Sitemap Index at 50,000 URLs or
50 MiB. URLs are absolute canonical HTTPS URLs and duplicates are removed.

IndexNow notifications are saved with mod mutations in an SQL outbox. Publishing,
updating content/images/files/tags, renaming, unpublishing and deleting enqueue
the appropriate old/new canonical URL. The background worker claims batches of
100, posts outside the SQL transaction, and retries failed submissions with
backoff. A provider outage does not roll back publication. HTTP 200/202 clears
the accepted batch. Without a configured key, queued work waits without HTTP.

The official protocol is used: https://www.indexnow.org/documentation
POST `https://api.indexnow.org/indexnow` with host, key, keyLocation and urlList.
`/indexnow-key.txt` serves the configured key as required by IndexNow verification;
it is intentionally public and is not a payment/Discord credential.

Internal navigation uses home -> existing Sights/Camouflages catalog -> mod,
category breadcrumbs, existing author links, and up to four public same-category
mods on each detail page. Pagination remains crawlable via ordinary links. No
artificial content or Google submission services were added.

Mod titles/descriptions are localized and use real names/content types. Empty
descriptions get a name/type fallback, with no invented variants or attributes.
Canonical and OG URLs use the stored slug; OG images use the actual existing
preview URL. JSON-LD uses CreativeWork with real name/description/author/image/URL
and no fabricated reviews or ratings. Main text/metadata/links work without JS.

New migration: `20260914170714_AddIndexNowNotifications` and its Designer/snapshot.
Earlier payment/views migrations remain in the deployment chain:
`20260914123616_AddPremiumPayments`, `20260914133122_AddModViews`.

## Verification

- Debug build: PASS, zero warnings/errors, isolated output to avoid an existing
  local application's locked Debug executable.
- Release Web and Bot builds: PASS, zero warnings/errors.
- `dotnet test -c Release --no-build`: exit 0. There is no framework-discovered
  .NET unit-test project; the console regressions below were run explicitly.
- PaymentsSmoke: PASS on EF InMemory and actual SQL Server, including concurrency,
  signature fixtures, invalid fields, membership, provider failures and role retry.
- ModViewsSmoke: PASS on EF InMemory and actual SQL Server, including migration,
  cooldown, concurrent increments, filters, author SUM, edit/delete and downloads.
- IndexingSmoke: PASS on EF InMemory and actual SQL Server, including publish,
  slug changes, file/image changes, gates, delete, failure, backoff and retry.
- DrawBlkSmoke: PASS, exact counts, import/export, optimization and identity.
- SitemapSmoke: PASS, official XSD, 50,000/50,001 URL and 50 MiB boundaries, live
  database partition endpoints, XML escaping and the fetched production sitemap.
- Focused new Playwright tests: 8/8 PASS (SEO without JS, Draw, RU/EN, desktop/mobile).
- Existing Bot import queue self-test: PASS.
- Full Playwright: 252/252 PASS, zero skipped, unexpected or flaky tests.
- Published Web payload: 19/19 PASS for Draw metrics/strokes, SEO, views and
  NOWPayments workflows; desktop/mobile screenshots and pixel checks passed.
- Published Api payload: 8/8 deployment route checks PASS, including signed empty
  IPN rejection and verification that diagnostics do not print credentials.
- Deployment acceptance: PASS for fresh/broken/valid Python runtime, Image To
  Sight HTTP/browser checks and the existing installer preservation simulation.
- Self-contained Windows x64 publish: PASS for Web, Api, Bot and MigrationRunner.
  Their shared application DLL hashes match the full-suite-tested assembly.
  Published CSS/JS and deployment diagnostic scripts match source; migration SQL
  includes the IndexNow migration. Published credential settings are empty.
- Release artifact: `HubThunder-VPS-win-x64-2026.09.14.9.zip`, with package marker
  `2026.09.14.9`. The autonomous builder's payload and ZIP checks passed.

Machine-readable results are in `.tmp/full-suite-results.json` and
`.tmp/targeted-suite-results.json`. Browser artifacts include
`tests/artifacts/seo-peacshooter-en.png`, `seo-peacshooter-ru.png`, localized
mod/profile views screenshots, and Draw Optimize before/after screenshots under
`tests/artifacts/test-results/draw-blk-metrics-*`.

All SQL regression writes used dedicated HubThunder_*_Test databases, not the
working or VPS database. Real provider payment and real guild role assignment
remain production acceptance steps; fakes were used for deterministic tests.

## VPS Steps

1. Back up the existing database, settings, uploads, Bot state and Data Protection
   keys, then extract the supplied ZIP.
2. Run `Deploy-HubThunder.ps1` from the extracted release directory in elevated
   PowerShell. It applies pending migrations using existing configuration, copies
   Web/Api/Bot, preserves settings and persistent files, and runs payment and
   public sitemap/robots/Peacshooter diagnostics. A failed public SEO check warns
   without undoing a completed file deployment.
3. Keep `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` in the existing secrets
   mechanism (or `NowPayments:ApiKey` / `NowPayments:IpnSecret` production settings),
   consistent across Web and Api. No real credentials are in this release.
4. Configure `INDEXNOW_KEY` (or `IndexNow:Key`) once, using a generated 32-character
   random hexadecimal value. Use the same key for Web and Api; the Web key endpoint
   must serve it. Installer updates preserve existing settings. Recycle the app
   pools after changing process environment/configuration as required by IIS.
5. Verify `/indexnow-key.txt`, publish/edit a public mod, and check the IndexNow
   accepted/deferred logs. Accepted notifications acknowledge receipt, not indexing.
6. Run `Test-HubThunderPaymentsDeployment.ps1` on VPS. If checkout fails, retain
   the displayed error code/trace and matching server log. Do not share secrets.
   Verify that the existing Bot has Manage Roles permission and its highest role
   is above the configured Premium role. Check that the signed-in user's Discord
   account has current guild membership in the existing synchronization data.
7. Buy one real 4.99 USD invoice while signed in as a Discord guild member. Before
   IPN, the return page must show processing. After verified finished, check +30
   days and the existing Discord role. Resend the same IPN and confirm no extra term.
8. Run `Test-HubThunderSitemap.ps1` and open the sitemap, robots and Peacshooter
   URLs externally after deployment. Compare new metadata and the two Draw counters.
9. In Google Search Console and Yandex Webmaster, verify the site and submit
   `https://hub-thunder.online/sitemap.xml`. IndexNow does not replace ownership
   verification and does not guarantee crawl timing. No Google indexing hacks.

Actual merchant credentials, purchase settlement, Discord guild permissions,
effective VPS ports/tunnel configuration and post-install state cannot be certified
from this local workspace. The public route probes and local tests are recorded
separately above.

## Files

New implementation: `Models/IndexNowNotification.cs`, `Services/ModIndexing.cs`,
`Services/IndexNowService.cs`, `Services/ModSeo.cs`, `Services/BlkObjectCounter.cs`,
`Services/BrushOptimizer.cs`, `wwwroot/js/sight-blk-metrics.js`, IndexNow migration.

Modified implementation: `Program.cs`, `appsettings.json`,
`Data/HubThunderDbContext.cs`, migration snapshot, `Services/SitemapService.cs`,
`Services/PremiumPaymentService.cs`, `Services/BrushGeometry.cs`,
`Controllers/SeoController.cs`, `Controllers/ModsController.cs`,
`Controllers/AuthorsController.cs`, `Controllers/PaymentsController.cs`,
`Controllers/ToolsController.cs`, `Views/Shared/_Layout.cshtml`,
`Views/Shared/_PremiumMethods.cshtml`, `Views/Shared/_ModCard.cshtml`,
`Views/Mods/Detail.cshtml`, `Views/Tools/Draw.cshtml`,
`wwwroot/js/premium-payments.js`, `wwwroot/js/sight-drawer.js`,
`wwwroot/css/site.css`, `wwwroot/css/sight-drawer.css`,
`Resources/SharedResource.resx`, `Resources/SharedResource.ru.resx`,
`Resources/PremiumResource.resx`, `Resources/PremiumResource.ru.resx`,
`Resources/ToolsResource.resx`, `Resources/ToolsResource.ru.resx`.

Tests/tooling: `Controllers/TestAuthController.cs`, `tests/DrawBlkSmoke/`,
`tests/IndexingSmoke/`, `tests/PaymentsSmoke/Program.cs`,
`tests/draw-blk-metrics.spec.js`, `tests/seo-indexing.spec.js`,
`tests/nowpayments.spec.js`, `tests/mod-views.spec.js`,
`tests/run-nowpayments-tests.cjs`, `Test-HubThunderPaymentsDeployment.ps1`,
`Test-HubThunderSitemap.ps1`, `tests/fixtures/seo/`, `tools/SitemapSmoke/`,
`Build-HubThunderVpsPackage.ps1`, `Deploy-HubThunder.ps1`,
`Test-ImageToSightE2E.ps1` (isolated test artifacts),
this report. Test-only fixtures are unavailable
outside the Test environment.
