#!/usr/bin/env bash
# Idempotent cron for the media host: daily encrypted config backup.
#
#   sudo SARH_ROOT=/opt/sarh ./scripts/media-server/install-backup-cron.sh
#   BACKUP_DRY_RUN=1 ./scripts/media-server/install-backup-cron.sh
#   BACKUP_CRON_FILE=/tmp/media-cron ./scripts/media-server/install-backup-cron.sh
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
BEGIN="# BEGIN sarh-media-backup-cron"
END="# END sarh-media-backup-cron"

BLOCK=$(cat <<EOT
${BEGIN}
# Installed by scripts/media-server/install-backup-cron.sh
20 3 * * * SARH_ROOT=${ROOT} ${ROOT}/scripts/media-server/run-media-backup.sh >> /var/log/sarh-media-backup.log 2>&1
${END}
EOT
)

read_cron() {
  if [[ -n "${BACKUP_CRON_FILE:-}" ]]; then
    [[ -f "$BACKUP_CRON_FILE" ]] && cat "$BACKUP_CRON_FILE" || true
    return 0
  fi
  crontab -l 2>/dev/null || true
}

write_cron() {
  if [[ "${BACKUP_DRY_RUN:-}" == 1 && -z "${BACKUP_CRON_FILE:-}" ]]; then
    cat
    return 0
  fi
  if [[ -n "${BACKUP_CRON_FILE:-}" ]]; then
    cat > "$BACKUP_CRON_FILE"
    return 0
  fi
  crontab -
}

existing="$(read_cron)"
filtered="$(printf '%s\n' "$existing" | awk '
  $0 == "'"$BEGIN"'" { skip=1; next }
  $0 == "'"$END"'" { skip=0; next }
  skip { next }
  /scripts\/media-server\/(backup-media-config|run-media-backup)\.sh/ { next }
  { print }
')"
filtered="$(printf '%s\n' "$filtered" | sed -e :a -e '/^[[:space:]]*$/{$d;N;ba' -e '}')"

{
  if [[ -n "$filtered" ]]; then
    printf '%s\n' "$filtered"
  fi
  printf '%s\n' "$BLOCK"
} | write_cron

if [[ "${BACKUP_DRY_RUN:-}" == 1 && -z "${BACKUP_CRON_FILE:-}" ]]; then
  echo "DRY-RUN media crontab not installed"
else
  echo "Media backup cron installed (daily 03:20)"
fi
