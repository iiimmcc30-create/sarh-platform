#!/usr/bin/env bash
# Issue Let's Encrypt cert and enable HTTPS on nginx (after DNS points to this VPS).
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
cd "$ROOT"
DOMAIN="${DOMAIN:-sarhsa.online}"
EMAIL="${SSL_EMAIL:-admin@sarhsa.online}"

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)
COMPOSE_SSL=(docker compose -f docker-compose.prod.yml -f docker-compose.prod.ssl.yml --env-file .env.production)

VPS_IP=$(curl -4 -s ifconfig.me)
DNS_IP=$(dig +short "$DOMAIN" A | head -1)
echo "VPS=${VPS_IP} DNS_A=${DNS_IP:-none}"
if [[ "$DNS_IP" != "$VPS_IP" ]]; then
  echo "ERROR: ${DOMAIN} must resolve to ${VPS_IP} before SSL."
  echo "Cloudflare: DNS → A record ${DOMAIN} → ${VPS_IP}"
  echo "Tip: set proxy to DNS only (grey cloud) for first cert, then re-enable."
  exit 1
fi

mkdir -p /etc/letsencrypt /var/www/certbot
"${COMPOSE[@]}" up -d nginx

docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/www/certbot:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" -d "www.${DOMAIN}" \
  --email "$EMAIL" \
  --agree-tos --non-interactive

# Enable HTTP→HTTPS redirect include
cp -f nginx/ssl-redirect.conf.disabled nginx/ssl-redirect.conf

# Bring nginx up with SSL overlay (443 + cert mounts)
"${COMPOSE_SSL[@]}" up -d nginx

# Renew twice daily via host cron if missing
CRON_LINE='0 3,15 * * * root certbot renew --quiet --deploy-hook "cd /opt/sarh && docker compose -f docker-compose.prod.yml -f docker-compose.prod.ssl.yml --env-file .env.production exec -T nginx nginx -s reload"'
if [[ -d /etc/cron.d ]] && [[ ! -f /etc/cron.d/sarh-certbot-renew ]]; then
  echo "$CRON_LINE" > /etc/cron.d/sarh-certbot-renew
  chmod 644 /etc/cron.d/sarh-certbot-renew
  echo "Installed /etc/cron.d/sarh-certbot-renew"
fi

echo "HTTPS enabled. Test: curl -sI https://${DOMAIN}/api/health"
echo "Remember to use both compose files for future nginx restarts:"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.prod.ssl.yml --env-file .env.production up -d nginx"
