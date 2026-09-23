#!/usr/bin/env bash
# Merge Render/Railway export + Hostinger local Postgres into production env files.
# Never prints secret values.
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
RENDER_ENV="${RENDER_ENV:-/root/sarh-render.env}"
LOCAL_DB="${LOCAL_DB:-/root/.sarh-local-db}"
OUT="${OUT:-$ROOT/backend-nest/.env}"
PROD="${PROD:-$ROOT/.env.production}"

if [[ ! -f "$RENDER_ENV" ]]; then
  echo "MISSING: $RENDER_ENV — export from Render/Railway dashboard"
  exit 1
fi
if [[ ! -f "$LOCAL_DB" ]]; then
  echo "MISSING: $LOCAL_DB"
  exit 1
fi

# shellcheck disable=SC1090
source "$LOCAL_DB"

umask 077

# Strip remote DB/Redis; inject Hostinger Docker topology
grep -vE '^(DATABASE_URL|DIRECT_URL|REDIS_HOST|REDIS_PORT|REDIS_PASSWORD|REDIS_URL|REDIS_ENABLED)=' \
  "$RENDER_ENV" > "$OUT.tmp" || true

{
  cat "$OUT.tmp"
  echo "NODE_ENV=production"
  echo "PORT=3001"
  echo "DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
  echo "DIRECT_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
  echo "REDIS_HOST=redis"
  echo "REDIS_PORT=6379"
  echo "REDIS_ENABLED=true"
  echo "SOCKET_PORT=3002"
  echo "SOCKET_HTTP_PORT=3002"
} > "$OUT"
rm -f "$OUT.tmp"
chmod 600 "$OUT"

# Compose --env-file needs POSTGRES_* plus full app secrets
{
  echo "POSTGRES_USER=${POSTGRES_USER}"
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  echo "POSTGRES_DB=${POSTGRES_DB}"
  echo "NODE_OPTIONS_BUILD=--max-old-space-size=3072"
  # App vars (already includes DATABASE_URL / REDIS_*)
  cat "$OUT"
} > "$PROD"
chmod 600 "$PROD"

echo "Wrote $OUT and $PROD (secrets not printed)"
echo "Next: $ROOT/scripts/hostinger/validate-env.sh"
