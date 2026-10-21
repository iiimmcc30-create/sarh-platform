#!/usr/bin/env bash
# Upload one local file to an S3-compatible rclone remote, encrypted.
# Encryption is either:
#   - age (BACKUP_AGE_RECIPIENT=age1...) into a plain remote, or
#   - an rclone crypt remote (BACKUP_RCLONE_CRYPT=1).
# After upload the object is downloaded to a temp file and its sha256 is
# compared with the bytes that were uploaded (ciphertext for age, plaintext
# for a crypt remote, which decrypts on download).
# Sourced, not executed.
set -euo pipefail

offsite_env() {
  local key="$1" def="${2:-}" val=""
  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return 0
  fi
  local file="${ALERT_ENV_FILE:-${ENV_FILE:-}}"
  if [[ -n "$file" && -f "$file" ]]; then
    val="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 | sed -E "s/^[[:space:]]*${key}=//; s/[[:space:]]+$//")" || true
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
  fi
  printf '%s' "${val:-$def}"
}

offsite_sha256() {
  sha256sum "$1" | awk '{print $1}'
}

# offsite_put SRC_FILE REMOTE_NAME
# REMOTE_NAME is the object base name (no directory).
offsite_put() {
  local src="$1" name="$2"
  local remote prefix recipient crypt
  remote="$(offsite_env RCLONE_REMOTE)"
  prefix="$(offsite_env BACKUP_OFFSITE_PREFIX backups)"
  recipient="$(offsite_env BACKUP_AGE_RECIPIENT)"
  crypt="$(offsite_env BACKUP_RCLONE_CRYPT 0)"
  prefix="${prefix#/}"
  prefix="${prefix%/}"

  [[ -n "$remote" ]] || { echo "ERROR: RCLONE_REMOTE is not set" >&2; return 1; }
  [[ -f "$src" ]] || { echo "ERROR: missing $src" >&2; return 1; }
  if [[ -z "$recipient" && "$crypt" != 1 ]]; then
    echo "ERROR: refusing plaintext upload. Set BACKUP_AGE_RECIPIENT or BACKUP_RCLONE_CRYPT=1 (rclone crypt remote)." >&2
    return 1
  fi

  local work payload remote_name
  work="$(mktemp -d)"

  if [[ -n "$recipient" ]]; then
    payload="${work}/${name}.age"
    remote_name="${name}.age"
    if [[ "${BACKUP_DRY_RUN:-}" == 1 ]]; then
      echo "DRY-RUN age -r <recipient> -o ${name}.age ${src}"
      echo "DRY-RUN rclone copyto ${name}.age ${remote}/${prefix}/${remote_name}"
      echo "DRY-RUN download and sha256-verify ciphertext"
      rm -rf "$work"
      return 0
    fi
    if ! command -v age >/dev/null 2>&1; then
      echo "ERROR: age is not installed (needed for BACKUP_AGE_RECIPIENT)" >&2
      rm -rf "$work"
      return 1
    fi
    age -r "$recipient" -o "$payload" "$src"
  else
    payload="$src"
    remote_name="$name"
    if [[ "${BACKUP_DRY_RUN:-}" == 1 ]]; then
      echo "DRY-RUN rclone copyto ${src} ${remote}/${prefix}/${remote_name} (crypt remote)"
      echo "DRY-RUN download and sha256-verify decrypted bytes"
      rm -rf "$work"
      return 0
    fi
  fi

  local local_sum remote_obj dest
  local_sum="$(offsite_sha256 "$payload")"
  remote_obj="${remote}/${prefix}/${remote_name}"
  echo "Uploading ${remote_name} ($(wc -c < "$payload") bytes)"
  rclone copyto "$payload" "$remote_obj" --s3-no-check-bucket

  dest="${work}/downloaded"
  rclone copyto "$remote_obj" "$dest"
  local got
  got="$(offsite_sha256 "$dest")"
  if [[ "$got" != "$local_sum" ]]; then
    echo "ERROR: sha256 mismatch after upload for ${remote_name}" >&2
    echo "  local  ${local_sum}" >&2
    echo "  remote ${got}" >&2
    return 1
  fi
  echo "SHA256 verified ${remote_name} ${got}"

  # Publish the checksum next to the object (hash of the uploaded bytes).
  printf '%s  %s\n' "$got" "$remote_name" > "${work}/checksum.sha256"
  rclone copyto "${work}/checksum.sha256" "${remote}/${prefix}/${remote_name}.sha256"
  rm -rf "$work"
}

# Delete remote objects older than BACKUP_OFFSITE_RETENTION_DAYS, always keeping
# the newest BACKUP_OFFSITE_MIN_KEEP matches of INCLUDE_GLOB (rclone lsf names).
offsite_prune() {
  local include_glob="$1"
  local days min_keep remote prefix
  days="$(offsite_env BACKUP_OFFSITE_RETENTION_DAYS 30)"
  min_keep="$(offsite_env BACKUP_OFFSITE_MIN_KEEP 7)"
  remote="$(offsite_env RCLONE_REMOTE)"
  prefix="$(offsite_env BACKUP_OFFSITE_PREFIX backups)"
  prefix="${prefix#/}"; prefix="${prefix%/}"
  [[ "$days" =~ ^[0-9]+$ && "$min_keep" =~ ^[0-9]+$ ]] || {
    echo "ERROR: retention settings must be integers" >&2; return 1; }
  if [[ "${BACKUP_DRY_RUN:-}" == 1 ]]; then
    echo "DRY-RUN prune ${remote}/${prefix} glob=${include_glob} keep=${min_keep} days=${days}"
    return 0
  fi
  local now listing
  now="$(date +%s)"
  listing="$(rclone lsf "${remote}/${prefix}" --include "$include_glob" --format "tp" 2>/dev/null || true)"
  [[ -n "$listing" ]] || return 0
  # "tp" is modtime and path. Newest first.
  local -a rows=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && rows+=("$line")
  done < <(printf '%s\n' "$listing" | sort -r)
  local i=0 name ts epoch
  for line in "${rows[@]}"; do
    i=$((i + 1))
    (( i <= min_keep )) && continue
    ts="${line%%;*}"
    name="${line#*;}"
    epoch="$(date -d "$ts" +%s 2>/dev/null || echo 0)"
    if [[ "$epoch" != 0 && $((now - epoch)) -gt $((days * 86400)) ]]; then
      echo "Pruning remote ${name}"
      rclone deletefile "${remote}/${prefix}/${name}" || true
      rclone deletefile "${remote}/${prefix}/${name}.sha256" || true
    fi
  done
}
