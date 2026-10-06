#!/usr/bin/env bash
# ROLLBACK: return this host to the original single-server stack
# (docker-compose.prod.yml [+ ssl overlay]) on the SAME volumes.
#
# BEFORE running: stop the app server stack (it must not write to this DB while
# the old app services come back), and point DNS back to this host if it moved.
#   app server: docker compose -f docker-compose.app.yml -f docker-compose.prod.ssl.yml --env-file .env.app stop
#
# Recreates postgres/redis with their original definitions (not published, no
# Redis password — .env.production is unchanged) and starts all app services.
# Data written through the app server is kept (same volumes). Nothing is deleted.
set -euo pipefail
ROOT="${SARH_ROOT:-/opt/sarh}"
PROD_ENV_FILE="${PROD_ENV_FILE:-$ROOT/.env.production}"
PROD_COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml")
[[ -f "$ROOT/docker-compose.prod.ssl.yml" ]] && PROD_COMPOSE+=(-f "$ROOT/docker-compose.prod.ssl.yml")
PROD_COMPOSE+=(--env-file "$PROD_ENV_FILE")

[[ -f "$PROD_ENV_FILE" ]] || { echo "ERROR: missing $PROD_ENV_FILE" >&2; exit 1; }

echo "This restarts the full single-server stack on this host (same volumes)."
echo "Make sure the APP SERVER stack is stopped first."
if [[ "${ASSUME_YES:-}" != "1" ]]; then
  read -r -p "Type ROLLBACK to continue: " answer
  [[ "$answer" == "ROLLBACK" ]] || { echo "cancelled"; exit 1; }
fi

"${PROD_COMPOSE[@]}" up -d

echo "Waiting for API health..."
for _ in $(seq 1 90); do
  if curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    echo "API health OK — run ./scripts/hostinger/05-verify.sh"
    exit 0
  fi
  sleep 3
done
echo "WARN: API not healthy yet: ${PROD_COMPOSE[*]} logs --tail=80 api" >&2
exit 1
