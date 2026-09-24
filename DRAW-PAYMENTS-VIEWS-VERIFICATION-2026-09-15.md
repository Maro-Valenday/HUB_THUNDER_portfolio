# Hub Thunder: Draw optimization, payments and views

Release target: 2026.09.15.1. This report supersedes the September 14 Draw,
payment and views observations. Installation uses the existing autonomous VPS
installer. No SSH/WinRM access or remote deployment was used.

## What the MIKU file establishes

`MIKU_BIG_BigBreast.blk` contains 2,364 native `drawLines/line` records and 603
`drawQuads/quad` records: exactly 2,967 drawable records. Its editable snapshot
contains 205 Elements. Import, unchanged export, forced geometry rebuild and a
second import/export all return 2,967. This file does not demonstrate an inflated
counter or phantom objects. The user reports that it renders completely in game.

The real defect for this example was describing 2,500 as a known game limit.
The current official format documentation describes one line/quad/circle/text
record as one drawing object and does not specify a universal 2,500-object cap:
https://wiki.warthunder.ru/cdk/creation_sight

The UI now calls 2,500 a recommended optimization target. It warns at 2,200 and
at 2,500, but does not assert a proven rendering failure and never blocks export.
No coefficient or artificial subtraction was applied to make the example fit.
The exact runtime allocation and vehicle-specific renderer were not reverse
engineered; the count is the documented native drawable record count.

## Counter and diagnostic source of truth

`BlkObjectCounter.Inspect` runs the actual `BlkWriter`, parses that exact output
with `BlkDocumentCodec`, then classifies native drawing records. UI, Optimize and
export use this same path. Each complete line, circle, text or quad counts once.
Parameters, coordinates, comments, editable snapshots and section containers do
not count. Supported legacy direct records use the same classification.

The old recursive name-only visitor could count technical blocks named `line`,
`quad`, `circle` or `text` outside drawing sections. It is replaced with
section-aware recognition and required native geometry fields. A regression
fixture containing technical/nested lookalikes now counts only its one real
line. This defect was not present in the supplied MIKU file.

Open `/tools/draw?blkDiagnostics=1` for the diagnostic output, or call
`POST /tools/draw/blk-metrics` with the usual `{ "json": "..." }` request. Results
include `editorElements`, `generatedEntries`, `blkObjects`, `lines`, `quads`,
`circles`, `texts`, `parameterEntries` and `containerOrOtherBlocks`.
`generatedEntries` is the total parsed syntax-tree entry count, not an object
estimate. Diagnostic mode also shows optimization pass outcomes.

Fixture calibration before optimization:

| File | Elements | Native objects | Unchanged round trip |
| --- | ---: | ---: | ---: |
| MIKU_BIG_BigBreast.blk | 205 | 2967 | 2967 |
| sighttest.blk | 152 | 2630 | 2630 |
| SCP_1471_BIG_SFW.blk | 326 | 2941 | 2941 |
| Hatch ribbons fixture | 1 | 1100 | 1100 |
| Native text fixture | 1 | 1 | 1 |

One Brush/Hatch/Fill/path Element can emit many native records. Opt-in export
compaction can emit a single native record for several compatible Elements.
Both are independent of the editable Elements count.

## Optimization pipeline

The Brush-only optimizer is replaced by `SightOptimizer` with conservative,
balanced (default) and aggressive profiles. Estimated silhouette-change bounds
are respectively 0.5%, 1.5% and 3%, with a separate stricter lost-area bound.

Passes:

1. Deduplicate identical static native records with matching BLK parameters.
2. Merge overlapping/touching collinear native line intervals.
3. Merge neighboring compatible quads when their union is a convex quad/triangle.
   Tiny serialization rounding differences have a separate local area guard.
4. Remove zero-length native lines.
5. Simplify Brush centerlines with the existing Clipper RDP implementation.
6. Simplify Curve/Polyline vertices, Fill contours, vectorized/filled Shape paths
   and Hatch boundaries with type-specific, object-size-relative tolerances.
7. Evaluate compatible Fill/Shape contours together where overlap prevents an
   individually simplified Element from reducing total exported records.

More candidate tolerances are tried while the result exceeds 2,500. Optimization
keeps the best accepted result when the quality budget prevents further reduction.
It does not force a result below the target. Text and native circles are retained;
unsupported fields, dynamic movement and unrepresentable geometry are protected.
Hatch spacing, angle, phase and crosshatch parameters remain intact: the tool does
not disguise a different hatch pattern as an optimization.

Each candidate is serialized to temporary BLK. It must reduce the exact native
count and pass quality checks against the ORIGINAL input, not just the preceding
pass. Thus successive small changes cannot accumulate unchecked. Rejected passes
leave the accepted document unchanged. A no-op creates no undo entry.

`BlkVisualComparer` compares unions/symmetric differences of actual native quad
coverage and buffered line silhouettes, separated by compatible render settings.
The line width is a fixed reference of 1/2048 of the drawing extent, shared by
before/after, with a small numerical floor. Local Brush/Fill/Hatch/filled-Shape
area guards protect small objects from being sacrificed to a larger total area.
Text and unsupported/native-circle records must match exactly. This is a
deterministic geometric quality estimate, not a measured percentage of pixels
in the War Thunder renderer or a claim about game font metrics.

