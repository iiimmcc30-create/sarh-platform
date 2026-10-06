#!/usr/bin/env bash
# Daily logical backup (pg_dump custom format) of the data-server PostgreSQL.
# Non-destructive: reads the live DB, writes a new dump, prunes OLD dump files only.
# The Docker volume is NOT a backup — copy BACKUP_DIR off-site as well
# (see scripts/data-server/backup-cron.example).
#
# Usage:
#   SARH_ROOT=/opt/sarh ./scripts/data-server/backup-postgres.sh
# Env (or .env.data): BACKUP_DIR, RETENTION_DAYS (14), BACKUP_MIN_KEEP (7)
# Works on the old single-server stack too:
#   DATA_COMPOSE_FILE=/opt/sarh/docker-compose.prod.yml ENV_FILE=/opt/sarh/.env.production ...
set -euo pipefail
# shellcheck source=scripts/data-server/_common.sh
source "$(dirname "$0")/_common.sh"
require_env_file

PGU="$(env_get POSTGRES_USER)"
PGD="$(env_get POSTGRES_DB sarh)"
BACKUP_DIR="$(env_get BACKUP_DIR /opt/backups/sarh/postgres)"
RETENTION_DAYS="$(env_get RETENTION_DAYS 14)"
MIN_KEEP="$(env_get BACKUP_MIN_KEEP 7)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/sarh-${STAMP}.dump"
TMP_FILE="${DUMP_FILE}.partial"

[[ -n "$PGU" ]] || { echo "ERROR: POSTGRES_USER missing in $ENV_FILE" >&2; exit 1; }
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ && "$MIN_KEEP" =~ ^[0-9]+$ ]] || {
  echo "ERROR: RETENTION_DAYS / BACKUP_MIN_KEEP must be integers" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# One backup at a time (cron overlap / manual run).
exec 9>"${BACKUP_DIR}/.backup.lock"
if ! flock -n 9; then
  echo "ERROR: another backup is running (lock ${BACKUP_DIR}/.backup.lock)" >&2
  exit 1
fi

echo "=== Sarh PostgreSQL backup (${STAMP}) ==="

if [[ -z "$(data_compose ps -q --status running postgres 2>/dev/null)" ]]; then
  echo "ERROR: postgres container is not running." >&2
  exit 1
fi

cleanup() { rm -f "$TMP_FILE"; }
trap cleanup EXIT

# pg_dump runs in one consistent snapshot; app traffic keeps working meanwhile.
data_compose exec -T postgres \
  pg_dump -U "$PGU" -d "$PGD" --format=custom --no-owner --no-acl \
  > "$TMP_FILE"

SIZE=$(stat -c%s "$TMP_FILE")
if [[ "$SIZE" -lt 1024 ]]; then
  echo "ERROR: backup suspiciously small (${SIZE} bytes) — kept nothing." >&2
  exit 1
fi

echo "Verifying archive TOC (pg_restore --list)..."
data_compose exec -T postgres pg_restore --list < "$TMP_FILE" > /dev/null

mv "$TMP_FILE" "$DUMP_FILE"
trap - EXIT

SHA=$(sha256sum "$DUMP_FILE" | awk '{print $1}')
echo "$SHA  $(basename "$DUMP_FILE")" > "${DUMP_FILE}.sha256"

cat > "${BACKUP_DIR}/LATEST.txt" <<EOT
file=${DUMP_FILE}
sha256=${SHA}
bytes=${SIZE}
created_utc=${STAMP}
retention_days=${RETENTION_DAYS}
min_keep=${MIN_KEEP}
EOT

# Retention: always keep the newest MIN_KEEP dumps; beyond those, delete dumps
# older than RETENTION_DAYS. Only files matching sarh-*.dump(.sha256) are touched.
echo "Pruning: keep newest ${MIN_KEEP}, delete older than ${RETENTION_DAYS} days..."
mapfile -t dumps < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sarh-*.dump' -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
pruned=0
for i in "${!dumps[@]}"; do
  (( i < MIN_KEEP )) && continue
  f="${dumps[$i]}"
  if [[ -n "$(find "$f" -maxdepth 0 -mtime +"$RETENTION_DAYS")" ]]; then
    rm -f -- "$f" "${f}.sha256"
    pruned=$((pruned + 1))
  fi
done
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sarh-*.dump.partial' -mtime +1 -exec rm -f -- {} +

echo "Backup OK: ${DUMP_FILE} (${SIZE} bytes), pruned ${pruned} old dump(s)"
echo "SHA256: ${SHA}"
echo "Kept dumps: $(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sarh-*.dump' | wc -l)"
echo "Next: ./scripts/data-server/restore-verify.sh  (proves the dump actually restores)"
