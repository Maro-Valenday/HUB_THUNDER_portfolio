# Hub Thunder API and mod views verification

## Result and deployment boundary

No VPS access is available. This release is delivered through the existing
Windows installer; production configuration and real merchant acceptance must
be checked on the VPS after installation. No live payment or Discord role was
created by this audit. The local working database was not migrated.

External results on 2026-09-14:

| Check | Observed result |
| --- | --- |
| API DNS | Resolves to Cloudflare, 104.21.83.47 and 172.67.214.58 |
| https://api.hub-thunder.online/ | HTTP 200; HTTPS certificate validation passed |
| POST create, both Web and Api | HTTP 405, Allow: GET |
| GET order status, both Web and Api | HTTP 404 |
| POST IPN, both Web and Api | HTTP 405 |
| Web /js/premium-payments.js | HTTP 404 |

The active public deployment does not expose the new payment flow. HTTP alone
cannot distinguish an old deployment from a Tunnel pointing at a different IIS
application. The installer diagnostic discovers the actual binding/port and
compares local/public responses on the VPS. Do not mark checkout operational
until the public routes and a real merchant transaction pass acceptance.

## Payment audit and corrections

The existing `PremiumPayments`, `DiscordAccounts`, operation ledger, Bot client
and durable role worker remain in use. Only `finished` grants exactly 30 days,
from the later of now and current expiry. SQL transaction/locks and unique event
IDs prevent duplicate grants. A role failure preserves the paid entitlement and
retries through the existing worker. Owner-only order lookup, CSRF, provider GET
verification, HMAC-SHA512 IPN checks and amount/currency matching are covered.

Corrections in this audit: redact `x-api-key` explicitly in HttpClient logging;
reject malformed provider JSON roots as controlled validation errors. Configured
real NOWPayments credentials were absent in local appsettings, user-secrets and
environment checks. Values were never printed; no real secret was added to source,
frontend, response fixtures or package configuration. This checkout has no tracked
commit history to audit. Production secrets and production logs remain unverified.

Browser checkout uses same-origin Web authorization; no additional CORS is needed.
Public routes are `/api/payments/nowpayments/create` (POST, auth + CSRF),
`/api/payments/nowpayments/orders/{orderId}` (GET, owner) and
`/api/payments/nowpayments/ipn` (POST, anonymous signed payload).

## Mod views

The existing `Mod` entity covers both sights and camouflages; no parallel catalog
was introduced. Detail pages show views beside downloads. The existing profile
shows total mod views using a SQL SUM restricted to that author's ID.

- One counted HTML detail navigation per mod and visitor per 30 minutes.
- Authenticated identity uses the existing trusted user ID; guests use a salted
  hash of normalized IP, reusing `Download:IpHashSalt`. No raw IP is stored.
- Administrators, obvious crawlers, HEAD/POST, fetch/AJAX and prefetch requests
  are excluded. Lists, API lookups and downloads never invoke view recording.
- SQL row locking and atomic increment commit with the cooldown record; two
  application instances cannot lose increments or double-count one visitor.
- Existing and new mods start at zero. Edits/unpublishing preserve historic views;
  deleted mods leave the author's total and their visitor records cascade away.
- Total includes all currently owned mods, including retained historic counts on
  unpublished mods; another author's mods are excluded. Empty totals are zero.
- Guest users behind one IP share the cooldown. Switching between anonymous and
  authenticated identity can count once per identity. Bot filtering is heuristic;
  this is interest statistics, not an anti-fraud system. Proxy forwarding must
  preserve real client addresses. One latest timestamp is retained per visitor/mod.

## Files and migration

New production files: `Models/ModViewVisit.cs`, `Services/ModViewService.cs`,
`Test-HubThunderPaymentsDeployment.ps1`.

New migration: `Data/Migrations/20260914133122_AddModViews.cs`, its Designer and
updated DbContext snapshot. Adds `dbo.Mods.ViewsCount bigint NOT NULL DEFAULT 0`
and `dbo.ModViewVisits` with `(ModId, VisitorKey)` primary key and cascading FK.
The package also includes the preceding `20260914123616_AddPremiumPayments`.

Updated application files: `Models/Entities.cs`, `Data/HubThunderDbContext.cs`,
`Program.cs`, `Controllers/ModsController.cs`, `Controllers/ProfileController.cs`,
`Controllers/ApiController.cs`, `Services/NowPaymentsClient.cs`,
`Views/Mods/Detail.cshtml`, `Views/Profile/Index.cshtml`, `wwwroot/css/site.css`,
`Resources/SharedResource.resx`, `Resources/SharedResource.ru.resx`.

