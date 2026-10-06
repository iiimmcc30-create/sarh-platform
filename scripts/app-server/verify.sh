#!/usr/bin/env bash
# shellcheck disable=SC2015  # ok()/bad() always return 0
# Read-only checks for the APP SERVER after deploy / cut-over. No writes, no payments.
#   ./scripts/app-server/verify.sh                # local checks
#   PUBLIC=1 ./scripts/app-server/verify.sh       # + https://<domain> checks (after DNS)
set -uo pipefail
# shellcheck source=scripts/app-server/_common.sh
source "$(dirname "$0")/_common.sh"
require_env_file

pass=0; fail=0
ok()  { echo "  OK   $*"; pass=$((pass+1)); }
bad() { echo "  FAIL $*"; fail=$((fail+1)); }

echo "=== Containers ==="
"${APP_COMPOSE[@]}" ps

echo "=== Data server connectivity ==="
DATA_IP="$(env_get DATA_SERVER_PRIVATE_IP)"
tcp_check "$DATA_IP" "$(env_get POSTGRES_PORT 5432)" && ok "postgres tcp" || bad "postgres tcp"
tcp_check "$DATA_IP" "$(env_get REDIS_PORT 6379)" && ok "redis tcp" || bad "redis tcp"

echo "=== Redis auth (from api container) ==="
# shellcheck disable=SC2016  # evaluated by node inside the container
redis_js='const R=require("ioredis");
const o={host:process.env.REDIS_HOST,port:Number(process.env.REDIS_PORT||6379),maxRetriesPerRequest:1,lazyConnect:true,connectTimeout:3000,enableOfflineQueue:false};
(async()=>{let anon="?";const a=new R(o);try{await a.connect();await a.ping();anon="OPEN"}catch(e){anon=/NOAUTH|AUTH/i.test(String(e&&e.message))?"NOAUTH":"ERR"}a.disconnect();
const b=new R({...o,password:process.env.REDIS_PASSWORD});let authed="ERR";let policy="";try{await b.connect();authed=await b.ping();policy=(await b.config("GET","maxmemory-policy"))[1]}catch(e){}b.disconnect();
console.log(anon+" "+authed+" "+policy);process.exit(0)})()'
read -r anon authed policy < <("${APP_COMPOSE[@]}" exec -T api node -e "$redis_js" 2>/dev/null || echo "ERR ERR")
[[ "$authed" == PONG ]] && ok "redis PING with REDIS_PASSWORD" || bad "redis PING with REDIS_PASSWORD ($authed)"
[[ "$anon" == NOAUTH ]] && ok "redis rejects unauthenticated clients" || bad "redis without password: $anon (expected NOAUTH)"
[[ "$policy" == noeviction ]] && ok "maxmemory-policy noeviction" || echo "  WARN maxmemory-policy=${policy:-unknown}"

echo "=== API ==="
curl -sf http://127.0.0.1:3001/api/health >/tmp/sarh-health.json && ok "/api/health" || bad "/api/health"
python3 -c "import json;d=json.load(open('/tmp/sarh-health.json'));print('  checks:',d.get('checks'))" 2>/dev/null || true
curl -sf http://127.0.0.1:3001/api/health/ready >/dev/null && ok "/api/health/ready (db+redis+worker)" || bad "/api/health/ready"

echo "=== Socket.IO ==="
curl -sf http://127.0.0.1:3002/health >/dev/null && ok "socket /health" || bad "socket /health"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3002/socket.io/?EIO=4&transport=polling" || echo 000)
[[ "$code" == 200 ]] && ok "socket.io polling handshake" || bad "socket.io handshake HTTP $code"

echo "=== Worker / admin / web via nginx ==="
for svc in worker admin web nginx; do
  cid="$("${APP_COMPOSE[@]}" ps -q "$svc")"
  st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo missing)"
  [[ "$st" == healthy || ( "$svc" == nginx && "$st" == running ) ]] && ok "$svc $st" || bad "$svc $st"
done
for path in / /admin/login /api/health /payment/result; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN}" "http://127.0.0.1${path}" || echo 000)
  [[ "$code" =~ ^(200|301|302|307|308)$ ]] && ok "nginx ${path} -> ${code}" || bad "nginx ${path} -> ${code}"
done

if [[ "${PUBLIC:-0}" == 1 ]]; then
  echo "=== Public https://${DOMAIN} ==="
  for path in /api/health / /admin/login /payment/result; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "https://${DOMAIN}${path}" || echo 000)
    [[ "$code" =~ ^(200|301|302|307|308)$ ]] && ok "https ${path} -> ${code}" || bad "https ${path} -> ${code}"
  done
fi

echo ""
echo "RESULT: ${pass} passed, ${fail} failed"
[[ "$fail" == 0 ]]
