#!/usr/bin/env bash
# Shared helpers for scripts/app-server/*.sh (sourced). Never prints secrets.
ROOT="${SARH_ROOT:-/opt/sarh}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.app}"
DOMAIN="${DOMAIN:-sarhsa.online}"

APP_COMPOSE=(docker compose -f "$ROOT/docker-compose.app.yml")
if [[ "${NO_SSL:-0}" != 1 && -f "$ROOT/docker-compose.prod.ssl.yml" && -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  APP_COMPOSE+=(-f "$ROOT/docker-compose.prod.ssl.yml")
  APP_SSL=1
else
  APP_SSL=0
fi
APP_COMPOSE+=(--env-file "$ENV_FILE")
export APP_SSL

# env_get KEY [DEFAULT] — last KEY= line in $ENV_FILE (no shell evaluation).
env_get() {
  local key="$1" def="${2:-}" val=""
  if [[ -f "$ENV_FILE" ]]; then
    val="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n1 | sed -E "s/^[[:space:]]*${key}=//; s/[[:space:]]+$//")" || true
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
  fi
  printf '%s' "${val:-$def}"
}

require_env_file() {
  [[ -f "$ENV_FILE" ]] || { echo "ERROR: missing $ENV_FILE (copy .env.app.example)" >&2; exit 1; }
}

# tcp_check HOST PORT — plain TCP reachability (no credentials involved).
tcp_check() {
  timeout 5 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null
}