Updated deployment: `Deploy-HubThunder.ps1`, `Build-HubThunderVpsPackage.ps1`,
`tools/MigrationRunner/Program.cs`, `NOWPAYMENTS.md`, `INSTALLER.md`, this report.
Tests: new `tests/ModViewsSmoke` and `tests/mod-views.spec.js`; updated
`tests/PaymentsSmoke/Program.cs`, `tests/run-nowpayments-tests.cjs` and Test-only
fixture endpoint in `Controllers/TestAuthController.cs`.

## Automated verification

- Full Playwright suite after the correction: **243/243 passed in 8.5 minutes**.
  The first run had 241/243 because two new mobile profile tests exposed a long
  username overflow; `.profile-identity` wrapping fixed it. Desktop and mobile
  EN/RU screenshots were inspected.
- Payment console tests: PASS on InMemory and dedicated SQL Server database.
  Includes finished, duplicate/concurrent IPN, invalid signature, unknown order,
  amount/currency mismatch, nonfinal status, renewals, provider failure, role
  already present and role failure/retry/expiry. Provider and Discord are fakes.
- Views console tests: PASS on InMemory and real SQL Server. Covers first view,
  F5, cooldown boundary, parallel same/different visitors, guest normalization,
  filters, multiple owned mods, empty totals, ownership, edit/delete and downloads.
- Existing-row SQL migration test: PASS, old mod becomes Views=0, Downloads=42
  unchanged. Installer configuration-root precedence and idempotent execution:
  PASS on dedicated test databases. The installer runner applied AddModViews from
  the preceding schema and a second run made no changes. Missing installed
  configuration was rejected before database access.
- Payment deployment diagnostic: PASS against local Test server, all eight route
  checks, signed empty payload accepted for parsing, no credential output.
- Existing Discord Bot `--self-test-import`: PASS, durable queue and retry recovery.
- `dotnet test -c Release --no-build`: exit 0; there is no framework-discovered
  .NET test project. The console suites above run separately.
- `Test-HubThunderDeploymentAcceptance.ps1`: PASS, Image To Sight and existing
  file-preservation/idempotency simulation. That legacy simulation uses its
  pinned release helper; it is not a real VPS update.

The existing package builder gates Release Web/Bot builds, Windows x64 publish
for Web/Api/Bot and the migration runner, Python repair, Image To Sight and ZIP
inventory. The generated archive identity and hash are reported with the release
artifact; this report records the current 243/243 result before packaging.

## VPS installation and manual acceptance

1. Back up SQL, existing configuration, uploads, Bot state and Data Protection keys.
   Extract the complete new ZIP and open elevated 64-bit PowerShell in its release
   directory. Use the existing `Deploy-HubThunder.ps1`; prerequisites-only
   `Install-HubThunderComponents.ps1` does not update applications.
2. The updater reads installed Web configuration and applies pending migrations
   before replacing files. SQL failure stops the update. If schema rights are
   unavailable, apply packaged `HubThunder-Migrations.sql` through an administrator
   in SSMS, then run `Deploy-HubThunder.ps1 -SkipDatabaseMigration`.
3. Configure `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` in both Web and Api's
   existing protected configuration and recycle pools after changing credentials.
   Preserve the existing shared SQL, Discord guild/role and Bot token settings.
4. Inspect the automatically printed payment diagnostic. Expected create/order
   without auth: 401; unsigned IPN: 401 `invalid_signature`; signed empty payload:
   400 `invalid_notification`. 503 means payment config is incomplete; 405/404 or
   HTML/challenges mean deployment/routing still needs correction.
5. For token-managed Cloudflare Tunnel, compare its public API hostname service
   URL in the dashboard against `Api.expected-tunnel-service`. Allow IPN POST and
   signature header without Access login, browser challenge, cache or body rewrite.
6. Sign in as a real Discord-linked server member, create an invoice, check 4.99
   USD and order ID in NOWPayments, pay in full and wait for `finished`. Verify
   30-day Premium expiry, the existing Discord role, and one operation ledger row.
   Resend the provider IPN: expiry must stay unchanged. A second purchase extends
   from current expiry. If role assignment fails, fix permissions/Bot availability;
   the persisted queue retries without reversing payment.
7. Open a public mod, refresh within 30 minutes, then check the author's profile.
   The first eligible visit counts once, refresh does not. Check RU and EN.

The diagnostic can be rerun without reinstalling:

```powershell
.\Test-HubThunderPaymentsDeployment.ps1
```

Share its safe result lines and the installer error if any. Do not share
appsettings, web.config, full cloudflared command lines, tokens or API keys.
