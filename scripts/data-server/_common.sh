#!/usr/bin/env bash
# Shared helpers for scripts/data-server/*.sh (sourced, not executed).
# Reads .env.data WITHOUT `source` (no shell evaluation of secret values) and
# never prints secret values.

ROOT="${SARH_ROOT:-/opt/sarh}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.data}"
DATA_COMPOSE_FILE="${DATA_COMPOSE_FILE:-$ROOT/docker-compose.data.yml}"

# env_get KEY [DEFAULT] — process env wins, then last KEY= line in $ENV_FILE.
env_get() {
  local key="$1" def="${2:-}" val=""
  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return 0
  fi
  if [[ -f "$ENV_FILE" ]]; then
    val="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n1 | sed -E "s/^[[:space:]]*${key}=//; s/[[:space:]]+$//")" || true
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
  fi
  printf '%s' "${val:-$def}"
}

require_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: Missing $ENV_FILE (copy .env.data.example and fill it on the server)." >&2
    exit 1
  fi
}

data_compose() {
  docker compose -f "$DATA_COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# Exact row count per base table (not pg_stat estimates). TSV: schema.table<TAB>rows
TABLE_COUNTS_SQL="$(cat <<'SQL'
SELECT format('%s.%s', table_schema, table_name) AS t,
  (xpath('/row/c/text()',
    query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')
  ))[1]::text::bigint AS n
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1;
SQL
)"
export TABLE_COUNTS_SQL

is_ipv4() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

is_placeholder() {
  [[ -z "$1" || "$1" =~ ^[A-Z_]+$ ]]
}
