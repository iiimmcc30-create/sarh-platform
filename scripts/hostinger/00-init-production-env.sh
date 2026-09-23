#!/usr/bin/env bash
# Create /opt/sarh/.env.production from local infra secrets + empty placeholders.
# Never prints secret values. Safe to re-run (won't overwrite non-empty secret keys).
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
LOCAL_DB="${LOCAL_DB:-/root/.sarh-local-db}"
OUT="${OUT:-$ROOT/.env.production}"
BACKEND_ENV="${BACKEND_ENV:-$ROOT/backend-nest/.env}"

if [[ ! -f "$LOCAL_DB" ]]; then
  echo "MISSING: $LOCAL_DB (run local Postgres credential setup first)"
  exit 1
fi

# shellcheck disable=SC1090
source "$LOCAL_DB"

umask 077
mkdir -p "$(dirname "$OUT")"

# Keys we always (re)set from Hostinger Docker topology
INFRA_KEYS=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
  NODE_ENV PORT
  DATABASE_URL DIRECT_URL
  REDIS_HOST REDIS_PORT REDIS_ENABLED
  SOCKET_PORT SOCKET_HTTP_PORT
  NODE_OPTIONS_BUILD
)

declare -A EXISTING=()
if [[ -f "$OUT" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    EXISTING["$key"]="$val"
  done < "$OUT"
fi

get_existing() {
  local key="$1"
  printf '%s' "${EXISTING[$key]:-}"
}

write_kv() {
  local key="$1"
  local val="$2"
  printf '%s=%s\n' "$key" "$val"
}

{
  write_kv POSTGRES_USER "${POSTGRES_USER}"
  write_kv POSTGRES_PASSWORD "${POSTGRES_PASSWORD}"
  write_kv POSTGRES_DB "${POSTGRES_DB:-sarh}"
  write_kv NODE_OPTIONS_BUILD "--max-old-space-size=3072"

  write_kv NODE_ENV production
  write_kv PORT 3001

  write_kv DATABASE_URL "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-sarh}"
  write_kv DIRECT_URL "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-sarh}"

  write_kv REDIS_HOST redis
  write_kv REDIS_PORT 6379
  write_kv REDIS_ENABLED true

  write_kv SOCKET_PORT 3002
  write_kv SOCKET_HTTP_PORT 3002

  # Non-secret defaults (preserve user overrides if already set)
  defaults=(
    APP_DEEP_LINK_SCHEME=sarh
    APP_ANDROID_PACKAGE=com.sarh.app
    JWT_EXPIRES_IN=15m
    JWT_REFRESH_EXPIRES_IN=3650d
    SESSION_TTL_DAYS=3650
    STORAGE_PROVIDER=cloudinary
    CLOUDINARY_FOLDER=safat
    CLOUDINARY_SECURE=true
    NI_REALM=networkinternational
    LOG_LEVEL=info
    KNOWLEDGE_AUTO_PUBLISH=true
    KNOWLEDGE_MAX_ITEMS_PER_SOURCE=10
    RATE_LIMIT_MAX=200
    RATE_LIMIT_WINDOW_MS=900000
    AUTH_RATE_LIMIT_MAX=20
    AUTH_RATE_LIMIT_WINDOW_SEC=900
    EMAIL_FROM=sarh@sarhsa.online
    SUBSCRIPTION_GRACE_DAYS=3
    SMTP_PORT=587
  )
  for pair in "${defaults[@]}"; do
    k="${pair%%=*}"
    d="${pair#*=}"
    v="$(get_existing "$k")"
    write_kv "$k" "${v:-$d}"
  done

  # Secret / user-provided keys — keep existing non-empty values, else empty placeholder
  secret_keys=(
    APP_URL ALLOWED_ORIGINS
    JWT_SECRET JWT_REFRESH_SECRET
    CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET
    AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION AWS_S3_BUCKET AWS_CLOUDFRONT_URL AWS_BUCKET_NAME STORAGE_URL
    NI_BASE_URL NI_OUTLET_ID NI_API_KEY NI_WEBHOOK_SECRET NI_BASIC_AUTH NI_CHAIN_ID
    TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_VERIFY_SERVICE_SID
    FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY
    SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS
    GOOGLE_CLIENT_ID GOOGLE_WEB_CLIENT_ID GOOGLE_IOS_CLIENT_ID GOOGLE_ANDROID_CLIENT_ID
    CRON_SECRET SENTRY_DSN OPENAI_API_KEY OPENAI_MODEL
    AGORA_APP_ID AGORA_APP_CERTIFICATE EXPO_ACCESS_TOKEN
    ADMIN_EMAIL ADMIN_PASSWORD
    REDIS_PASSWORD
    SWAGGER_ENABLED DEV_OTP SOCKET_USE_MEMORY_ADAPTER
    RENDER_DATABASE_URL
  )
  for k in "${secret_keys[@]}"; do
    v="$(get_existing "$k")"
    write_kv "$k" "$v"
  done
} > "$OUT.new"

mv "$OUT.new" "$OUT"
chmod 600 "$OUT"

# backend-nest/.env for CLI/tools outside compose (same app vars, no compose-only keys)
grep -v '^POSTGRES_' "$OUT" | grep -v '^NODE_OPTIONS_BUILD=' > "$BACKEND_ENV"
chmod 600 "$BACKEND_ENV"

echo "Created/updated:"
echo "  $OUT"
echo "  $BACKEND_ENV"
echo "(values not printed)"
