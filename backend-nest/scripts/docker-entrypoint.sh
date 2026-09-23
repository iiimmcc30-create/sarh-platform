#!/bin/sh
set -eu

# Render web services must bind process.env.PORT quickly.
# Socket and worker skip migrate: only the API process owns prisma migrate deploy.
#
# If Render Docker Command is passed through as argv (node …), honor it first
# so sarh-worker never falls through to CMD ["api"] / dist/main.js.

if [ "${1:-}" = "node" ]; then
  echo "Starting command: $*"
  exec "$@"
fi

role="${SERVICE_MODE:-}"
if [ -z "$role" ]; then
  case "${1:-}" in
    socket | worker | api)
      role="$1"
      shift
      ;;
    *)
      role="api"
      ;;
  esac
fi

start_socket() {
  echo "Starting Socket.IO gateway on 0.0.0.0:${PORT:-3002}..."
  exec node dist/gateway/socket.main.js
}

start_worker() {
  echo "Starting queue worker..."
  exec node dist/queue/worker.main.js
}

start_api() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is not set."
    exit 1
  fi

  if [ -z "${DIRECT_URL:-}" ]; then
    echo "ERROR: DIRECT_URL is not set."
    echo "Supabase requires a session pooler URL (port 5432) for migrations."
    echo "Set DIRECT_URL to: postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
    exit 1
  fi

  echo "Checking database connectivity (DIRECT_URL)..."
  if ! node <<'NODE'
const net = require('net');
const { URL } = require('url');
try {
  const u = new URL(process.env.DIRECT_URL);
  const socket = net.connect({ host: u.hostname, port: Number(u.port || 5432) });
  const timer = setTimeout(() => { socket.destroy(); process.exit(1); }, 10000);
  socket.on('connect', () => { clearTimeout(timer); socket.end(); process.exit(0); });
  socket.on('error', () => { clearTimeout(timer); process.exit(1); });
} catch { process.exit(1); }
NODE
  then
    echo "ERROR: Database unreachable via DIRECT_URL."
    exit 1
  fi

  if [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
    echo "SKIP_MIGRATIONS=true — skipping migrate deploy (no schema changes)."
  else
    echo "Running prisma migrate deploy..."
    if ! timeout 120 npx prisma migrate deploy; then
      echo "ERROR: prisma migrate deploy failed."
      echo "Refusing to start. Production will not fall back to db push or alter schema automatically."
      exit 1
    fi
    echo "Migrations applied successfully."
  fi

  echo "Starting NestJS API on port ${PORT:-3001}..."
  exec node dist/main.js
}

case "$role" in
  socket) start_socket ;;
  worker) start_worker ;;
  api) start_api ;;
  *)
    echo "ERROR: Unknown SERVICE_MODE='$role' (expected api, socket, or worker)."
    exit 1
    ;;
esac
