#!/usr/bin/env bash
# Print EXACT row counts for every table (TSV: schema.table<TAB>rows). Read-only.
# Use before/after a switch or restore and diff the outputs.
#
# Data server (default):
#   SARH_ROOT=/opt/sarh ./scripts/data-server/table-counts.sh > /root/counts-after.tsv
# Old single-server stack (same project/service names):
#   DATA_COMPOSE_FILE=/opt/sarh/docker-compose.prod.yml ENV_FILE=/opt/sarh/.env.production \
#     ./scripts/data-server/table-counts.sh > /root/counts-before.tsv
set -euo pipefail
# shellcheck source=scripts/data-server/_common.sh
source "$(dirname "$0")/_common.sh"
require_env_file

PGU="$(env_get POSTGRES_USER)"
PGD="$(env_get POSTGRES_DB sarh)"
[[ -n "$PGU" ]] || { echo "ERROR: POSTGRES_USER missing in $ENV_FILE" >&2; exit 1; }

data_compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -At -F $'\t' \
  -U "$PGU" -d "$PGD" -c "$TABLE_COUNTS_SQL"
