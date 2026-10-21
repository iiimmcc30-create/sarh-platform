#!/usr/bin/env bash
# Deploy cbf0d12 (PRs #5 #6/#7 #8 #10 #11). Pattern copied from /root/deploy-councils.sh.
set -euo pipefail
cd /opt/sarh
TARGET=aac6dbe
TAG=20261021
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PREV="$(git rev-parse --short HEAD)"
echo "[$(date -u +%T)] start; server HEAD=$PREV target=$TARGET"

if ps aux | grep -E "app-server/(deploy|migrate)\.sh" | grep -v grep; then
  echo "ANOTHER_DEPLOY_RUNNING - abort"; exit 3
fi

echo "== 0. preflight"
git fetch -q origin main
git cat-file -e "$TARGET^{commit}"
# local nginx edits (getsarh.com) must already be in main, except ssl-redirect.conf (kept local)
for f in nginx/nginx.prod.conf nginx/nginx.ssl.server.conf; do
  # ignore the new compression.conf include lines added by PR #8 (expected)
  if git diff -U0 "$TARGET" -- "$f" | grep -E '^[-+][^-+]' | grep -vE '^[-+]\s*(include /etc/nginx/includes/compression\.conf;)?\s*$' | grep -q .; then
    echo "LOCAL $f DIFFERS FROM $TARGET - abort (nothing changed yet)"; git diff --stat "$TARGET" -- "$f"; exit 4
  fi
done
grep -q '^REDIS_PASSWORD=.\{16,\}' .env.app || { echo "REDIS_PASSWORD (16+ chars) missing in .env.app - abort (nothing changed yet)"; exit 5; }
echo "preflight OK"

echo "== 1. rollback tags from running images"
for pair in "sarh-backend:sarh-api-1" "sarh-web:sarh-web-1" "sarh-admin:sarh-admin-1"; do
  repo="${pair%%:*}"; ctr="${pair#*:}"
  img="$(docker inspect -f '{{.Image}}' "$ctr")"
  docker tag "$img" "$repo:rollback-$PREV-$TAG"
  echo "$repo:rollback-$PREV-$TAG -> $img"
done
{
  echo; echo "# $(date -u +%FT%TZ) before deploy of $TARGET: running = $PREV"
  echo "#   rollback code: cd /opt/sarh && git checkout --detach $PREV && cp -a /root/nginx-pre-$TARGET/nginx/. nginx/"
  echo "#   rollback images: for r in sarh-backend sarh-web sarh-admin; do docker tag \$r:rollback-$PREV-$TAG \$r:latest; done; ./scripts/app-server/deploy.sh is NOT needed: docker compose -f docker-compose.app.yml -f docker-compose.prod.ssl.yml --env-file .env.app up -d --no-build"
  echo "#   DB: Decimal migration is a type change; restore from /opt/backups/sarh/postgres/sarh-$STAMP-pre-$TARGET.dump only if really needed"
} >> "ROLLBACK-${TAG}.txt"

echo "== 2. postgres backup (data server over private network)"
BK=/opt/backups/sarh/postgres; mkdir -p "$BK"; chmod 700 "$BK"
F="sarh-$STAMP-pre-$TARGET.dump"
(
  set -a; source .env.app; set +a
  docker run --rm --network host -e PGPASSWORD="$POSTGRES_PASSWORD" -v "$BK:/bk" postgres:18-alpine \
    pg_dump -h "$DATA_SERVER_PRIVATE_IP" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/bk/$F"
)
sha256sum "$BK/$F" > "$BK/$F.sha256"
ls -l "$BK/$F"
N="$(docker run --rm -v "$BK:/bk" postgres:18-alpine pg_restore -l "/bk/$F" | grep -c 'TABLE DATA')"
echo "table-data entries: $N"
[[ "$N" -gt 20 ]] || { echo "BACKUP LOOKS TOO SMALL - abort"; exit 6; }

echo "== 3. save nginx + checkout $TARGET"
rm -rf "/root/nginx-pre-$TARGET"; mkdir -p "/root/nginx-pre-$TARGET"; cp -a nginx "/root/nginx-pre-$TARGET/"
SUM_BEFORE="$(sha256sum nginx/ssl-redirect.conf | cut -d' ' -f1)"
git checkout -- nginx/nginx.prod.conf nginx/nginx.ssl.server.conf nginx/ssl-redirect.conf nginx/ssl-redirect.conf.disabled
git checkout --detach "$TARGET"
cp -a "/root/nginx-pre-$TARGET/nginx/ssl-redirect.conf" nginx/ssl-redirect.conf
[[ "$(sha256sum nginx/ssl-redirect.conf | cut -d' ' -f1)" == "$SUM_BEFORE" ]] && echo "ssl-redirect.conf preserved"
git log --oneline -1

echo "== 4. build only"
BUILD_ONLY=1 ./scripts/app-server/deploy.sh

echo "== 5. migrate (4 new: hls_egress, golden_councils_join_code, user_review_comments, payment_amounts_decimal)"
ASSUME_YES=1 ./scripts/app-server/migrate.sh

echo "== 6. deploy"
./scripts/app-server/deploy.sh
echo "[$(date -u +%T)] DEPLOY_DONE"

echo "== 7. checks"
docker ps --format '{{.Names}} {{.Status}}' | grep sarh
docker exec sarh-nginx-1 nginx -t 2>&1 | tail -1
curl -s -m 10 http://127.0.0.1:3001/api/health | head -c 300; echo
for u in https://getsarh.com/ https://getsarh.com/api/health https://getsarh.com/admin https://getsarh.com/councils https://sarhsa.online/api/health; do
  echo "$u $(curl -s -o /dev/null -m 15 -w '%{http_code}' "$u")"
done
echo "route probes (expect 401, not 404):"
for p in "GET /api/councils" "GET /api/users/00000000-0000-4000-8000-000000000000/reviews"; do
  m="${p%% *}"; u="${p#* }"; echo "$p -> $(curl -s -o /dev/null -m 10 -X "$m" -w '%{http_code}' "http://127.0.0.1:3001$u")"
done
docker logs --since 3m sarh-api-1 2>&1 | grep -iE "error|exception" | grep -v "401\|Unauthorized" | tail -10 || true
echo "[$(date -u +%T)] ALL_DONE"