Editor Elements are never removed or replaced by a bitmap or native-record list.
Element types, IDs, groups/unknown metadata and editable parameters are retained.
Geometry simplification updates the relevant Element. Native compaction is saved
as an explicit `exportOptimization` document option and reapplied by the exporter.
The editable BLK snapshot carries it too; matching snapshot imports do not append
merged native records back as phantom Elements. JSON parsing, undo/redo, reload
and import/export retain this option. Imported files without editable metadata
keep each original editable native Element, even if their export can be compacted.

Both counts stay above the canvas; the existing Elements list remains. Optimize
has one button and a mode selector. The info button opens before/after counts,
reduction, estimated silhouette difference and the remaining-target message.
RU/EN labels and the dismissible Brush warning are retained.

Measured examples (balanced):

| Fixture | Before | After | Reduction | Estimated change |
| --- | ---: | ---: | ---: | ---: |
| Straight sampled Brush plus two Elements | 429 | 29 | 93.2% | 0.6884% |
| Curved sampled Brush plus two Elements | 2339 | 110 | 95.3% | 0.8934% |
| Dense Fill contour | 42 | 1 | 97.6% | 0.0005% |
| Filled vector Shape | 42 | 1 | 97.6% | 0.0005% |
| Adjacent collinear native lines | 3120 | 1 | 99.97% | 0% |
| Duplicate lines plus adjacent quads | 4 | 2 | 50% | 0% |
| Hatch ribbons | 1100 | 741 | 32.6% | less than 0.00001% |
| sighttest.blk | 2630 | 2481 | 5.7% | 0.2747% |
| MIKU_BIG_BigBreast.blk | 2967 | 2604 | 12.2% | 1.4891% |

These are fixture measurements, not promised reductions for arbitrary artwork.
MIKU's 205 Elements remain 205. Unsafe candidate passes are reported as rejected.
An additional aggressive MIKU run gives 2,967 -> 2,568 (13.4% reduction), with
2.6078% estimated silhouette change. It also retains 205 Elements and stable
BLK round trips. Neither profile forces this drawing below the recommended target.

## NOWPayments

The exact cause of production Request ID
`400000ad-0001-f900-b63f-84710c7967bb` remains unconfirmed. The user deferred
providing VPS logs. No production merchant key or authenticated website session
is available locally, so a successful real invoice cannot honestly be certified.

The request was compared with the official invoice documentation:
https://documenter.getpostman.com/view/7907941/2s93JusNJt

`price_amount=4.99`, `price_currency=usd`, unique server-owned `order_id`, the
existing description, IPN URL and success/cancel/partially_paid URLs are valid
documented fields. `pay_currency` is omitted so the customer chooses a currency.
No obsolete payload field was identified. JSON is now sent with Content-Length.

Actual HTTP status is retained even when a 200/201 response cannot be parsed or
validated. Diagnostic categories distinguish provider HTTP rejection, timeout,
network/TLS/DNS errors, malformed invoice response and configuration errors.
HTTP 400 logs include internal order ID, HTTP status, non-secret request fields
and a bounded allowlisted/redacted provider response. Keys, IPN secrets, echoed
tokens, email addresses and unrelated provider fields are excluded. Invalid
header credentials are rejected before HTTP. The response buffer is bounded.

Membership and user mapping checks remain mandatory. Existing payment tables,
atomic Premium +30-day activation, finished-only verification, IPN signature,
idempotency and the existing Discord role worker/retry remain intact.
The browser receives safe categories and its request trace, never provider secrets.

External checks on September 15:

- NOWPayments `/v1/status`: 200, valid HTTPS certificate.
- Both Web and Api anonymous create/status: 401, no login redirect.
- Both unsigned IPN routes: 401 `invalid_signature`, no login redirect.

The VPS diagnostic additionally tests provider network reachability, endpoint
configuration and credential whitespace. It reports configuration presence and
Web/Api/Bot consistency without printing values. It cannot prove effective IIS
process environment from a local machine or authenticate an actual buyer.

## Views

The reproduced design issue was IP-based guest deduplication: two independent
browsers sharing an IP (NAT/proxy) shared one cooldown. It could suppress the
second visitor even though the database and rendered model were otherwise correct.
The supplied production symptom cannot be attributed to a particular VPS request
without its request/authentication state. Admins and crawlers remain excluded.

Guests now use a random protected HttpOnly, SameSite=Lax browser cookie, signed
with the existing persistent Data Protection keys. The database stores its salted
hash. Different browsers on the same IP count separately; normal refresh reuses
the visitor key. Signed-in users still use their user ID. Deleting cookies can
create a new visitor, an intentional limitation of this lightweight mechanism.

