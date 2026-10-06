#!/usr/bin/env bash
# Prove a pg_dump is restorable WITHOUT touching the production database.
#
# Restores the dump into a THROWAWAY postgres container (no network, anonymous
# storage removed automatically with the container via --rm), then:
#   - every table with data in the dump exists after restore
#   - exact row counts per table (written next to the dump: <dump>.counts.tsv)
#   - _prisma_migrations present (Prisma can use the restored schema)
#   - optional: compare with live DB (--compare-live) or an expected counts file
#     (--expected FILE, exact match — use counts taken during a write freeze)
# The production cluster, its volume and its databases are never modified.
#
# Usage:
#   ./scripts/data-server/restore-verify.sh                       # latest dump (LATEST.txt)
#   ./scripts/data-server/restore-verify.sh /path/sarh-X.dump --compare-live
#   ./scripts/data-server/restore-verify.sh /path/sarh-X.dump --expected /root/counts-before.tsv
set -euo pipefail
export LC_ALL=C
# shellcheck source=scripts/data-server/_common.sh
source "$(dirname "$0")/_common.sh"

BACKUP_DIR="$(env_get BACKUP_DIR /opt/backups/sarh/postgres)"
PG_IMAGE="${PG_VERIFY_IMAGE:-postgres:18-alpine}"
VERIFY_MEM_LIMIT="${VERIFY_MEM_LIMIT:-768m}"

DUMP_FILE=""
COMPARE_LIVE=0
EXPECTED_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --compare-live) COMPARE_LIVE=1 ;;
    --expected) EXPECTED_FILE="${2:?--expected needs a file}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) DUMP_FILE="$1" ;;
  esac
  shift
done

if [[ -z "$DUMP_FILE" ]]; then
  DUMP_FILE="$(sed -n 's/^file=//p' "${BACKUP_DIR}/LATEST.txt" 2>/dev/null || true)"
fi
if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: dump not found (pass a path or run backup-postgres.sh first)" >&2
  exit 1
fi
DUMP_FILE="$(readlink -f "$DUMP_FILE")"
DUMP_DIR="$(dirname "$DUMP_FILE")"
DUMP_BASE="$(basename "$DUMP_FILE")"

echo "=== Restore verification: ${DUMP_FILE} ==="

if [[ -f "${DUMP_FILE}.sha256" ]]; then
  (cd "$DUMP_DIR" && sha256sum -c --quiet "${DUMP_BASE}.sha256")
  echo "SHA256 OK"
else
  echo "WARN: no ${DUMP_BASE}.sha256 sidecar — integrity not checked"
fi

WORK="$(mktemp -d)"
NAME="sarh-restore-verify-$(date +%s)-$$"
VERIFY_PW="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"

cleanup() {
  docker stop "$NAME" >/dev/null 2>&1 || true   # --rm removes it + its anonymous volume
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "Starting throwaway postgres (${PG_IMAGE}, --network none)..."
docker run -d --rm --name "$NAME" --network none --memory "$VERIFY_MEM_LIMIT" \
  -e POSTGRES_USER=verify -e POSTGRES_PASSWORD="$VERIFY_PW" -e POSTGRES_DB=restore_verify \
  -v "${DUMP_DIR}:/backup:ro" "$PG_IMAGE" >/dev/null

# The image's init phase runs a socket-only temp server; TCP readiness on
# 127.0.0.1 means the final server is up.
ready=0
for _ in $(seq 1 90); do
  if docker exec "$NAME" pg_isready -q -h 127.0.0.1 -U verify -d restore_verify 2>/dev/null; then
    ready=1; break
  fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo "ERROR: throwaway postgres did not become ready" >&2; exit 1; }

echo "Restoring (pg_restore --exit-on-error)..."
docker exec "$NAME" pg_restore -U verify -d restore_verify \
  --no-owner --no-acl --exit-on-error "/backup/${DUMP_BASE}"

vpsql() { docker exec -i "$NAME" psql -X -v ON_ERROR_STOP=1 -At -F $'\t' -U verify -d restore_verify "$@"; }

