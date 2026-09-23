#!/usr/bin/env bash
# Validate production env without printing secret values.
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"

mask_status() {
  local key="$1"
  local val="$2"
  local min="${3:-1}"
  if [[ -z "${val// /}" ]]; then
    echo "${key}=MISSING"
  elif [[ ${#val} -lt $min ]]; then
    echo "${key}=TOO_SHORT"
  else
    echo "${key}=********"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ENVIRONMENT STATUS: MISSING FILE"
  echo "Expected: $ENV_FILE"
  exit 1
fi

declare -A ENV=()
declare -A KEY_COUNTS=()
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
  key="${line%%=*}"
  val="${line#*=}"
  ENV["$key"]="$val"
  KEY_COUNTS["$key"]=$(( ${KEY_COUNTS[$key]:-0} + 1 ))
done < "$ENV_FILE"

duplicate_keys=()
for k in POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB DATABASE_URL DIRECT_URL JWT_SECRET JWT_REFRESH_SECRET; do
  if [[ "${KEY_COUNTS[$k]:-0}" -gt 1 ]]; then
    duplicate_keys+=("$k (${KEY_COUNTS[$k]} lines — Docker Compose uses the last value)")
  fi
done

get() { printf '%s' "${ENV[$1]:-}"; }

missing=()
too_short=()
present=()

check_required() {
  local key="$1"
  local min="${2:-1}"
  local val
  val="$(get "$key")"
  mask_status "$key" "$val" "$min"
  if [[ -z "${val// /}" ]]; then
    missing+=("$key")
  elif [[ ${#val} -lt $min ]]; then
    too_short+=("$key")
  else
    present+=("$key")
  fi
}

echo "=== CRITICAL ==="
for k in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL DIRECT_URL NODE_ENV PORT JWT_SECRET JWT_REFRESH_SECRET APP_URL; do
  min=1
  [[ "$k" == JWT_* ]] && min=32
  check_required "$k" "$min"
done
app_url="$(get APP_URL)"
if [[ -n "$app_url" ]] && echo "$app_url" | grep -qiE 'railway\.app|onrender\.com'; then
  echo "APP_URL=STALE_HOST (must be https://sarhsa.online)"
  missing+=("APP_URL_HOSTINGER")
fi

echo ""
echo "=== DATABASE ==="
for k in DATABASE_URL DIRECT_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
  check_required "$k" 1
done

echo ""
echo "=== REDIS ==="
for k in REDIS_ENABLED REDIS_HOST REDIS_PORT; do
  check_required "$k" 1
done

echo ""
echo "=== AUTH ==="
for k in JWT_SECRET JWT_REFRESH_SECRET JWT_EXPIRES_IN JWT_REFRESH_EXPIRES_IN SESSION_TTL_DAYS; do
  min=1
  [[ "$k" == JWT_SECRET || "$k" == JWT_REFRESH_SECRET ]] && min=32
  check_required "$k" "$min"
done
# Google OAuth unused in Sarh currently — optional status only (not Missing Required)
for k in GOOGLE_CLIENT_ID GOOGLE_WEB_CLIENT_ID GOOGLE_IOS_CLIENT_ID GOOGLE_ANDROID_CLIENT_ID; do
  mask_status "$k" "$(get "$k")" 1
done
for k in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_VERIFY_SERVICE_SID; do
  mask_status "$k" "$(get "$k")" 1
  [[ -z "$(get "$k")" ]] && missing+=("$k")
done

echo ""
echo "=== FIREBASE ==="
for k in FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY; do
  mask_status "$k" "$(get "$k")" 1
  [[ -z "$(get "$k")" ]] && missing+=("$k")
done

echo ""
echo "=== STORAGE ==="
check_required STORAGE_PROVIDER 1
provider="$(get STORAGE_PROVIDER | tr '[:upper:]' '[:lower:]')"
if [[ "$provider" == cloudinary ]]; then
  for k in CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET; do
    check_required "$k" 1
  done
elif [[ "$provider" == s3 ]]; then
  for k in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_S3_BUCKET; do
    check_required "$k" 1
  done
else
  echo "STORAGE_PROVIDER=${provider:-MISSING}"
fi

echo ""
echo "=== PAYMENTS ==="
for k in NI_BASE_URL NI_OUTLET_ID NI_API_KEY NI_WEBHOOK_SECRET; do
  check_required "$k" 1
done
mask_status NI_BASIC_AUTH "$(get NI_BASIC_AUTH)" 1
mask_status NI_REALM "$(get NI_REALM)" 1

echo ""
echo "=== EMAIL/SMS ==="
for k in SMTP_HOST SMTP_USER SMTP_PASS; do
  mask_status "$k" "$(get "$k")" 1
  [[ -z "$(get "$k")" ]] && missing+=("$k")
done
check_required SMTP_PORT 1

echo ""
echo "=== SOCKET ==="
for k in SOCKET_PORT SOCKET_HTTP_PORT ALLOWED_ORIGINS; do
  check_required "$k" 1
done
mask_status SOCKET_USE_MEMORY_ADAPTER "$(get SOCKET_USE_MEMORY_ADAPTER)" 1
mask_status REDIS_PASSWORD "$(get REDIS_PASSWORD)" 1

echo ""
echo "=== OTHER ==="
for k in APP_URL APP_DEEP_LINK_SCHEME APP_ANDROID_PACKAGE CRON_SECRET; do
  mask_status "$k" "$(get "$k")" 1
  [[ -z "$(get "$k")" ]] && missing+=("$k")
done
for k in SENTRY_DSN OPENAI_API_KEY AGORA_APP_ID AGORA_APP_CERTIFICATE EXPO_ACCESS_TOKEN ADMIN_EMAIL ADMIN_PASSWORD; do
  mask_status "$k" "$(get "$k")" 1
done

# De-dupe missing
if [[ ${#missing[@]} -gt 0 ]]; then
  mapfile -t missing < <(printf '%s\n' "${missing[@]}" | sort -u)
fi
if [[ ${#too_short[@]} -gt 0 ]]; then
  mapfile -t too_short < <(printf '%s\n' "${too_short[@]}" | sort -u)
fi

if [[ ${#duplicate_keys[@]} -gt 0 ]]; then
  echo ""
  echo "Duplicate keys (fix before deploy — last value wins in Compose):"
  printf '%s\n' "${duplicate_keys[@]}"
fi

echo ""
echo "ENVIRONMENT STATUS: $(
  if [[ ${#missing[@]} -eq 0 && ${#too_short[@]} -eq 0 && ${#duplicate_keys[@]} -eq 0 ]]; then
    echo READY
  else
    echo MISSING VARIABLES
  fi
)"

echo ""
echo "Missing variables:"
if [[ ${#missing[@]} -eq 0 ]]; then
  echo "(none)"
else
  printf '%s\n' "${missing[@]}"
fi

if [[ ${#too_short[@]} -gt 0 ]]; then
  echo ""
  echo "Too short:"
  printf '%s\n' "${too_short[@]}"
fi

if [[ ${#missing[@]} -gt 0 || ${#too_short[@]} -gt 0 || ${#duplicate_keys[@]} -gt 0 ]]; then
  exit 2
fi
