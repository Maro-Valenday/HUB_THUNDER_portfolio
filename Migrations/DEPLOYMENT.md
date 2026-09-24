# HUB THUNDER Production Deployment

## File transfer rates

The application streams file traffic at 250,000 bytes/s for Regular users and
2,500,000 bytes/s for current Discord Premium members. Each user has a shared
upload budget and a separate shared download budget; guests are grouped by IP.
Catalog files (local and proxied), multipart publication/generation, and tool
JSON/BLK import/export use this server-side pacing. Sizes and generation quotas
are independent. Daily publication counts are no longer enforced.

This budget is shared within one Web process, not across replicas. Use one Web
worker or implement a distributed limiter before scaling out. Validate client IP
forwarding through the trusted tunnel; public direct access to the origin must
remain blocked. Do not enable proxy caching of authenticated download responses.

Upload pacing controls application body consumption. IIS, Cloudflare, TCP and
browser buffers can absorb initial bytes before backpressure reaches the client;
it is not a guarantee of a flat instantaneous network ingress rate. If an nginx
proxy is added, set `proxy_request_buffering off` and `proxy_buffering off` for
file endpoints. Verify transfer timings through the actual production tunnel,
including cancellation, before claiming an edge-level rate guarantee. A 50 MB
Regular upload needs about 200 seconds, so proxy timeouts must accommodate it.

Premium is checked against synchronized Discord membership at each request.
Role expiry is represented by Discord role removal; there is no independent
Patreon payment or expiration integration. Keep the Discord synchronization
service healthy. In-flight transfers retain the rate selected when they started.

The current updater targets existing IIS Web/API applications and a separate
DiscordBot Windows service. Executables include their .NET runtime. IIS still
requires ASP.NET Core Module V2. See [INSTALLER.md](INSTALLER.md) for the component
installer, offline Python dependencies and the separate application update step.
Nothing is built on the VPS.

## Existing IIS Configuration

Run `Install-HubThunderComponents.ps1` from the prepared package to install missing
IIS/Hosting Bundle and Python prerequisites. Existing sites, bindings, SQL Server,
Cloudflare Tunnel and application-pool configuration are retained. Web/API use
the self-contained executable in-process. Use `No Managed Code`,
`enable32BitAppOnWin64=false` and `ASPNETCORE_ENVIRONMENT=Production`.
The production callback registered in the Discord Developer Portal must be exactly:

`https://hub-thunder.online/auth/discord/callback`

The application uses `https://hub-thunder.online` as its public canonical, sitemap, robots, Open Graph, and structured-data origin.

Create these external folders before starting the website. They must not live under the publish directory:

```text
C:\HubThunderData\DataProtection-Keys
C:\HubThunderData\Files
C:\HubThunderData\ProtectedImages
C:\HubThunderData\Temp
C:\HubThunderData\Logs
```

Grant the IIS application-pool identity read access to the publish directory and read/write access only to the required HubThunderData folders. Existing files from a prior local deployment must be copied to the configured external storage separately; this publish intentionally contains no `App_Data` runtime data.

Set these values through IIS environment variables or an external secret store. Do not place secret values in `appsettings*.json`.

```text
ConnectionStrings__DefaultConnection=<production SQL Server connection string>
Discord__ClientId=<Discord OAuth client ID>
Discord__ClientSecret=<Discord OAuth client secret>
Integration__Enabled=true
Integration__BotApiKey=<shared website/bot integration key>
Download__IpHashSalt=<random server secret>
Generation__IpHashSalt=<random server secret>
DataProtection__KeyDirectory=C:\HubThunderData\DataProtection-Keys
Storage__RootDirectory=C:\HubThunderData\Files
Storage__ProtectedImagesDirectory=C:\HubThunderData\ProtectedImages
IMAGE_TO_SIGHT_PYTHON=C:\HubThunderRuntime\Python\.venv313\Scripts\python.exe
ImageToSight__TempDirectory=C:\HubThunderData\Temp\ImageToSight
ImageToSight__TimeoutSeconds=120
```

