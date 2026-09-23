#!/usr/bin/env bash
# Diagnose and repair HTTPS (port 443) for Sarh on Hostinger VPS.
# Symptom: app shows empty feeds because EXPO_PUBLIC_API_URL is https://sarhsa.online
# while HTTP :80 still works.
#
# Run ON THE VPS as root:
#   SARH_ROOT=/opt/sarh ./scripts/hostinger/07-repair-ssl.sh
#
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
cd "$ROOT"
DOMAIN="${DOMAIN:-sarhsa.online}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")
COMPOSE_SSL=(docker compose -f docker-compose.prod.yml -f docker-compose.prod.ssl.yml --env-file "$ENV_FILE")

echo "=== 1) HTTP API (must work) ==="
curl -fsS --max-time 8 "http://127.0.0.1:3001/api/health" | python3 -m json.tool | head -20 || {
  echo "ERROR: API on :3001 not healthy. Fix stack first (./scripts/hostinger/04-deploy.sh)."
  exit 1
}

echo ""
echo "=== 2) Certificates ==="
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
if [[ ! -f "${CERT_DIR}/fullchain.pem" || ! -f "${CERT_DIR}/privkey.pem" ]]; then
  echo "ERROR: Missing certs in ${CERT_DIR}"
  echo "Run: ./scripts/hostinger/06-setup-ssl.sh"
  exit 1
fi
ls -la "${CERT_DIR}/fullchain.pem" "${CERT_DIR}/privkey.pem"
openssl x509 -in "${CERT_DIR}/fullchain.pem" -noout -subject -dates || true

echo ""
echo "=== 3) What listens on 443? ==="
ss -lntp | grep -E ':443\b' || netstat -lntp 2>/dev/null | grep -E ':443\b' || echo "(no listener listed)"

echo ""
echo "=== 4) Recreate nginx with SSL overlay ==="
# Ensure redirect include is enabled
if [[ -f nginx/ssl-redirect.conf.disabled ]]; then
  cp -f nginx/ssl-redirect.conf.disabled nginx/ssl-redirect.conf
fi

"${COMPOSE_SSL[@]}" up -d --force-recreate nginx
sleep 2
"${COMPOSE_SSL[@]}" ps nginx
"${COMPOSE_SSL[@]}" logs --tail=40 nginx || true

echo ""
echo "=== 5) Test TLS from the VPS itself ==="
if curl -fsS --max-time 10 "https://127.0.0.1/api/health" -H "Host: ${DOMAIN}" --resolve "${DOMAIN}:443:127.0.0.1" | head -c 200; then
  echo ""
  echo "Local HTTPS OK"
else
  echo ""
  echo "Local HTTPS FAILED — checking nginx config inside container..."
  "${COMPOSE_SSL[@]}" exec -T nginx nginx -t || true
  echo ""
  echo "If cert paths are wrong, re-run 06-setup-ssl.sh after fixing DNS."
  exit 1
fi

echo ""
echo "=== 6) Public HTTPS ==="
if curl -fsS --max-time 15 "https://${DOMAIN}/api/health" | head -c 200; then
  echo ""
  echo "SUCCESS: https://${DOMAIN}/api/health works"
  echo "Mobile app should load listings again after refresh."
else
  echo ""
  echo "Public HTTPS still failing."
  echo "Check Hostinger firewall / panel: allow inbound TCP 443."
  echo "If Cloudflare proxy is ON, set SSL mode to Full (strict) or grey-cloud DNS."
  exit 1
fi
