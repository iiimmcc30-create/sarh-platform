# Stop stale dev servers and start backend + web (Windows).
$ErrorActionPreference = 'SilentlyContinue'
$ports = 3001, 3002, 3003, 8081, 8787
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 2

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend-nest'
$app = Join-Path $root 'app'

Write-Host 'Starting backend (API + Socket)...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "cd '$backend'; npm run dev:lite"
) | Out-Null

Write-Host 'Waiting for API on :3001...' -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/health' -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}

if ($ready) {
  Write-Host 'API ready.' -ForegroundColor Green
} else {
  Write-Host 'API not ready yet — web may start before backend finishes compiling.' -ForegroundColor Yellow
}

Write-Host 'Starting web (Expo)...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "cd '$app'; npm run web"
) | Out-Null

Write-Host ''
Write-Host '  API:  http://localhost:3001/api/health' -ForegroundColor Green
Write-Host '  Web:  http://localhost:8081' -ForegroundColor Green
Write-Host '  Socket: http://localhost:3002' -ForegroundColor Green
