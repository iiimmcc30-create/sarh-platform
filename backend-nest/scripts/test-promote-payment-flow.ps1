$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$env:API_BASE = if ($env:API_BASE) { $env:API_BASE } else { 'http://127.0.0.1:3001/api' }
Write-Host "[test] API_BASE = $env:API_BASE" -ForegroundColor Cyan
node scripts/test-promote-payment-flow.js
