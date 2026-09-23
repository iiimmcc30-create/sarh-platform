#!/usr/bin/env bash
# Restore PostgreSQL from a custom-format pg_dump (Hostinger production).
# DESTRUCTIVE — overwrites the target database. Use only during disaster recovery drills.
#
# Usage:
#   SARH_ROOT=/opt/sarh ./scripts/hostinger/10-restore-postgres.sh /opt/backups/sarh/postgres/sarh-YYYYMMDD.dump
#
# Dry-run (list contents only):
#   ./scripts/hostinger/10-restore-postgres.sh --list /path/to.dump
#
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
COMPOSE="docker compose -f $ROOT/docker-compose.prod.yml --env-file $ENV_FILE"
PG_IMAGE="${PG_DUMP_IMAGE:-postgres:18-alpine}"

if [[ "${1:-}" == "--list" ]]; then
  DUMP_FILE="${2:?pass dump file path after --list}"
  docker run --rm -v "$(dirname "$DUMP_FILE"):/backup" "$PG_IMAGE" \
    pg_restore --list "/backup/$(basename "$DUMP_FILE")" | head -40
  exit 0
fi

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "Usage: $0 [--list] /path/to/sarh-YYYYMMDD.dump"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

POSTGRES_USER="${POSTGRES_USER:?set POSTGRES_USER}"
POSTGRES_DB="${POSTGRES_DB:-sarh}"

echo "=== Sarh PostgreSQL restore ==="
echo "Source: $DUMP_FILE"
echo "Target DB: $POSTGRES_DB (user: $POSTGRES_USER)"
echo ""
read -r -p "This will DROP and recreate public schema objects. Type RESTORE to continue: " confirm
if [[ "$confirm" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

echo "Verifying dump..."
docker run --rm -v "$(dirname "$DUMP_FILE"):/backup" "$PG_IMAGE" \
  pg_restore --list "/backup/$(basename "$DUMP_FILE")" >/dev/null

if [[ -f "${DUMP_FILE}.sha256" ]]; then
  echo "Verifying SHA256..."
  (
    cd "$(dirname "$DUMP_FILE")"
    sha256sum -c "$(basename "$DUMP_FILE").sha256"
  )
else
  echo "WARNING: No ${DUMP_FILE}.sha256 sidecar — integrity not verified."
fi

echo "Stopping API/worker/socket to release connections..."
$COMPOSE stop api worker socket 2>/dev/null || true

echo "Restoring..."
cat "$DUMP_FILE" | $COMPOSE exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl

echo "Restarting stack..."
$COMPOSE up -d api worker socket

echo "Restore complete. Run ./scripts/hostinger/05-verify.sh to validate."
