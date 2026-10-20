#!/usr/bin/env bash
# Install (or refresh) the data-server backup crontab. Idempotent.
#
#   sudo ./scripts/data-server/install-backup-cron.sh
#   BACKUP_DRY_RUN=1 ./scripts/data-server/install-backup-cron.sh
#   BACKUP_CRON_FILE=/tmp/cron ./scripts/data-server/install-backup-cron.sh
#
# Reads the current crontab, replaces the block between the sarh markers,
# and writes it back. Other lines are kept.
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
BEGIN="# BEGIN sarh-backup-cron"
END="# END sarh-backup-cron"

BLOCK=$(cat <<EOT
${BEGIN}
# Installed by scripts/data-server/install-backup-cron.sh — do not edit by hand.
# Daily dump + encrypted off-site copy. Email on failure (see docs/BACKUP_RUNBOOK.md).
15 3 * * * SARH_ROOT=${ROOT} ${ROOT}/scripts/data-server/run-backup-job.sh >> /var/log/sarh-backup.log 2>&1
# Weekly throwaway restore drill.
30 4 * * 0 SARH_ROOT=${ROOT} ${ROOT}/scripts/data-server/run-restore-drill.sh >> /var/log/sarh-restore-verify.log 2>&1
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
  /scripts\/data-server\/(backup-postgres|backup-offsite|run-backup-job|run-restore-drill|restore-verify)\.sh/ { next }
  { print }
')"
# Drop trailing blank lines from the filter so the block is stable.
filtered="$(printf '%s\n' "$filtered" | sed -e :a -e '/^[[:space:]]*$/{$d;N;ba' -e '}')"

{
  if [[ -n "$filtered" ]]; then
    printf '%s\n' "$filtered"
  fi
  printf '%s\n' "$BLOCK"
} | write_cron

if [[ "${BACKUP_DRY_RUN:-}" == 1 && -z "${BACKUP_CRON_FILE:-}" ]]; then
  echo "DRY-RUN crontab not installed"
else
  echo "Backup cron installed (daily 03:15, restore drill Sunday 04:30)"
fi
