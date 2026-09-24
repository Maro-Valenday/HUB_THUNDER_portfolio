# NOWPayments Premium

Checkout is currently hidden from the public UI. Boosty levels 3 and 4 are
the visible route to unlimited generation; guest and Discord trial quotas remain.
The existing payment endpoints, invoice processing and paid entitlements remain
available. Set `NowPayments:ShowCheckout=true` to restore the checkout UI, including
when running the optional NOWPayments browser tests with the mock provider.

Hub Thunder creates a separate NOWPayments invoice for each local order. The
price is 4.99 USD for exactly 30 days, with description
`Premium 1-Month Subscription`. No automatic recurring charge is configured.
The customer chooses an available cryptocurrency on the hosted checkout.

## Existing architecture and integration

- `DiscordAccounts` remains the source of Premium access. Previously it only
  stored guild membership and the external Premium role, without an expiration.
  It now also stores paid expiration and durable role synchronization state.
- `DiscordMembershipService` and the existing content/quota/transfer services
  evaluate the same entitlement. Paid access works while role synchronization
  is pending, provided the account is still a guild member.
- `PremiumPayments` maps server-authenticated application user and Discord IDs
  to an `HT-<GUID>` order, invoice, payment, amount, status and resulting term.
- Fulfillment writes the existing `DiscordIntegrationOperations` ledger with
  `nowpayments:finished:<paymentId>` in the same SQL transaction as the order and
  expiration. User-row locks and unique indexes prevent duplicate grants and
  lost renewals across Web, Api and Bot processes.
- The existing Discord Bot/client processes persisted role work every 30 seconds.
  Failures retain the paid term and retry with backoff up to 15 minutes. Active
  terms are rechecked every 15 minutes and at expiration.
- Pre-existing external Premium roles are preserved. Roles added by this flow
  are marked managed and removed at expiry. Discord cannot distinguish two
  providers granting the identical role concurrently. An external grant made
  while that same role is managed is therefore not independently identifiable;
  do not promise additive entitlement from two providers without a separate
  external entitlement record. No second Discord bot or role was introduced.

## Endpoints

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/payments/nowpayments/create` | Existing signed-in user + CSRF |
| GET | `/api/payments/nowpayments/orders/{orderId}` | Order owner only |
| POST | `/api/payments/nowpayments/ipn` | Anonymous, signed provider JSON |

The browser calls Web on the same origin. Web and Api run the same application
and share SQL Server. No cross-domain cookie or CORS change is needed.
Creation accepts `{ "requestId": "<UUID>" }`, associates the user before calling
the provider, and returns only order ID, status and hosted payment URL. Repeated
requests reuse the open order; uncertain invoice POSTs are not automatically
retried. Invoice response loss can be recovered by signed IPN plus provider GET.

The public callback is fixed:
`https://api.hub-thunder.online/api/payments/nowpayments/ipn`.
Invoice success, cancel and partial-payment return URLs use the existing
`https://hub-thunder.online/profile?paymentOrder=HT-...` page. Returning never
activates Premium. The page polls the owner-only status endpoint.

## Provider verification

Official NOWPayments Postman documentation checked on 2026-09-14:
https://documenter.getpostman.com/view/7907941/2s93JusNJt

Verified endpoints: POST `/v1/invoice`, GET `/v1/payment/{payment_id}`.
Verified invoice fields: `price_amount`, `price_currency`, `order_id`,
`order_description`, `ipn_callback_url`, `success_url`, `cancel_url`,
`partially_paid_url`; response `id` and `invoice_url`. `pay_currency` is omitted.

IPN verifies `x-nowpayments-sig` using HMAC-SHA512, recursively sorted JSON and
constant-time comparison. Both array serializations in the official examples
are supported. Duplicate JSON keys and oversized/deep payloads are rejected.
No raw sensitive provider payload, API key or IPN secret is logged.

Only `finished` can activate a term. `waiting`, `confirming`, `confirmed`,
`sending`, `partially_paid`, `failed`, `refunded` and `expired` do not.
Before fulfillment the signed notification and authenticated provider GET must
agree on the local order, invoice/payment IDs, price/currency and crypto amount.
`actually_paid` must cover `pay_amount`; final underpayments are not fulfilled.
Deposits with `parent_payment_id` require review. New currencies/payment IDs may
occur while choosing an invoice payment method; the fulfilled payment is bound
uniquely when the order completes. Duplicate fulfilled IPNs return HTTP 200.
Post-settlement refunds require operator reconciliation; this implementation
does not automatically subtract an already granted term.

