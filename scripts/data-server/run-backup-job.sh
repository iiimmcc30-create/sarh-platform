#!/usr/bin/env bash
# Daily job: local pg_dump, then encrypted off-site copy.
# On either failure, email sarh@getsarh.com (SMTP_* / ALERT_EMAIL_TO).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/backup-alert.sh
source "${HERE}/../lib/backup-alert.sh"

LOG="$(mktemp)"
cleanup() { rm -f "$LOG"; }
trap cleanup EXIT

fail=0
echo "=== backup-postgres ==="
if ! "${HERE}/backup-postgres.sh" 2>&1 | tee -a "$LOG"; then
  fail=1
fi
echo "=== backup-offsite ==="
if ! "${HERE}/backup-offsite.sh" 2>&1 | tee -a "$LOG"; then
  fail=1
fi

if [[ "$fail" != 0 ]]; then
  host="$(hostname -f 2>/dev/null || hostname)"
  send_backup_alert \
    "[سرح] PostgreSQL backup failed on ${host}" \
    "$(printf 'Host: %s\nTime UTC: %s\n\n%s\n' "$host" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(tail -n 80 "$LOG")")" \
    || echo "ERROR: alert delivery failed" >&2
  exit 1
fi
echo "Daily backup job OK"