For IIS, use a 64-bit application pool with **.NET CLR version: No Managed Code**
and **Enable 32-Bit Applications: False**. After changing machine environment
variables, recycle both pools during maintenance. Use the release's
`Verify-HubThunder.ps1`, then check database access and Web/API `/health`.

`ConnectionStrings__DefaultConnection` is read by the environment-variable provider as `ConnectionStrings:DefaultConnection`. It must be a single-line SQL Server connection string. Do not store it in `appsettings*.json`, and do not copy BOM, non-breaking space, or zero-width characters into its key/value. Startup validates the loaded value without logging its password: it logs configuration provider type, length, `CR/LF/BOM` flags, key Unicode code points, Data Source, Initial Catalog, and User ID. An invalid value fails before accepting traffic.

`User ID` is a supported Microsoft.Data.SqlClient keyword. Therefore `Keyword not supported: 'user id'` means the loaded text is not the ordinary ASCII key expected by SqlClient, not that SQL authentication must be removed. Read the startup diagnostic first. For example, `User\\u00A0Id [U+0055 U+0073 U+0065 U+0072 U+00A0 U+0049 U+0064]` identifies a non-breaking space. Repair the external `ConnectionStrings__DefaultConnection` source as one ASCII, single-line connection string and recycle both IIS app pools. The deployed `installer\\SqlServerSmoke\\SqlServerSmoke.exe` independently validates SqlClient, opens a real SQL connection, then runs ADO.NET and EF Core `SELECT 1` without printing the password.

## DiscordBot direct SQL pipeline

Production Discord delivery is `Discord -> DiscordBot -> imports.db -> SQL Server -> website storage -> Website`. The Bot does **not** call `/api/integrations/discord/mods`, `/member-sync`, or `/mods/withdraw` in its production delivery path; those API routes remain only as deprecated/manual compatibility endpoints and log a warning when called.

`C:\HubThunderData\DiscordBot\imports.db` contains durable event metadata, attachment metadata, attempts, worker leases, compact completion history, and no website domain tables. Attachments are downloaded into `C:\HubThunderData\DiscordBot\imports\<event-hash>` as unique `.part` files, hashed while streaming, closed, verified by actual byte count and SHA-256, then atomically renamed before direct import. HTTP `Content-Length` is diagnostic only; a CDN header disagreement cannot dead-letter an event. The Bot copies each verified staged file to the same external `Storage__RootDirectory` used by the Website, verifies final `StorageKey` existence, commits SQL idempotency in `dbo.DiscordIntegrationOperations`, then marks the SQLite event completed and removes its heavy staging files.

Set these Bot settings as machine environment variables. The connection string is shared with Web/API but must never be logged or committed:

```text
DiscordBot__Import__Transport=DirectSql
DiscordBot__Import__DataDirectory=C:\HubThunderData\DiscordBot
DiscordBot__Import__DatabasePath=imports.db
DiscordBot__Import__StagingDirectory=imports
DiscordBot__Import__FinalStorageRootDirectory=C:\HubThunderData\Files
ConnectionStrings__DefaultConnection=<SQL Server connection string>
Storage__RootDirectory=C:\HubThunderData\Files
```

The installer backs up `outbox.db` before updating Bot binaries. At Bot startup, undelivered legacy rows are copied idempotently into `imports.db` with their original `EventId`; the legacy database is never deleted. The Bot refuses normal delivery while the connection, database name, required `dbo` tables, or the unique `IX_DiscordIntegrationOperations_EventId` are missing.

## Discord OAuth

