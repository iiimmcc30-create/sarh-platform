#!/usr/bin/env bash
# Build and start the APP SERVER stack (nginx, api, socket, worker, web, admin).
# Does NOT run migrations (SKIP_MIGRATIONS=true) and never touches PostgreSQL/Redis
# data. HTTPS overlay is used automatically once /etc/letsencrypt/live/<domain> exists.
#
# Usage (from /opt/sarh): ./scripts/app-server/deploy.sh
# BUILD_ONLY=1 builds images without starting containers (prepare before cut-over).
set -euo pipefail
# shellcheck source=scripts/app-server/_common.sh
source "$(dirname "$0")/_common.sh"
require_env_file
cd "$ROOT"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
export NODE_OPTIONS="${NODE_OPTIONS_BUILD:---max-old-space-size=3072}"

echo "Validating app env (ENV_PROFILE=app)..."
ENV_PROFILE=app ENV_FILE="$ENV_FILE" SARH_ROOT="$ROOT" "$ROOT/scripts/hostinger/validate-env.sh"

"${APP_COMPOSE[@]}" config -q

echo "Building images (api image reused by worker/socket)..."
"${APP_COMPOSE[@]}" build api
"${APP_COMPOSE[@]}" build admin
"${APP_COMPOSE[@]}" build web

if [[ "${BUILD_ONLY:-0}" == 1 ]]; then
  echo "BUILD_ONLY=1 — images built, nothing started."
  exit 0
fi

DATA_IP="$(env_get DATA_SERVER_PRIVATE_IP)"
PG_PORT="$(env_get POSTGRES_PORT 5432)"
REDIS_PORT="$(env_get REDIS_PORT 6379)"
echo "Checking data server reachability over the private network..."
tcp_check "$DATA_IP" "$PG_PORT" || { echo "ERROR: ${DATA_IP}:${PG_PORT} unreachable (tunnel/private network/firewall?)" >&2; exit 1; }
tcp_check "$DATA_IP" "$REDIS_PORT" || { echo "ERROR: ${DATA_IP}:${REDIS_PORT} unreachable" >&2; exit 1; }
echo "PostgreSQL + Redis reachable."

[[ "$APP_SSL" == 1 ]] || echo "WARN: no certificate for ${DOMAIN} yet — starting HTTP only (see docs/deployment/two-server.md, TLS)."

echo "Starting app stack..."
"${APP_COMPOSE[@]}" up -d

echo "Waiting for API health..."
for _ in $(seq 1 90); do
  if curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    echo "API health OK"
    curl -s http://127.0.0.1:3001/api/health | head -c 500; echo
    echo "Next: ./scripts/app-server/verify.sh"
    exit 0
  fi
  sleep 3
done
echo "WARN: API not healthy — logs:" >&2
"${APP_COMPOSE[@]}" logs --tail=80 api worker socket
exit 1