vpsql -c "$TABLE_COUNTS_SQL" > "$WORK/restored.tsv"
TABLES=$(wc -l < "$WORK/restored.tsv")
ROWS=$(awk -F'\t' '{s+=$2} END {print s+0}' "$WORK/restored.tsv")
echo "Restored tables: ${TABLES}, total rows: ${ROWS}"

fail=0
[[ "$TABLES" -gt 0 ]] || { echo "FAIL: no tables restored"; fail=1; }

# Every TABLE DATA entry in the archive must exist after restore.
docker exec "$NAME" pg_restore --list "/backup/${DUMP_BASE}" \
  | awk '$4=="TABLE" && $5=="DATA" {print $6"."$7}' | sort -u > "$WORK/expected-tables.txt"
cut -f1 "$WORK/restored.tsv" | sed 's/"//g' | sort -u > "$WORK/restored-tables.txt"
missing_tables=$(comm -23 "$WORK/expected-tables.txt" "$WORK/restored-tables.txt" || true)
if [[ -n "$missing_tables" ]]; then
  echo "FAIL: tables in dump but missing after restore:"; echo "$missing_tables"; fail=1
fi

if grep -q $'^public\._prisma_migrations\t' "$WORK/restored.tsv"; then
  applied=$(vpsql -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')
  unfinished=$(vpsql -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL')
  latest=$(vpsql -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1')
  echo "Prisma migrations: applied=${applied} unfinished=${unfinished} latest=${latest}"
  [[ "$unfinished" == 0 ]] || echo "WARN: unfinished Prisma migrations present in the source DB"
else
  echo "FAIL: _prisma_migrations table missing"; fail=1
fi

user_rows=$(awk -F'\t' '$1=="public.User"{print $2}' "$WORK/restored.tsv")
echo "Key data: public.User rows=${user_rows:-n/a}"
[[ "${user_rows:-0}" -gt 0 ]] || echo "WARN: public.User is empty in this dump"

cp "$WORK/restored.tsv" "${DUMP_FILE}.counts.tsv"
echo "Counts written: ${DUMP_FILE}.counts.tsv"

if [[ -n "$EXPECTED_FILE" ]]; then
  echo "Comparing with expected counts (exact): ${EXPECTED_FILE}"
  if diff <(sort "$EXPECTED_FILE") <(sort "$WORK/restored.tsv") > "$WORK/expected.diff"; then
    echo "Expected counts: EXACT MATCH"
  else
    echo "FAIL: counts differ from ${EXPECTED_FILE}:"; cat "$WORK/expected.diff"; fail=1
  fi
fi

if [[ "$COMPARE_LIVE" == 1 ]]; then
  require_env_file
  PGU="$(env_get POSTGRES_USER)"; PGD="$(env_get POSTGRES_DB sarh)"
  data_compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -At -F $'\t' \
    -U "$PGU" -d "$PGD" -c "$TABLE_COUNTS_SQL" > "$WORK/live.tsv"
  echo "Live vs restored (live keeps changing after the dump; differences are informational):"
  join -t $'\t' -a1 -a2 -e MISSING -o 0,1.2,2.2 \
    <(sort "$WORK/live.tsv") <(sort "$WORK/restored.tsv") \
    | awk -F'\t' '$2!=$3 {printf "  %-45s live=%s restored=%s\n",$1,$2,$3; d++} END {if(!d) print "  (identical)"}'
  live_only=$(comm -23 <(cut -f1 "$WORK/live.tsv" | sort -u) "$WORK/restored-tables.txt" || true)
  if [[ -n "$live_only" ]]; then
    echo "FAIL: tables in live DB missing from restore:"; echo "$live_only"; fail=1
  fi
fi

STATUS=$([[ "$fail" == 0 ]] && echo OK || echo FAILED)
cat > "${DUMP_DIR}/VERIFY-LATEST.txt" <<EOT
status=${STATUS}
file=${DUMP_FILE}
tables=${TABLES}
rows=${ROWS}
verified_utc=$(date -u +%Y%m%dT%H%M%SZ)
EOT

echo "RESTORE VERIFICATION: ${STATUS}"
[[ "$fail" == 0 ]]
