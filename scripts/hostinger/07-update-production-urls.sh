#!/usr/bin/env bash
# Point backend production URLs at sarhsa.online (no secret values printed).
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/sarh/.env.production}"
PROD_API="${PROD_API:-https://sarhsa.online}"
PROD_ORIGINS="${PROD_ORIGINS:-https://sarhsa.online,https://www.sarhsa.online}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE"
  exit 1
fi

umask 077
tmp="$(mktemp)"
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^APP_URL= ]]; then
    echo "APP_URL=${PROD_API}"
  elif [[ "$line" =~ ^ALLOWED_ORIGINS= ]]; then
    echo "ALLOWED_ORIGINS=${PROD_ORIGINS}"
  else
    printf '%s\n' "$line"
  fi
done < "$ENV_FILE" > "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Updated APP_URL and ALLOWED_ORIGINS in $ENV_FILE (values not printed)"
echo "Restart API/worker/socket to apply: docker compose -f docker-compose.prod.yml --env-file .env.production up -d api worker socket"
