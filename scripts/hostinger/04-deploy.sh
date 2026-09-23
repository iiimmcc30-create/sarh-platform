#!/usr/bin/env bash
# Phases 7–9 — sequential build & start (4GB / 1 vCPU safe)
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
export NODE_OPTIONS="${NODE_OPTIONS_BUILD:---max-old-space-size=3072}"

COMPOSE_FILES=(-f docker-compose.prod.yml)
if [[ -f docker-compose.prod.ssl.yml ]]; then
  COMPOSE_FILES+=(-f docker-compose.prod.ssl.yml)
fi

echo "Validating production env..."
"$ROOT/scripts/hostinger/validate-env.sh"

echo "Building API image (single build, reused by worker/socket)..."
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" build api

echo "Building admin panel image..."
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" build admin

echo "Building butcher dashboard image..."
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" build butcher

echo "Building Expo web image..."
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" build web

echo "Starting full stack (prod compose only — never docker-compose.yml)..."
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" up -d

echo "Waiting for API health..."
for i in $(seq 1 90); do
  if curl -sf http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    echo "API health OK"
    curl -s http://127.0.0.1:3001/api/health | head -c 500
    echo
    if curl -sf http://127.0.0.1:3001/join | grep -q 'انضمام الملاحم'; then
      echo "GET /join OK (dark butcher registration page)"
    else
      echo "WARN: API /join did not return the butcher registration page"
    fi
    if curl -sf https://sarhsa.online/join | grep -q 'انضمام الملاحم'; then
      echo "https://sarhsa.online/join OK"
    else
      echo "WARN: public /join still hits Expo — recreate nginx: docker compose ... up -d --force-recreate nginx"
    fi
    exit 0
  fi
  sleep 3
done

echo "WARN: API health not ready — check logs:"
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" logs --tail=80 api worker socket
exit 1
