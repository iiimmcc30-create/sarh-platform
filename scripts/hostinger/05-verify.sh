#!/usr/bin/env bash
# Phase 10+ verification helpers
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
cd "$ROOT"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"

echo "=== Containers ==="
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" ps

echo "=== API health ==="
curl -sS http://127.0.0.1:3001/api/health | python3 -m json.tool 2>/dev/null || curl -sS http://127.0.0.1:3001/api/health

echo "=== Public HTTPS (app depends on this) ==="
if curl -fsS --max-time 12 "https://sarhsa.online/api/health" >/tmp/sarh-https-health.json 2>/tmp/sarh-https-health.err; then
  echo "HTTPS OK"
  python3 -m json.tool /tmp/sarh-https-health.json 2>/dev/null | head -15 || cat /tmp/sarh-https-health.json
else
  echo "HTTPS FAILED — mobile app will show empty feeds (API_BASE is https://sarhsa.online)"
  cat /tmp/sarh-https-health.err 2>/dev/null || true
  echo "Repair: ./scripts/hostinger/07-repair-ssl.sh"
fi

echo "=== Public butcher join page ==="
if curl -fsS --max-time 12 "https://sarhsa.online/join" | grep -q 'انضمام الملاحم'; then
  echo "https://sarhsa.online/join OK"
else
  echo "WARN: /join is not the registration page — nginx is still sending it to Expo web"
  echo "Fix: git pull && ./scripts/hostinger/04-deploy.sh && docker compose -f docker-compose.prod.yml -f docker-compose.prod.ssl.yml --env-file .env.production up -d --force-recreate nginx"
fi

echo "=== Admin panel trailing-slash (must not loop) ==="
admin_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-redirs 0 --max-time 12 "https://sarhsa.online/admin" || echo 000)
admin_slash_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-redirs 0 --max-time 12 "https://sarhsa.online/admin/" || echo 000)
admin_loc=$(curl -sSI --max-redirs 0 --max-time 12 "https://sarhsa.online/admin" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="location:"{print $2; exit}')
admin_slash_loc=$(curl -sSI --max-redirs 0 --max-time 12 "https://sarhsa.online/admin/" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="location:"{print $2; exit}')
echo "/admin -> ${admin_code} Location=${admin_loc:-none}"
echo "/admin/ -> ${admin_slash_code} Location=${admin_slash_loc:-none}"
if [[ "$admin_code" == "302" && "$admin_loc" == *"/admin/"* && "$admin_slash_code" == "308" && "$admin_slash_loc" == *"/admin"* && "$admin_slash_loc" != *"/admin/"* ]]; then
  echo "WARN: /admin redirect loop (nginx 302 /admin→/admin/ vs Next 308 /admin/→/admin)"
  echo "Fix: update nginx/admin-location.conf then: docker compose -f docker-compose.prod.yml -f docker-compose.prod.ssl.yml --env-file .env.production up -d --force-recreate nginx"
elif [[ "$admin_code" =~ ^(200|302|303|307)$ ]]; then
  echo "admin entry OK (no slash war)"
else
  echo "WARN: unexpected /admin status ${admin_code}"
fi

echo "=== Admin JWT_SECRET (required for section navigation) ==="
if docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" exec -T admin \
  sh -c 'if [ -n "${JWT_SECRET:-}" ]; then echo JWT_SECRET=set; else echo JWT_SECRET=MISSING; exit 1; fi' \
  2>/tmp/sarh-admin-jwt.err; then
  echo "admin middleware secret OK"
else
  echo "WARN: admin container missing JWT_SECRET — /admin/users will bounce via /admin/login back to /admin"
  cat /tmp/sarh-admin-jwt.err 2>/dev/null || true
  echo "Fix: ensure docker-compose.prod.yml passes JWT_SECRET, then recreate admin"
fi

echo "=== Payment redirect bridge (N-Genius return URLs) ==="
for path in /payment/result /payment/cancel; do
  code=$(curl -sS -o /tmp/pay-bridge.html -w '%{http_code}' --max-time 8 "http://127.0.0.1:3001${path}" || echo 000)
  echo "api${path} -> ${code}"
done
if curl -fsS --max-time 12 "https://sarhsa.online/payment/result" -o /tmp/pay-public.html 2>/dev/null; then
  echo "public https://sarhsa.online/payment/result OK"
else
  echo "WARN: public /payment/result failed — reload nginx after deploying nginx.prod.conf (location /payment/)"
fi

echo "=== Worker heartbeat (checks.worker in health JSON) ==="
curl -sS http://127.0.0.1:3001/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('worker:', d.get('checks',{}).get('worker'))" 2>/dev/null || true

echo "=== Socket health ==="
curl -sS http://127.0.0.1:3002/health 2>/dev/null | python3 -m json.tool 2>/dev/null \
  || curl -sS http://127.0.0.1:3002/health || echo "(socket health unavailable)"

echo "=== Worker logs (last 20) ==="
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" logs --tail=20 worker

echo "=== Socket logs (last 20) ==="
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" logs --tail=20 socket

echo "=== Postgres sample counts ==="
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" exec -T postgres \
  psql -U "${POSTGRES_USER:-sarh}" -d "${POSTGRES_DB:-sarh}" -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;"
