#!/usr/bin/env bash
# Encrypted off-site copy of the media host config (not the media files).
# Archives compose, livekit.yaml, Caddy data/certs, and .env.media from
# /opt/sarh-media, then uploads via the same rclone/age path as Postgres.
#
#   ./scripts/media-server/backup-media-config.sh
#   BACKUP_DRY_RUN=1 RCLONE_REMOTE=r2:sarh BACKUP_RCLONE_CRYPT=1 \
#     ./scripts/media-server/backup-media-config.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/offsite-upload.sh
source "${HERE}/../lib/offsite-upload.sh"
# shellcheck source=scripts/lib/backup-alert.sh
source "${HERE}/../lib/backup-alert.sh"

MEDIA_ROOT="${SARH_MEDIA_ROOT:-/opt/sarh-media}"
BACKUP_DIR="${MEDIA_BACKUP_DIR:-/opt/backups/sarh/media-config}"
export ALERT_ENV_FILE="${ALERT_ENV_FILE:-${MEDIA_ROOT}/.env.media}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -d "$MEDIA_ROOT" ]]; then
  echo "ERROR: ${MEDIA_ROOT} does not exist" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

collect() {
  local rel="$1"
  if [[ -e "${MEDIA_ROOT}/${rel}" ]]; then
    printf '%s\n' "$rel"
  else
    echo "WARN: missing ${MEDIA_ROOT}/${rel}" >&2
  fi
}

PATHS=()
while IFS= read -r rel; do
  [[ -n "$rel" ]] && PATHS+=("$rel")
done < <(
  collect docker-compose.yml
  collect compose.yml
  collect compose.yaml
  collect livekit.yaml
  collect Caddyfile
  collect .env.media
  collect caddy
  collect data/caddy
  collect caddy/data
  collect caddy/config
)

if [[ "${#PATHS[@]}" -eq 0 ]]; then
  echo "ERROR: nothing to archive under ${MEDIA_ROOT}" >&2
  exit 1
fi

ARCHIVE="${BACKUP_DIR}/sarh-media-${STAMP}.tar.gz"
if [[ "${BACKUP_DRY_RUN:-}" == 1 ]]; then
  echo "DRY-RUN tar from ${MEDIA_ROOT}: ${PATHS[*]}"
  echo "DRY-RUN archive ${ARCHIVE}"
  export BACKUP_OFFSITE_PREFIX="${BACKUP_OFFSITE_PREFIX:-media-config}"
  # Planner only: the archive does not exist yet in a dry-run.
  echo "DRY-RUN offsite name=sarh-media-${STAMP}.tar.gz prefix=${BACKUP_OFFSITE_PREFIX}"
  offsite_prune 'sarh-media-*.tar.gz*'
  exit 0
fi

tar -C "$MEDIA_ROOT" -czf "${ARCHIVE}.partial" "${PATHS[@]}"
mv "${ARCHIVE}.partial" "$ARCHIVE"
SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
echo "$SHA  $(basename "$ARCHIVE")" > "${ARCHIVE}.sha256"
ln -sfn "$(basename "$ARCHIVE")" "${BACKUP_DIR}/LATEST.tar.gz"
echo "Local archive ${ARCHIVE}"

# Media objects live under their own prefix unless the operator overrode it.
export BACKUP_OFFSITE_PREFIX="${BACKUP_OFFSITE_PREFIX:-media-config}"
offsite_put "$ARCHIVE" "$(basename "$ARCHIVE")"
offsite_prune 'sarh-media-*.tar.gz*'
echo "Media config off-site OK"
