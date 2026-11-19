#!/usr/bin/env bash
# Deploy one commit of Sarh on the APP server (srv2038295, /opt/sarh).
#
# Idempotent: migrate deploy and compose up can run again safely.
# Aborts before touching containers if preflight or the database backup fails.
# Preserves a locally edited nginx/ssl-redirect.conf.
#
#   bash ops/deploy-release.sh <git-sha>
#
# Piped from GitHub (run on the app server):
#   curl -fsSL https://raw.githubusercontent.com/iiimmcc30-create/sarh-platform/<SHA>/ops/deploy-release.sh \
#     | nohup bash -s -- <SHA> > /var/log/sarh-deploy-<SHA>.log 2>&1 &
#   tail -f /var/log/sarh-deploy-<SHA>.log
set -euo pipefail

ROOT="${SARH_ROOT:-/opt/sarh}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.app}"
SHA="${1:-}"
DOMAIN="${DOMAIN:-getsarh.com}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/sarh/postgres}"
SSL_REL="nginx/ssl-redirect.conf"
LOG_TAG="sarh-deploy"

fail() {
  echo "DEPLOY FAILED: $*" >&2
  exit 1
}

on_err() {
  local line="$1"
  echo "DEPLOY FAILED at line ${line}. Containers were not switched if the failure was before 'up -d'." >&2
  exit 1
}
trap 'on_err $LINENO' ERR

echo "=== ${LOG_TAG} $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

[[ -n "$SHA" && "$SHA" =~ ^[0-9a-fA-F]{7,40}$ ]] || fail "pass the full commit SHA as the first argument"
[[ -d "$ROOT/.git" ]] || fail "missing git checkout at $ROOT"
[[ -f "$ENV_FILE" ]] || fail "missing $ENV_FILE"
command -v docker >/dev/null || fail "docker is not installed"
command -v git >/dev/null || fail "git is not installed"
command -v curl >/dev/null || fail "curl is not installed"

cd "$ROOT"

# Refuse to discard unknown local edits. ssl-redirect.conf is the one allowed drift.
dirty="$(git status --porcelain | grep -v -E "(^| )${SSL_REL}$" || true)"
if [[ -n "$dirty" ]]; then
  echo "$dirty" >&2
  fail "worktree has changes other than ${SSL_REL}; commit or stash them first"
fi

ssl_copy=""
if [[ -f "$ROOT/$SSL_REL" ]]; then
  ssl_copy="$(mktemp)"
  cp -a "$ROOT/$SSL_REL" "$ssl_copy"
  echo "Saved local ${SSL_REL}"
fi
restore_ssl() {
  if [[ -n "$ssl_copy" && -f "$ssl_copy" ]]; then
    mkdir -p "$ROOT/nginx"
    cp -a "$ssl_copy" "$ROOT/$SSL_REL"
    echo "Restored local ${SSL_REL}"
  fi
}

echo "Fetching $SHA..."
git fetch --quiet origin "$SHA" || fail "git fetch of $SHA failed (is the commit on origin?)"
git cat-file -e "${SHA}^{commit}" || fail "$SHA is not a commit"

# shellcheck disable=SC1090
set -a
# Read only the keys we need. Do not print the file.
POSTGRES_USER="$(grep -E '^[[:space:]]*POSTGRES_USER=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
POSTGRES_PASSWORD="$(grep -E '^[[:space:]]*POSTGRES_PASSWORD=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
POSTGRES_DB="$(grep -E '^[[:space:]]*POSTGRES_DB=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
DATA_IP="$(grep -E '^[[:space:]]*DATA_SERVER_PRIVATE_IP=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
DATA_SSH="$(grep -E '^[[:space:]]*DATA_SSH_TARGET=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
set +a
POSTGRES_DB="${POSTGRES_DB:-sarh}"
[[ -n "$POSTGRES_USER" && -n "$DATA_IP" ]] || fail "POSTGRES_USER or DATA_SERVER_PRIVATE_IP missing in $ENV_FILE"

