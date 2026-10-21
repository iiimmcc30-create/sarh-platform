#!/usr/bin/env bash
# Copy the latest PostgreSQL dump off-site, encrypted, then sha256-verify it.
#
#   SARH_ROOT=/opt/sarh ./scripts/data-server/backup-offsite.sh
#   BACKUP_DRY_RUN=1 RCLONE_REMOTE=b2:sarh BACKUP_AGE_RECIPIENT=age1... \
#     ./scripts/data-server/backup-offsite.sh
#
# See docs/BACKUP_RUNBOOK.md.
set -euo pipefail
# shellcheck source=scripts/data-server/_common.sh
source "$(dirname "$0")/_common.sh"
# shellcheck source=scripts/lib/offsite-upload.sh
source "$(dirname "$0")/../lib/offsite-upload.sh"

BACKUP_DIR="$(env_get BACKUP_DIR /opt/backups/sarh/postgres)"
export ENV_FILE ALERT_ENV_FILE="${ALERT_ENV_FILE:-$ENV_FILE}"

DUMP_FILE="$(sed -n 's/^file=//p' "${BACKUP_DIR}/LATEST.txt" 2>/dev/null || true)"
if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: no dump in ${BACKUP_DIR}/LATEST.txt — run backup-postgres.sh first" >&2
  exit 1
fi

if [[ -f "${DUMP_FILE}.sha256" ]]; then
  (cd "$(dirname "$DUMP_FILE")" && sha256sum -c --quiet "$(basename "$DUMP_FILE").sha256")
  echo "Local SHA256 OK"
elif [[ "${BACKUP_DRY_RUN:-}" == 1 ]]; then
  echo "DRY-RUN skip local sha256 (no sidecar yet)"
else
  echo "ERROR: missing ${DUMP_FILE}.sha256" >&2
  exit 1
fi

exec 8>"${BACKUP_DIR}/.offsite.lock"
if ! flock -n 8; then
  echo "ERROR: another off-site upload is running" >&2
  exit 1
fi

echo "=== Off-site copy $(basename "$DUMP_FILE") ==="
offsite_put "$DUMP_FILE" "$(basename "$DUMP_FILE")"
offsite_prune 'sarh-*.dump*'
echo "Off-site copy OK"
