#!/usr/bin/env bash
# EXPLICIT Prisma migrations for the two-server setup (never run on boot there:
# docker-compose.app.yml sets SKIP_MIGRATIONS=true).
#
#   ./scripts/app-server/migrate.sh --status-only   # read-only: prisma migrate status
#   ./scripts/app-server/migrate.sh                 # status -> confirm -> migrate deploy -> status
#
# Run `deploy` only after a fresh backup on the data server passed
# scripts/data-server/restore-verify.sh. Uses the built sarh-backend image in a
# one-off container (`run --rm` removes only that container). Never runs
# `migrate reset`, `migrate dev` or `db push`.
set -euo pipefail
# shellcheck source=scripts/app-server/_common.sh
source "$(dirname "$0")/_common.sh"
require_env_file

prisma() {
  "${APP_COMPOSE[@]}" run --rm --no-deps -T --entrypoint npx api prisma "$@"
}

echo "=== prisma migrate status ==="
status_rc=0
prisma migrate status || status_rc=$?
echo "(status exit code: ${status_rc}; non-zero usually means pending migrations or drift — read the output above)"

if [[ "${1:-}" == "--status-only" ]]; then
  exit 0
fi

echo ""
echo "migrate deploy applies ONLY pending migrations from backend-nest/prisma/migrations."
echo "Precondition: fresh pg_dump on the data server verified with restore-verify.sh."
if [[ "${ASSUME_YES:-}" != "1" ]]; then
  read -r -p "Type MIGRATE to run prisma migrate deploy: " answer
  [[ "$answer" == "MIGRATE" ]] || { echo "cancelled"; exit 1; }
fi

echo "=== prisma migrate deploy ==="
prisma migrate deploy
echo "=== prisma migrate status (after) ==="
prisma migrate status