echo "Checking Postgres on ${DATA_IP}:5432..."
timeout 5 bash -c "exec 3<>/dev/tcp/${DATA_IP}/5432" || fail "cannot reach Postgres at ${DATA_IP}:5432"

echo "Pre-deploy backup..."
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
DUMP_FILE="${BACKUP_DIR}/sarh-${STAMP}.dump"
TMP_FILE="${DUMP_FILE}.partial"
backup_ok=0

if [[ -n "${DATA_SSH:-}" ]]; then
  echo "Taking the dump on the data server via ${DATA_SSH}..."
  if ssh -o BatchMode=yes -o ConnectTimeout=10 "$DATA_SSH" \
    "cd /opt/sarh && SARH_ROOT=/opt/sarh ./scripts/data-server/backup-postgres.sh"; then
    remote_latest="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$DATA_SSH" \
      "grep -E '^file=' /opt/backups/sarh/postgres/LATEST.txt | tail -n1 | cut -d= -f2-")"
    [[ -n "$remote_latest" ]] || fail "data server backup did not write LATEST.txt"
    scp -o BatchMode=yes "$DATA_SSH:$remote_latest" "$TMP_FILE"
    backup_ok=1
  else
    echo "WARN: data-server backup script failed; falling back to pg_dump over the private network."
  fi
fi

if [[ "$backup_ok" != 1 ]]; then
  command -v pg_dump >/dev/null || fail "pg_dump is not installed and the data-server SSH backup did not run"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$DATA_IP" -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --format=custom --no-owner --no-acl \
    > "$TMP_FILE"
fi
unset POSTGRES_PASSWORD

SIZE="$(stat -c%s "$TMP_FILE")"
[[ "$SIZE" -ge 1024 ]] || fail "backup is only ${SIZE} bytes"
if command -v pg_restore >/dev/null; then
  pg_restore --list "$TMP_FILE" >/dev/null || fail "backup failed pg_restore --list"
fi
mv "$TMP_FILE" "$DUMP_FILE"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$DUMP_FILE")" ) > "${DUMP_FILE}.sha256"
echo "Backup OK: ${DUMP_FILE} (${SIZE} bytes)"

echo "Checking out $SHA..."
git checkout --quiet "$SHA"
restore_ssl
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "$SHA")" ]] || fail "HEAD is not $SHA"

[[ -f "$ROOT/docker-compose.app.yml" ]] || fail "missing docker-compose.app.yml"
[[ -f "$ROOT/docker-compose.prod.ssl.yml" ]] || fail "missing docker-compose.prod.ssl.yml"

COMPOSE=(docker compose -f "$ROOT/docker-compose.app.yml" -f "$ROOT/docker-compose.prod.ssl.yml" --env-file "$ENV_FILE")
echo "Validating compose..."
"${COMPOSE[@]}" config -q

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
echo "Building images..."
"${COMPOSE[@]}" build api
"${COMPOSE[@]}" build admin
"${COMPOSE[@]}" build web

echo "Applying Prisma migrations (migrate deploy only)..."
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint npx api prisma migrate deploy

echo "Starting the stack..."
"${COMPOSE[@]}" up -d

echo "Waiting for API health..."
healthy=0
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:3001/api/health" >/dev/null; then
    healthy=1
    break
  fi
  sleep 3
done

if [[ "$healthy" != 1 ]]; then
  "${COMPOSE[@]}" logs --tail=80 api worker socket >&2 || true
  fail "API health check failed on 127.0.0.1:3001"
fi

public_ok=0
if curl -sf --max-time 15 "https://${DOMAIN}/api/health" >/dev/null; then
  public_ok=1
fi

echo ""
echo "=== DEPLOY SUCCESS ==="
echo "SHA: $(git rev-parse HEAD)"
echo "Backup: ${DUMP_FILE}"
echo "Local health: OK"
if [[ "$public_ok" == 1 ]]; then
  echo "Public health https://${DOMAIN}/api/health: OK"
else
  echo "Public health https://${DOMAIN}/api/health: not confirmed (local health passed)"
fi
echo "ssl-redirect.conf preserved: $([[ -n "$ssl_copy" ]] && echo yes || echo no)"
