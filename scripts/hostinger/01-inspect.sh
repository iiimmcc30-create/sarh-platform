#!/usr/bin/env bash
# Phase 1 — inspect Hostinger VPS (read-only)
set -euo pipefail

echo "========== PHASE 1 — Hostinger inspection =========="
hostname; uname -a
head -5 /etc/os-release
echo "--- Resources ---"
free -h
swapon --show 2>/dev/null || cat /proc/swaps
df -h / /opt
nproc
echo "--- Docker ---"
docker --version
docker compose version
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -20
echo "--- PG client ---"
command -v pg_dump && pg_dump --version || echo "pg_dump: missing (install postgresql-client)"
echo "--- Project ---"
ls -la /opt/sarh | head -15
git -C /opt/sarh branch --show-current
git -C /opt/sarh status -sb
echo "--- Ports ---"
ss -tlnp 2>/dev/null | head -25 || netstat -tlnp | head -25
echo "========== END PHASE 1 =========="
