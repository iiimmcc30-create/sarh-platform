#!/usr/bin/env bash
# Dry-run and idempotency checks for backup scripts. Does not touch a server crontab.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "ERROR: shellcheck is not installed" >&2
  exit 1
fi

shellcheck -S warning \
  scripts/lib/backup-alert.sh \
  scripts/lib/offsite-upload.sh \
  scripts/data-server/backup-offsite.sh \
  scripts/data-server/run-backup-job.sh \
  scripts/data-server/run-restore-drill.sh \
  scripts/data-server/install-backup-cron.sh \
  scripts/media-server/backup-media-config.sh \
  scripts/media-server/run-media-backup.sh \
  scripts/media-server/install-backup-cron.sh

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Plaintext off-site upload is refused even in dry-run.
# shellcheck source=scripts/lib/offsite-upload.sh
source scripts/lib/offsite-upload.sh
echo 'bytes' > "${TMP}/plain.dump"
if BACKUP_DRY_RUN=1 RCLONE_REMOTE=b2:sarh BACKUP_AGE_RECIPIENT='' BACKUP_RCLONE_CRYPT=0 \
  offsite_put "${TMP}/plain.dump" plain.dump; then
  echo "ERROR: plaintext upload was accepted" >&2
  exit 1
fi
echo "plaintext refusal OK"

# Age dry-run plans the upload without calling age or rclone.
age_out="$(BACKUP_DRY_RUN=1 RCLONE_REMOTE=b2:sarh BACKUP_AGE_RECIPIENT=age1test \
  offsite_put "${TMP}/plain.dump" plain.dump)"
printf '%s\n' "$age_out" | grep -q 'DRY-RUN age'
echo "age dry-run OK"

# shellcheck source=scripts/lib/backup-alert.sh
source scripts/lib/backup-alert.sh
alert_out="$(BACKUP_DRY_RUN=1 send_backup_alert "Sarh backup failed" "disk full")"
printf '%s\n' "$alert_out" | grep -q 'sarh@getsarh.com'
echo "alert dry-run OK"

DUMP_DIR="${TMP}/dumps"
mkdir -p "$DUMP_DIR"
echo 'dump' > "${DUMP_DIR}/sarh-test.dump"
(cd "$DUMP_DIR" && sha256sum sarh-test.dump > sarh-test.dump.sha256)
printf 'file=%s\n' "${DUMP_DIR}/sarh-test.dump" > "${DUMP_DIR}/LATEST.txt"
ENV_FILE="${TMP}/env.data"
printf 'BACKUP_DIR=%s\n' "$DUMP_DIR" > "$ENV_FILE"
offsite_out="$(BACKUP_DRY_RUN=1 RCLONE_REMOTE=b2:sarh BACKUP_AGE_RECIPIENT=age1test \
  ENV_FILE="$ENV_FILE" SARH_ROOT="$TMP" \
  ./scripts/data-server/backup-offsite.sh)"
printf '%s\n' "$offsite_out" | grep -q 'Off-site copy OK'
echo "offsite script dry-run OK"

CRON="${TMP}/cron"
printf '%s\n' '0 1 * * * echo keep-me' > "$CRON"
BACKUP_CRON_FILE="$CRON" SARH_ROOT=/opt/sarh ./scripts/data-server/install-backup-cron.sh >/dev/null
cp "$CRON" "${TMP}/cron.once"
BACKUP_CRON_FILE="$CRON" SARH_ROOT=/opt/sarh ./scripts/data-server/install-backup-cron.sh >/dev/null
diff -u "${TMP}/cron.once" "$CRON"
grep -q 'echo keep-me' "$CRON"
test "$(grep -c '# BEGIN sarh-backup-cron' "$CRON")" = 1
grep -q 'run-backup-job.sh' "$CRON"
grep -q 'run-restore-drill.sh' "$CRON"
echo "cron installer idempotent OK"

MEDIA="${TMP}/media"
mkdir -p "$MEDIA"
printf 'LIVEKIT\n' > "${MEDIA}/livekit.yaml"
printf 'SECRET=1\n' > "${MEDIA}/.env.media"
media_out="$(BACKUP_DRY_RUN=1 RCLONE_REMOTE=r2:sarh BACKUP_RCLONE_CRYPT=1 \
  SARH_MEDIA_ROOT="$MEDIA" MEDIA_BACKUP_DIR="${TMP}/media-backups" \
  ./scripts/media-server/backup-media-config.sh)"
printf '%s\n' "$media_out" | grep -q 'DRY-RUN tar'
echo "media config dry-run OK"

echo "backup script checks passed"
