param(
    [string]$OneCServer = "kufib",
    [string]$OneCDatabase = "copy10062025",
    [string]$CredentialPath = "C:\NNMC\onec-bridge\onec-credential.xml",
    [string]$BridgeHost = "0.0.0.0",
    [int]$BridgePort = 12110
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CredentialPath)) {
    throw "Credential file not found: $CredentialPath"
}

$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($bytes)
} finally {
    $rng.Dispose()
}
$token = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"

$content = @"
ONEC_BRIDGE_HOST=$BridgeHost
ONEC_BRIDGE_PORT=$BridgePort
ONEC_BRIDGE_TOKEN=$token
ONEC_SERVER=$OneCServer
ONEC_DATABASE=$OneCDatabase
ONEC_CREDENTIAL_PATH=$CredentialPath
ONEC_BRIDGE_TIMEOUT_MS=120000
ONEC_BRIDGE_DAILY_TIMEOUT_MS=600000
ONEC_BRIDGE_LIST_LIMIT=500
ONEC_BRIDGE_DAILY_LIST_LIMIT=10000
ONEC_BRIDGE_DATA_DIR=C:\NNMC\onec-bridge\data
ONEC_BRIDGE_DAILY_SYNC_HOUR=7
"@

[IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))

Write-Host "Created $envPath"
Write-Host ""
Write-Host "Set these values in server-kpi:"
Write-Host "ONEC_BRIDGE_URL=http://<this-windows-computer-ip>:$BridgePort"
Write-Host "ONEC_BRIDGE_TOKEN=$token"