The existing SQL row lock, atomic UPDATE, visit table and 30-minute cooldown are
retained. Detail HTML is private/no-store and receives the returned current count.
Shared catalog/author cards already read ViewsCount in their existing mod query;
there is no extra per-card query. Profile total remains SQL SUM filtered by author,
including zero for an empty result. Downloads are untouched. No migration is
needed for this update.

Browser tests can use actual SQL Server only in the isolated Test environment via
`HUBTHUNDER_E2E_SQL_CONNECTION`. A database-name guard requires the dedicated
`HubThunder_Views_Test_` prefix; production cannot enable this test override.

## Verification and VPS

Completed: Debug/Release compilation, console payment regressions on InMemory
and actual SQL Server, view service regressions on both providers, and four
browser view workflows against SQL Server (fresh visit, F5, second browser,
current HTML/card values and author SUM). Universal Draw console checks and
the 12 focused browser tests pass, including pixels, history and persistence.
`dotnet test -c Release --no-build` exits 0; console suites are executed explicitly
because there is no framework-discovered .NET unit-test project.

Final full Playwright: **257/257 passed**, zero skipped, flaky or failed tests
(11.6 minutes). Includes Draw, JSON/BLK round trips, Image To Sight, Premium,
Discord test integration, advertising, SEO, transfer limits and localization.
Published Web: **17/17 passed**, covering universal optimization, Brush pixels,
undo/redo, persistence, MIKU counts, recommendation boundaries, views and checkout.
Published Api: **8/8 payment diagnostic route checks passed**, including signed
empty IPN validation and verification that diagnostic output contains no keys.
Provider calls in these local checkout tests use the explicit test provider.

Real SQL Server: payment and view console suites passed; browser views **4/4
passed** against a dedicated SQL Server test database. Tests cover first view,
refresh cooldown, independent browsers, bot/admin/AJAX exclusions, atomic
increments, fresh detail/card values and SQL author SUM. These are local SQL
results, not a measurement of the production database.

The package builder passed PowerShell parser/deployment guards, Release builds,
offline Python installation, broken-venv repair/reuse and real PNG/JPEG/WEBP
HTTP/browser generation. Web, Api, Bot and MigrationRunner are published for
self-contained win-x64. The migration script includes existing payment, views
and IndexNow migrations. Shared HubThunder.dll hashes match the tested assembly
in all four components:
`C7E19E820B796E5EDDD39661F6FE7CAEB64DD3530A3F709CA8C1C291F1F3A17D`.

Archive `HubThunder-VPS-win-x64-2026.09.15.1.zip` contains 2,399 entries.
Deployment/diagnostic scripts, runtime base and offline wheels, application DLLs,
migration payload and new browser assets were opened from the ZIP and compared
with staging. The package marker is `2026.09.15.1`. Its final SHA-256 is in the
adjacent `.zip.sha256` file. Desktop EN and mobile RU result screenshots were
visually inspected; no dialog text overlap or viewport overflow was observed.
Full browser evidence is retained in `.tmp/full-suite-results.json`,
`.tmp/full-suite-artifacts-20260915` and `.tmp/full-suite-html-20260915`.

On VPS, back up normal production data/settings, extract the release and run
`Deploy-HubThunder.ps1` in elevated PowerShell. It preserves production settings,
uploads, Data Protection keys and the existing Web/Api/Bot deployment flow.
No new payment secret or database migration is required. Retain the existing
NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET configuration in Web and Api.

After installation, retry Buy Premium as the correct Discord guild member. If it
fails, the error category/Request ID and corresponding safe provider diagnostic
identify the next action. A real invoice URL, settled payment, live Discord role
and production IIS/tunnel environment remain VPS acceptance steps. The release
does not claim those steps have already passed.

## Changed files

New: `Services/BlkExportOptimizer.cs`, `Services/BlkVisualComparer.cs`,
`Services/SightOptimizer.cs`, `tests/draw-universal-optimize.spec.js`, this report.

Changed: `Services/BlkObjectCounter.cs`, `Services/BlkWriter.cs`,
`Services/BlkDocumentCodec.cs`, `Models/SightDocument.cs`,
`Controllers/ToolsController.cs`, `Views/Tools/Draw.cshtml`,
`wwwroot/js/sight-blk-metrics.js`, `wwwroot/css/sight-drawer.css`,
`Resources/ToolsResource.resx`, `Resources/ToolsResource.ru.resx`,
`Services/NowPaymentsClient.cs`, `Services/PremiumPaymentService.cs`,
`Models/PremiumPayment.cs`, `wwwroot/js/premium-payments.js`, `Program.cs`,
`Services/ModViewService.cs`, `Test-HubThunderPaymentsDeployment.ps1`,
`Build-HubThunderVpsPackage.ps1`, `tests/DrawBlkSmoke/Program.cs`,
`tests/PaymentsSmoke/Program.cs`, `tests/ModViewsSmoke/Program.cs`,
`tests/draw-blk-metrics.spec.js`, `tests/mod-views.spec.js`.

Retired: `Services/BrushOptimizer.cs`, replaced by the universal pipeline.
The editor Brush/Elements implementation was not removed.
