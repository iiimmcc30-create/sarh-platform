#!/usr/bin/env bash
# Update sarhsa.online A records to this VPS via Hostinger API.
# Requires /root/.hostinger-api-token (never commit). No secrets printed.
set -euo pipefail

DOMAIN="${DOMAIN:-sarhsa.online}"
TOKEN_FILE="${HOSTINGER_API_TOKEN_FILE:-/root/.hostinger-api-token}"
API_BASE="${HOSTINGER_API_BASE:-https://developers.hostinger.com/api/dns/v1}"
VPS_IP="$(curl -4 -s ifconfig.me)"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "ERROR: missing $TOKEN_FILE — create API token in Hostinger hPanel → API"
  exit 1
fi

TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"

echo "Updating DNS: ${DOMAIN} + www → ${VPS_IP}"

payload=$(python3 - <<PY
import json
ip = "${VPS_IP}"
print(json.dumps({
  "overwrite": False,
  "zone": {
    "records": [
      {"type": "A", "name": "@", "records": [{"content": ip}], "ttl": 300},
      {"type": "A", "name": "www", "records": [{"content": ip}], "ttl": 300},
    ]
  }
}))
PY
)

http_code=$(curl -sS -o /tmp/hostinger-dns.out -w '%{http_code}' \
  -X PUT "${API_BASE}/zones/${DOMAIN}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "$payload")

echo "hostinger_api_status=${http_code}"
if [[ "$http_code" != "200" && "$http_code" != "201" && "$http_code" != "202" ]]; then
  echo "DNS update failed (see /tmp/hostinger-dns.out on server — do not paste publicly)"
  exit 1
fi

echo "DNS update submitted. Waiting for propagation..."
for i in $(seq 1 30); do
  resolved=$(dig +short "$DOMAIN" A | head -1)
  echo "attempt=$i resolved=${resolved:-none}"
  [[ "$resolved" == "$VPS_IP" ]] && exit 0
  sleep 10
done
echo "WARN: DNS not fully propagated yet"
exit 2
