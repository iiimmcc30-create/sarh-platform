#!/usr/bin/env bash
# IN-PLACE conversion of the existing single-server host into the DATA SERVER.
#
# What it does (nothing else):
#   1. Pre-flight: .env.data present, existing volumes exist and are the ones the
#      running postgres/redis use, DATA_SERVER_PRIVATE_IP is assigned on this host,
#      a recent backup passed restore-verify.sh.
#   2. `stop` (NOT down, NOT rm, NO -v) the app services of the old stack:
#      nginx web admin socket worker api. Their containers stay for rollback.
#   3. `docker compose -f docker-compose.data.yml up -d postgres redis`, which
#      recreates ONLY those two containers on the SAME volumes, bound to the
#      private/tunnel IP, with Redis requirepass.
#   4. Health + auth checks.
# Volumes are never removed. Rollback: ./scripts/data-server/rollback-to-single-server.sh
#
# Usage (as root, from /opt/sarh, inside the maintenance window):
#   ./scripts/data-server/switch-to-data-only.sh
# Env: PROD_ENV_FILE (/opt/sarh/.env.production), MAX_BACKUP_AGE_HOURS (6)
set -euo pipefail
# shellcheck source=scripts/data-server/_common.sh
source "$(dirname "$0")/_common.sh"
require_env_file

PROD_ENV_FILE="${PROD_ENV_FILE:-$ROOT/.env.production}"
PROD_COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml")
[[ -f "$ROOT/docker-compose.prod.ssl.yml" ]] && PROD_COMPOSE+=(-f "$ROOT/docker-compose.prod.ssl.yml")
PROD_COMPOSE+=(--env-file "$PROD_ENV_FILE")
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-6}"
APP_SERVICES=(nginx web admin socket worker api)

DATA_IP="$(env_get DATA_SERVER_PRIVATE_IP)"
PG_VOL="$(env_get POSTGRES_VOLUME_NAME sarh_postgres_data)"
REDIS_VOL="$(env_get REDIS_VOLUME_NAME sarh_redis_data)"
BACKUP_DIR="$(env_get BACKUP_DIR /opt/backups/sarh/postgres)"

die() { echo "ABORT: $*" >&2; exit 1; }

echo "=== Pre-flight ==="
[[ -f "$PROD_ENV_FILE" ]] || die "missing $PROD_ENV_FILE (needed to stop the old app services / rollback)"
is_placeholder "$DATA_IP" && die "DATA_SERVER_PRIVATE_IP is not set in $ENV_FILE"
is_ipv4 "$DATA_IP" || die "DATA_SERVER_PRIVATE_IP must be an IPv4 address"
for k in POSTGRES_USER POSTGRES_PASSWORD REDIS_PASSWORD; do
  is_placeholder "$(env_get "$k")" && die "$k is not set in $ENV_FILE"
done

ip -4 -o addr show | awk '{print $4}' | cut -d/ -f1 | grep -qx "$DATA_IP" \
  || die "DATA_SERVER_PRIVATE_IP is not assigned to any interface here (private network / wg0 up?)"
echo "private IP present on host: OK"

docker volume inspect "$PG_VOL" >/dev/null 2>&1 || die "volume $PG_VOL not found (docker volume ls)"
docker volume inspect "$REDIS_VOL" >/dev/null 2>&1 || die "volume $REDIS_VOL not found (docker volume ls)"

mounts_of() {
  local cid
  cid="$("${PROD_COMPOSE[@]}" ps -q "$1" 2>/dev/null | head -n1)"
  [[ -n "$cid" ]] || cid="$(data_compose ps -q "$1" 2>/dev/null | head -n1)"
  [[ -n "$cid" ]] || return 0
  docker inspect "$cid" --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}'
}
pg_mounts="$(mounts_of postgres)"
redis_mounts="$(mounts_of redis)"
[[ -z "$pg_mounts" || " $pg_mounts " == *" $PG_VOL "* ]] \
  || die "current postgres container uses volume(s) '$pg_mounts', not $PG_VOL — fix POSTGRES_VOLUME_NAME"
[[ -z "$redis_mounts" || " $redis_mounts " == *" $REDIS_VOL "* ]] \
  || die "current redis container uses volume(s) '$redis_mounts', not $REDIS_VOL — fix REDIS_VOLUME_NAME"
echo "volumes: postgres=$PG_VOL redis=$REDIS_VOL (match running containers): OK"

verify_file="${BACKUP_DIR}/VERIFY-LATEST.txt"
[[ -f "$verify_file" ]] || die "no ${verify_file} — run backup-postgres.sh then restore-verify.sh first"
grep -qx 'status=OK' "$verify_file" || die "last restore verification did not pass ($verify_file)"
age_h=$(( ( $(date +%s) - $(stat -c %Y "$verify_file") ) / 3600 ))
(( age_h <= MAX_BACKUP_AGE_HOURS )) || die "verified backup is ${age_h}h old (> ${MAX_BACKUP_AGE_HOURS}h) — take a fresh one"
echo "verified backup: $(sed -n 's/^file=//p' "$verify_file") (${age_h}h old): OK"

data_compose config -q || die "docker-compose.data.yml / .env.data invalid"

echo ""
echo "About to: stop ${APP_SERVICES[*]} (containers kept) and recreate postgres+redis"
echo "bound to ${DATA_IP} with Redis requirepass. Volumes are NOT touched."
if [[ "${ASSUME_YES:-}" != "1" ]]; then
  read -r -p "Type SWITCH to continue: " answer
  [[ "$answer" == "SWITCH" ]] || die "cancelled"
fi

echo "=== Stopping old app services (no down, no -v) ==="
"${PROD_COMPOSE[@]}" stop "${APP_SERVICES[@]}"

echo "=== Starting data-only stack ==="
data_compose up -d postgres redis

echo "Waiting for health..."
for svc in postgres redis; do
  ok=0
  for _ in $(seq 1 60); do
    cid="$(data_compose ps -q "$svc")"
    state="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)"
    [[ "$state" == healthy ]] && { ok=1; break; }
    sleep 2
  done
  [[ "$ok" == 1 ]] || die "$svc not healthy — inspect: docker compose -f docker-compose.data.yml logs $svc ; rollback if needed"
  echo "$svc: healthy"
done

echo "=== Checks ==="
noauth="$(data_compose exec -T redis redis-cli ping 2>&1 || true)"
if [[ "$noauth" == *NOAUTH* ]]; then echo "redis requires password: OK"; else echo "WARN: redis answered without auth: $noauth"; fi
# shellcheck disable=SC2016  # $REDIS_PASSWORD expands inside the container
data_compose exec -T redis sh -c 'export REDISCLI_AUTH="$REDIS_PASSWORD"; redis-cli info keyspace; redis-cli config get maxmemory-policy | tr "\n" " "; redis-cli config get appendonly | tr "\n" " "; echo' | sed 's/^/  /'
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E 'postgres|redis' | sed 's/^/  /'
echo ""
echo "Data server is up. Next:"
echo "  1. ./scripts/data-server/setup-firewall.sh       (if not applied yet)"
echo "  2. ./scripts/data-server/table-counts.sh > /root/counts-after-switch.tsv"
echo "  3. On the app server: scripts/app-server/migrate.sh --status-only, then deploy.sh"
