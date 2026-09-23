#!/usr/bin/env bash
# Daily PostgreSQL backup for Hostinger production (run via cron on VPS).
# Credentials come from .env.production — never commit secrets.
#
# Usage:
#   SARH_ROOT=/opt/sarh ./scripts/hostinger/09-backup-postgres.sh
#
# Off-site copy (example — configure on VPS, not in Git):
#   rclone copy "$BACKUP_DIR" remote:sarh-backups/postgres/
#
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
COMPOSE="docker compose -f $ROOT/docker-compose.prod.yml --env-file $ENV_FILE"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/sarh/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/sarh-${STAMP}.dump"
PG_IMAGE="${PG_DUMP_IMAGE:-postgres:18-alpine}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

POSTGRES_USER="${POSTGRES_USER:?set POSTGRES_USER in .env.production}"
POSTGRES_DB="${POSTGRES_DB:-sarh}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "=== Sarh PostgreSQL backup ($STAMP) ==="

if ! $COMPOSE ps postgres --status running >/dev/null 2>&1; then
  echo "ERROR: postgres container is not running."
  exit 1
fi

$COMPOSE exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --no-owner --no-acl \
  > "$DUMP_FILE"

SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
if [[ "$SIZE" -lt 1024 ]]; then
  echo "ERROR: Backup suspiciously small (${SIZE} bytes)."
  rm -f "$DUMP_FILE"
  exit 1
fi

echo "Verifying backup with pg_restore --list..."
docker run --rm -v "$BACKUP_DIR:/backup" "$PG_IMAGE" \
  pg_restore --list "/backup/$(basename "$DUMP_FILE")" >/dev/null

SHA=$(sha256sum "$DUMP_FILE" | awk '{print $1}')
echo "$SHA  $(basename "$DUMP_FILE")" > "${DUMP_FILE}.sha256"

cat > "${BACKUP_DIR}/LATEST.txt" <<EOF
file=${DUMP_FILE}
sha256=${SHA}
bytes=${SIZE}
created_utc=${STAMP}
retention_days=${RETENTION_DAYS}
EOF

echo "Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -type f \( -name 'sarh-*.dump' -o -name 'sarh-*.dump.sha256' \) -mtime +"$RETENTION_DAYS" -delete

echo "Backup OK: ${DUMP_FILE} (${SIZE} bytes)"
echo "SHA256: ${SHA}"
echo "Latest pointer: ${BACKUP_DIR}/LATEST.txt"
