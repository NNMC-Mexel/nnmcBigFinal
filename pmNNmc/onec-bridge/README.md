# 1C read-only bridge

Windows-only HTTP bridge used by `server-kpi` to read conducted timesheets from
1C through `V83.COMConnector`. It does not modify the 1C configuration or data.

## Requirements

- Windows x64 with Node.js 20+.
- 1C platform and registered `V83.COMConnector`.
- Network access to the 1C server.
- A dedicated 1C account with read-only access to
  `Документ.ТабельУчетаРабочегоВремени`.

## Configuration

Copy `env.example` to local `.env` and update its values. Do not commit
credentials. The bridge and `server-kpi` must use the same
`ONEC_BRIDGE_TOKEN`.

Create an encrypted credential file while logged in as the Windows account that
will run the bridge:

```powershell
Get-Credential | Export-Clixml C:\NNMC\onec-bridge\onec-credential.xml
```

Set `ONEC_CREDENTIAL_PATH` to that file. Windows encrypts its password so only
the same Windows account on the same computer can decrypt it.

Create `.env` and a random bridge token:

```powershell
.\scripts\configure.ps1
```

The script prints the two values that must be configured in `server-kpi`.

Example start from PowerShell:

```powershell
$env:ONEC_BRIDGE_TOKEN = Read-Host "Bridge token"
$env:ONEC_SERVER = "kufib"
$env:ONEC_DATABASE = "copy10062025"
$env:ONEC_CREDENTIAL_PATH = "C:\NNMC\onec-bridge\onec-credential.xml"
npm start
```

Restrict inbound Windows Firewall access to the `server-kpi` host. The bridge
must not be exposed to the public internet.

Verify it locally:

```powershell
Invoke-RestMethod http://127.0.0.1:12110/health
$department = [Uri]::EscapeDataString("Администрация (клиника)")
Invoke-RestMethod "http://127.0.0.1:12110/timesheets?year=2026&month=5&department=$department" `
  -Headers @{ "X-Bridge-Token" = $env:ONEC_BRIDGE_TOKEN }
```

## API

- `GET /health`
- `GET /timesheets?year=2026&month=5&department=...`
- `GET /timesheets?year=2026&month=5&department=...&refresh=1`
- `GET /timesheets/:id`
- `GET /timesheets/:id?refresh=1`

All `/timesheets` requests require header `X-Bridge-Token`.

The bridge keeps a persistent local cache in `ONEC_BRIDGE_DATA_DIR`. Every day
at `ONEC_BRIDGE_DAILY_SYNC_HOUR` in Windows local time it loads the complete
conducted-timesheet lists and employee/day details for the previous and current
calendar months. The detail rows are loaded through one period query instead of
opening every document separately. During the rest of the day both the list and
selected timesheet details are served from disk and memory without calling 1C
again. `ONEC_BRIDGE_DAILY_LIST_LIMIT` controls the safety limit for each monthly
snapshot.

If a requested document is not part of the two-month snapshot, its details are
loaded on demand and then kept in the persistent cache. Cached data outside the
previous and current calendar months is removed. Add `refresh=1` to bypass and
replace the relevant cached list or detail. The KPI interface exposes this
behavior through the `Обновить из 1С` button.

If the bridge restarts after the configured daily sync hour and today's sync
has not completed yet, it starts the two-month synchronization automatically.
