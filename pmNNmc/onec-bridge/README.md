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
Invoke-RestMethod "http://127.0.0.1:12110/timesheets?year=2026&month=5" `
  -Headers @{ "X-Bridge-Token" = $env:ONEC_BRIDGE_TOKEN }
```

## API

- `GET /health`
- `GET /timesheets?year=2026&month=5`
- `GET /timesheets/:id`

All `/timesheets` requests require header `X-Bridge-Token`.
