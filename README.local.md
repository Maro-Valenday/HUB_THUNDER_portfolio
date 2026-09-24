# Hub Thunder Release Installation

The current VPS update mechanism targets existing Windows x64 IIS applications
at `C:\Sites\HubThunder\Web` and `C:\Sites\HubThunder\Api`, and the existing
DiscordBot service at `C:\Services\DiscordBot`.

`Install-HubThunderComponents.ps1` installs prerequisites only. It does not build
source code, deploy the website, create sites, change bindings, configure SQL
Server, or replace application settings. The application executables are
self-contained; no .NET SDK is needed on the VPS.

Components:

- IIS Web Server, when missing (Windows Server).
- ASP.NET Core Module V2 from the Microsoft-signed .NET 8 Hosting Bundle, when
  missing. The bundle is downloaded from Microsoft's official distribution URL;
  pass `-HostingBundlePath` to use a previously downloaded signed installer.
- Python 3.13.13 and offline Pillow 11.3.0, NumPy 2.2.6, VTracer 0.6.15 from
  `ImageToSightRuntime` in the release package.
- PNG, JPEG and WebP processing checks using the packaged worker.

The Python installation uses the existing runtime repair script. A valid runtime
is reused. An invalid virtual environment is recreated; an invalid existing base
Python is reported for explicit repair. User files, database and configuration
are not removed. The website enters maintenance only while Python is checked or
installed. An existing maintenance page is preserved. A requested Windows restart
is reported; the installer never restarts Windows automatically.

## Local Preparation

Build the release package on the developer machine after build and test checks:

```powershell
.\Build-HubThunderVpsPackage.ps1 -ReleaseId <new-unique-release-id>
```

The package builder includes the component installer and offline Python payload.
The standalone components archive also contains the current worker and fixtures,
but no application release. Source checkout alone is not a complete installation
payload. Existing site, database, service and secret configuration are prerequisites
for the separate application updater.

## VPS Commands

Extract the complete archive on the VPS and open an elevated 64-bit Windows
PowerShell in its `release-<release-id>` directory. No SSH/WinRM connection or
source build on the server is needed. The following commands run on the VPS;
local package verification does not execute them remotely.

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
# Read-only inventory.
.\Install-HubThunderComponents.ps1 -CheckOnly

# Run in elevated 64-bit Windows PowerShell, during maintenance.
.\Install-HubThunderComponents.ps1

# Back up SQL and application data first. Applies pending EF migrations,
# updates existing applications, then prints payment routing diagnostics.
.\Deploy-HubThunder.ps1
.\Verify-HubThunder.ps1 -Smoke
```

The updater preserves `appsettings*.json`, then merges only the approved Patreon
URL, four RU advertising campaigns plus foreign SideShift, and enabled advertising into existing JSON
settings. Backups are kept under `App_Data\deployment-backups` in each site.
Other settings, including connection strings, Discord credentials and storage
paths, are preserved. Environment-variable overrides remain authoritative;
check any `Premium__PatreonUrl` or `CatalogAdvertising__*` overrides before a
production update. Only primary banner files from the current `AD` configuration
are selected by the application.

Before replacing files, the updater runs `Migrations\HubThunder.Migrations.exe`
with `--configuration-root C:\Sites\HubThunder\Web`. It reads the installed
Production settings and applies pending migrations to the existing database.
SQL failure stops the update before files are replaced. The installer identity
needs access to that database and permission to apply schema changes. With SQL
authentication it uses the configured SQL login; with Windows authentication it
uses the account running the installer. An administrator can instead apply the
packaged idempotent `HubThunder-Migrations.sql` in SSMS and pass
`-SkipDatabaseMigration` when the schema is current. Never skip against an old DB.

The automatic payment diagnostic discovers actual IIS bindings and prints local
and external route results, secret presence/matching, assembly hashes and Tunnel
status. It never prints credentials or creates payments. Its results distinguish
application deployment from payment readiness; `DEPLOY PASS` alone does not prove
that a real payment works. See `NOWPAYMENTS.md` and
`API-VIEWS-VERIFICATION-2026-09-14.md` for expected results and final acceptance.

NOWPayments requires `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` in both
Web and Api's existing protected IIS configuration. No real values are shipped.
The updater preserves those settings. Recycle the pools after setting credentials.

No production deployment or smoke test is implied by local component checks.
`Verify-HubThunder.ps1 -Smoke` checks the existing local port 8080 health endpoint;
it is not a complete browser acceptance test. After updating, check Draw export,
Preview/back, BLK/JSON import, Image To Sight, uploads, Premium/provider links,
Discord sign-in/linking and RU/EN advertising on the public site.