## Configuration

Configure these in the existing secret/configuration mechanism for BOTH Web and Api:

```text
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
```

Alternatively use `NowPayments:ApiKey` / `NowPayments:IpnSecret` in existing
protected configuration. The named environment variables take precedence.
For development use the project's existing .NET user-secrets store. Do not put
real credentials in source, JavaScript, release ZIPs or command transcripts.

For IIS add the two variables to the existing `aspNetCore/environmentVariables`
collection in EACH application's protected `web.config`, using IIS Configuration
Editor or XML-aware editing. Preserve existing variables and XML-escape values.
Restrict file access to administrators and the relevant application pool.
Recycle both application pools after updating configuration. Setting `$env:...`
in an unrelated PowerShell session does not configure IIS worker processes.

Keep the existing shared `ConnectionStrings:DefaultConnection`, Discord guild
and Premium role settings. The Bot needs its existing token, `Manage Roles`
permission, and a highest role above the Premium role. NOWPayments secrets are
not needed by the Bot. `SeedDemoData` must remain false in Production.
The provider API URL can only be overridden in the isolated Test environment.

## Database and VPS installation

Payment migration: `20260914123616_AddPremiumPayments`.
It adds `dbo.PremiumPayments`, indexes and nullable/defaulted fields on
`dbo.DiscordAccounts`. Existing Premium roles are initially unmanaged.

The local working database was inspected but NOT migrated. Migration and
concurrency tests use a separate `HubThunder_Payments_Test_*` database.

1. Back up the production database, existing Web/Api/Bot configuration and
   application files. Preserve uploads, Bot import state and Data Protection keys.
2. Extract the complete VPS ZIP, including its `release-...` directory. This
   update includes new dependencies and Bot/schema changes; replacing only
   `HubThunder.dll` is insufficient.
3. Run `Deploy-HubThunder.ps1` from elevated 64-bit PowerShell. Before replacing
   files it runs the packaged migration runner using the EXISTING Web
   `appsettings.json`, optional `appsettings.Production.json`, environment and
   `web.config` variables. It validates the database and applies pending EF
   migrations, including `20260914133122_AddModViews`. On SQL failure it stops
   before replacing application files. The SQL identity used for this operation
   needs schema permissions; Windows authentication uses the installer identity.
4. If that identity cannot migrate, an administrator can review and apply the
   packaged `HubThunder-Migrations.sql` in SSMS against the intended existing DB,
   then run `Deploy-HubThunder.ps1 -SkipDatabaseMigration`. The script is
   idempotent: previously applied migrations are skipped. Do not skip migrations
   against an old schema.
5. Deployment updates Web, Api and Bot, preserves production settings and
   persistent files, then runs `Test-HubThunderPaymentsDeployment.ps1`. Resolve
   installer failures before enabling checkout. Ensure the Bot service restarts.
6. Set the secrets as described above and recycle both IIS application pools.
7. Confirm the diagnostic route results below and complete real payment verification.

```powershell
.\Migrations\HubThunder.Migrations.exe --configuration-root 'C:\Sites\HubThunder\Web' --diagnose
# After verifying the target and backup, deploy applies pending migrations:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Deploy-HubThunder.ps1
```

Use the actual database/server/authentication configuration on the VPS. SSMS is
preferable when SQL passwords would otherwise appear in process arguments.

## IIS and Cloudflare

Latest external check on 2026-09-14 supersedes the earlier NXDOMAIN observation:
the API hostname now resolves and returns HTTP 200 with valid HTTPS. However,
both public origins return 405 for POST create/IPN and 404 for GET order status;
`/js/premium-payments.js` also returns 404. The active public deployment does not
serve the new payment flow. An old deployment or a different IIS origin can
explain this; the actual Tunnel port cannot be established from HTTP alone.

The installer now runs `Test-HubThunderPaymentsDeployment.ps1` automatically.
It discovers actual Web/Api IIS bindings, probes local and public routes, compares
assembly hashes and secret presence/matching without printing values, and reports
the cloudflared service. For a locally configured tunnel it asks cloudflared for
the matching ingress rule and outputs only its loopback service address. For a
token-managed tunnel, verify the public hostname mapping in the existing
Cloudflare dashboard against `Api.expected-tunnel-service`. No assumed API port
is written into deployment configuration. The script can be rerun separately.

