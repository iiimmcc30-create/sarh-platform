# Fast local API with mock payment gateway (no full tsc — ~30s startup).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

$env:NI_API_KEY = 'test_mock'
Write-Host '[api] Starting on http://127.0.0.1:3001 (mock payments)' -ForegroundColor Cyan
npx ts-node --transpile-only -r tsconfig-paths/register src/main.ts
