#!/usr/bin/env bash
# Run real (live) E2E suites against local stack:
#   API :3001  |  admin :3000  |  app web :8081
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Ensure E2E admin user"
(cd "$ROOT/backend-nest" && npm run ensure:e2e-admin)

echo "==> LIVE API journeys"
(cd "$ROOT/backend-nest" && npm run test:e2e:live)

echo "==> Admin panel Playwright"
(cd "$ROOT/admin-panel" && npm run test:e2e)

echo "==> App web Playwright"
(cd "$ROOT/app" && npm run test:e2e)

echo "==> All live E2E passed"