Route `api.hub-thunder.online` to the current Api IIS application. For the
exact IPN path allow POST and the `x-nowpayments-sig` header through without
Cloudflare Access, browser challenges, cache, body transforms or login redirects.
The app accepts at most 64 KiB. No IIS or Cloudflare configuration was changed
remotely. Local route/authentication tests passed.

After configuration an unsigned request must reach the app and return 401 JSON:

```powershell
curl.exe -i -X POST -H 'Content-Type: application/json' --data '{}' https://api.hub-thunder.online/api/payments/nowpayments/ipn
```

With configured secrets: anonymous create/order return 401; unsigned IPN returns
401 `invalid_signature`; a signed empty payload returns 400 `invalid_notification`.
The diagnostic uses that deliberately invalid payload to check signature handling
without an invoice, payment or Premium grant. 503 `payment_unavailable` means
payment configuration is incomplete; HTML/redirect/challenge or 405/404 responses
indicate a routing/deployment problem. Never disable signature checking.

## Verification and operation

Automated coverage includes successful and repeated signed IPNs, concurrent
deliveries and checkouts, simultaneous different orders, invalid signature,
unknown orders, wrong amounts/currencies, nonfinal statuses, provider mismatch,
role already present, role failure/retry/expiry, active and expired renewals,
invoice response loss, CSRF, ownership, EN/RU checkout and mobile layout.

```powershell
node tests/nowpayments-signature-fixtures.cjs .tmp/nowpayments-signatures.json
dotnet build tests/PaymentsSmoke/PaymentsSmoke.csproj -c Release
dotnet tests/PaymentsSmoke/bin/Release/net8.0/win-x64/PaymentsSmoke.dll .tmp/nowpayments-signatures.json
```

Set `HUBTHUNDER_PAYMENT_TEST_CONNECTION` to a dedicated database whose name starts
with `HubThunder_Payments_Test` to run the same suite with real SQL transactions.
Browser tests use `tests/nowpayments-provider.cjs` on loopback, Test environment,
and `tests/nowpayments.spec.js`; they do not charge cryptocurrency.

After deployment, sign in with a real Discord-linked guild member, create one
invoice, confirm 4.99 USD and the correct order in the NOWPayments dashboard,
pay an available currency in full, and wait for `finished`. Check profile
expiration, `PremiumPayments.CompletedAtUtc`, the operation ledger, and the
Discord role. Resend the same IPN from the provider dashboard and confirm the
expiration and ledger count remain unchanged. Buy again to verify renewal from
the current paid expiration. Confirm minimum-amount/network restrictions for
the merchant's available currencies before announcing checkout availability.

No real credentials/payment or live Discord role mutation was used in local tests.

For support, look up `PremiumPayments` by order ID. `LastError`, `ProviderStatus`,
`IpnCount` and `LastIpnAtUtc` provide safe audit details. For verification failures
or a lost callback, compare with the provider dashboard and request an IPN resend.
Do not manually set `CompletedAtUtc` or replay fulfillment by editing ledger rows.

For a role failure fix permissions, guild membership or Bot availability; the
durable queue retries automatically. `DiscordAccounts.PremiumRoleLastError`,
`PremiumRoleSyncAttempts` and `PremiumRoleNextAttemptAtUtc` describe retry state.
After fixing the cause an operator may set only `PremiumRoleNextAttemptAtUtc`
to `SYSUTCDATETIME()` for the intended account to expedite synchronization.
Never remove the operation record to retry a Discord role.

## Source changes

New: `Models/PremiumPayment.cs`, `Controllers/PaymentsController.cs`,
`Services/NowPaymentsClient.cs`, `NowPaymentsSignature.cs`,
`PremiumPaymentService.cs`, `PremiumAccountTransaction.cs`, `PremiumAccess.cs`,
`PremiumRoleSynchronizer.cs`, `DiscordBot/DiscordPremiumRoles.cs`,
`Views/Shared/_PremiumPaymentStatus.cshtml`, `wwwroot/js/premium-payments.js`,
the migration/designer, `tests/PaymentsSmoke`, NOWPayments test fixtures/provider/
browser specification, this document and `licenses/Apache-2.0.txt`.

Updated: `Program.cs`, `HubThunder.csproj`, `Models/Entities.cs`, DbContext and
snapshot, existing access/quota/transfer services, Tools/Api/TestAuth controllers,
Discord Bot scheduler and SQL importer, Premium partial/layout/profile/author/
guide views, EN/RU Premium resources, CSS/access-modal JS, `appsettings.json`,
existing Premium/SEO tests, package builder and third-party notices.