OAuth correlation does not use the in-memory ASP.NET Session store. Login writes a 10-minute, host-only, `HttpOnly`, `Secure`, `SameSite=Lax` cookie named `.HubThunder.DiscordOAuth`; it contains only a Data Protection-protected state/return-url payload and is deleted on callback. Production requires `DataProtection__KeyDirectory=C:\HubThunderData\DataProtection-Keys`; the installer grants the IIS pools modify access and verifies a persistent XML key ring after startup. A pool recycle therefore does not invalidate a login correlation cookie.

The application processes `X-Forwarded-Proto` and `X-Forwarded-Host` before OAuth validation. The deployed callback must exactly equal `https://hub-thunder.online/auth/discord/callback` in both `Discord__RedirectUri` and Discord Developer Portal. Safe logs include only a state fingerprint, cookie-present flag, callback-state-present flag, validation result, and trace ID; they never log state, OAuth code, client secret, or tokens.

Useful local commands from `C:\Services\DiscordBot`:

```powershell
.\DiscordBot.exe --diagnose-import
.\DiscordBot.exe --import-status
.\DiscordBot.exe --retry-failed
.\DiscordBot.exe --requeue-imports
.\DiscordBot.exe --requeue-attachment-size-failures
.\DiscordBot.exe --replay-event '<EventId>'
```

`--diagnose-import` performs read-only SQL checks and prints every `dbo.ModTypes` row as `Id`, `Name`, `Slug`, and numeric `Kind`. Website/Admin and Discord ModImport resolve the type by the shared numeric `Kind` (`Sight=0`, `Camouflage=1`), never the localized display `Name`; `Slug` remains the stable public identifier. Discord ModImport requires the explicit reference rows `Sight/sights/0` and `Camouflage/camouflages/1`; the Bot never creates or rewrites this catalog data.

If the read-only diagnostics prove that one or both reference rows are absent, do not enable `SeedDemoData`: it also creates demo users and mods. After confirming the production rows, run this explicit, conflict-safe operator action from the deployed installer directory:

```powershell
.\MigrationRunner\HubThunder.Migrations.exe --connection '<production connection string>' --bootstrap-modtype-reference-data
```

It requires current EF schema, creates only a missing `Sight/sights/0` or `Camouflage/camouflages/1` row, and commits them in one transaction. It never alters an existing row. If the database has a duplicate `Kind`, or a canonical slug assigned to the wrong `Kind`, it stops without changing data and prints the complete existing `ModTypes` diagnostic. Re-run `SqlServerSmoke --schema` and `DiscordBot --diagnose-import` before replaying any staged event.

A missing or duplicated ModType is reported by the Bot as `ReferenceDataConfiguration` with local event status `Failed`, not as an immediate `DeadLetter`. The event and verified staging files stay durable; after the catalog is corrected, wait for the scheduled retry or use `--replay-event <EventId>`.

The Direct SQL queue is self-healing. On normal Bot startup, after SQLite migration and successful SQL/readiness plus ModTypes validation, it classifies historical DeadLetters and automatically requeues only `ReferenceDataConfiguration`, `TemporaryDownloadFailure`, `AttachmentMetadataMismatch`, `FileAccessTemporary`, `DiscordTransient`, and `SqlTransient`. `PermanentValidation`, `PermanentPayload`, and `Unknown` remain DeadLetter. Automatic recovery is bounded to three recovery cycles per event and uses delayed backoff; an exhausted recoverable event remains visible as an `Exhausted` DeadLetter for operator review. The same safe recovery runs every two minutes. Use `DiscordBot.exe --recover-deadletters` only to request an immediate diagnostic recovery pass; `--replay-event <EventId>` remains an emergency targeted tool and shares the same state transition.

Install the Python packages from the included `requirements.txt` into an external Python virtual environment. The release includes `tools/vtracer_worker.py`, but does not include any development virtual environment. `IMAGE_TO_SIGHT_PYTHON` must point to that working interpreter, not a project `.venv` copied from another Python installation. The IIS identity needs modify access to `ImageToSight__TempDirectory`; the worker uses it for the uploaded file, generated JSON and SVG. The endpoint logs the executable, working directory, temporary root, exit code, stdout/stderr and request ID; only the request ID and a safe error reach the browser.

