#!/usr/bin/env bash
# Weekly restore drill. Emails on failure. Does not modify the production database
# (restore-verify.sh uses a throwaway container).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/backup-alert.sh
source "${HERE}/../lib/backup-alert.sh"

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

echo "=== restore drill ==="
if "${HERE}/restore-verify.sh" --compare-live "$@" 2>&1 | tee -a "$LOG"; then
  echo "Restore drill OK"
  exit 0
fi

host="$(hostname -f 2>/dev/null || hostname)"
send_backup_alert \
  "[سرح] PostgreSQL restore drill failed on ${host}" \
  "$(printf 'Host: %s\nTime UTC: %s\n\n%s\n' "$host" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(tail -n 80 "$LOG")")" \
  || echo "ERROR: alert delivery failed" >&2
exit 1
