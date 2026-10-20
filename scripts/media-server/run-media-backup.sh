#!/usr/bin/env bash
# Media-host cron entry. Emails sarh@getsarh.com when the config backup fails.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/backup-alert.sh
source "${HERE}/../lib/backup-alert.sh"

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

if "${HERE}/backup-media-config.sh" 2>&1 | tee -a "$LOG"; then
  echo "Media config backup OK"
  exit 0
fi

host="$(hostname -f 2>/dev/null || hostname)"
send_backup_alert \
  "[سرح] Media config backup failed on ${host}" \
  "$(printf 'Host: %s\nTime UTC: %s\n\n%s\n' "$host" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(tail -n 80 "$LOG")")" \
  || echo "ERROR: alert delivery failed" >&2
exit 1