Apply EF Core migrations only as a deliberate deployment operation against the production connection string. The release contains a Windows x64 migration runner at `release/installer/MigrationRunner/HubThunder.Migrations.exe`; it does not require project source files or `dotnet-ef` on the VPS. Its `--connection` argument is mandatory: it never falls back to appsettings, environment variables, or a local SQL Server.

```powershell
cd C:\path\to\release\installer
.\MigrationRunner\HubThunder.Migrations.exe --connection "<production SQL Server connection string>"
```

Before applying a migration, prove the runner uses the intended SQL Server database. This command opens exactly the supplied `--connection` and prints DataSource, InitialCatalog, `DB_NAME()`, `@@SERVERNAME`, `SERVERPROPERTY('ServerName')`, login, default schema, the two required object IDs, and migration-history count. It is read-only:

```powershell
.\MigrationRunner\HubThunder.Migrations.exe --connection '<production connection string>' --diagnose
```

To inspect the actual migration assembly before opening SQL Server, run:

```powershell
.\MigrationRunner\HubThunder.Migrations.exe --connection '<production connection string>' --print-script
```

It prints the runner executable and `HubThunder.dll` locations, versions, SHA-256 values, and SQL generated by the loaded `AddDiscordIntegrationOperations` type. The output must contain `ALTER TABLE [dbo].[DiscordAccounts]` and `CREATE TABLE [dbo].[DiscordIntegrationOperations]`. Deploy the complete `MigrationRunner` directory; do not copy only its `.exe`.

The runner applies only pending EF migrations after the same connection diagnostic. It stops before `MigrateAsync` when `DB_NAME()` differs from `InitialCatalog`, or when `dbo.DiscordAccounts`, `dbo.__EFMigrationsHistory`, the HubThunder initial migration, or the expected pending/applied migration are absent. Do not run destructive database commands. Production does not seed demo data automatically.

Before an update, run the bundled read-only schema diagnostic from `release\installer`:

```powershell
$env:ConnectionStrings__DefaultConnection = '<production connection string>'
.\SqlServerSmoke\SqlServerSmoke.exe --schema
```

It reports the active database, applied EF migrations, whether `20260902191812_AddDiscordIntegrationOperations` is pending, `OBJECT_ID('dbo.DiscordIntegrationOperations', 'U')`, and the resulting columns/indexes without changing schema. Apply only pending migrations through `HubThunder.Migrations.exe`, then require the expected schema:

```powershell
.\MigrationRunner\HubThunder.Migrations.exe --connection '<production connection string>'
.\SqlServerSmoke\SqlServerSmoke.exe --schema --require-current
```

This migration creates `dbo.DiscordIntegrationOperations`, its primary key, unique `EventId` index, and the `(OperationType, GuildId, SubjectId)` index. It also adds nullable `DiscordStateObservedAtUtc` to `dbo.DiscordAccounts`; it does not drop or recreate existing production tables. The schema is explicit because the existing production tables are in `dbo`; deployment no longer depends on the login's default SQL schema.

## Discord bot service

Set `DOTNET_ENVIRONMENT=Production` for the bot process. Its production configuration uses `https://hub-thunder.online` only for external links; imports and member synchronization connect directly to SQL Server and external file storage. Supply these external values:

```text
DiscordBot__Enabled=true
DiscordBot__Token=<Discord bot token>
ConnectionStrings__DefaultConnection=<production SQL Server connection string>
Storage__RootDirectory=C:\HubThunderData\Files
DiscordBot__Import__Transport=DirectSql
DiscordBot__ModImport__Enabled=<true or false>
DiscordBot__ModImport__Channels__SightSfw=<forum or channel ID>
```

Configure the remaining import channel IDs only where they are used. The Bot has no production HTTP target and never sends a Discord token, SQL password, or API key in logs.
