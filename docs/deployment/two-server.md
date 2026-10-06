# Sarh production — two servers (App Server + Data Server)

> **ملخص بالعربية**
> - **الخادم 1 (App Server)** — VPS جديد: Nginx + NestJS API (3001 داخلي) + Socket.IO (3002 داخلي) + BullMQ Worker + Web + Admin فقط. الملف: `docker-compose.app.yml` (+ `docker-compose.prod.ssl.yml`) مع `.env.app`.
> - **الخادم 2 (Data Server)** — **الخادم الحالي نفسه** بلا نقل بيانات: PostgreSQL + Redis + نسخ PostgreSQL الاحتياطية فقط. الملف: `docker-compose.data.yml` مع `.env.data`، ويعيد استخدام نفس الـ volumes الحالية (`sarh_postgres_data`, `sarh_redis_data`).
> - PostgreSQL وRedis **لا يُنشران على الإنترنت**: يُربطان فقط بالـ IP الخاص (شبكة المزوّد الخاصة أو نفق WireGuard)، مع جدار ناري (ufw + قواعد `DOCKER-USER` لأن منافذ Docker تتجاوز ufw).
> - Redis يحصل على `requirepass` (`REDIS_PASSWORD`) مع الإبقاء على `noeviction` و AOF كما هي.
> - **لا migrations تلقائية** على خادم التطبيق (`SKIP_MIGRATIONS=true`)؛ تشغيل يدوي صريح عبر `scripts/app-server/migrate.sh` بعد نسخة احتياطية مُتحقَّق منها.
> - الخطة الأساسية: تحويل الخادم الحالي **في مكانه** (إيقاف خدمات التطبيق فقط دون حذف أي volume)، والتراجع = تشغيل الـ stack القديم على نفس الـ volumes.

No real IPs, hostnames or credentials belong in this repository. Every value below is a
placeholder: `APP_SERVER_PUBLIC_IP`, `DATA_SERVER_PUBLIC_IP`, `APP_SERVER_PRIVATE_IP`,
`DATA_SERVER_PRIVATE_IP`, `ADMIN_SSH_IP`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB`, `REDIS_PASSWORD`.

---

## 1. Target architecture

```
                 Internet (https://sarhsa.online, DNS A -> APP_SERVER_PUBLIC_IP)
                                   │ 80/443
┌──────────────────────── APP SERVER (new VPS) ────────────────────────┐
│ nginx ─┬─ /api, /uploads, /health, /payment ─> api:3001 (127.0.0.1)  │
│        ├─ /socket.io ─────────────────────────> socket:3002 (127.0.0.1)│
│        ├─ /admin ─────────────────────────────> admin:3000            │
│        └─ / ──────────────────────────────────> web:80                │
│ worker (BullMQ)                                                      │
└───────────────┬──────────────────────────────────────────────────────┘
                │ private network or WireGuard (wg0), APP_SERVER_PRIVATE_IP
                │ TCP 5432 + 6379 only
┌───────────────▼──────── DATA SERVER (existing VPS) ───────────────────┐
│ postgres:18-alpine  DATA_SERVER_PRIVATE_IP:5432  vol sarh_postgres_data│
│ redis:7-alpine      DATA_SERVER_PRIVATE_IP:6379  vol sarh_redis_data   │
│   (AOF, maxmemory 256mb, noeviction, requirepass)                      │
│ cron: pg_dump daily + weekly restore drill + off-site copy             │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. Current state (inspected)

| Area | Finding |
|------|---------|
| Compose | `docker-compose.prod.yml` (+ `docker-compose.prod.ssl.yml` overriding nginx only), project `sarh`, single bridge `sarh_internal`. Services: postgres, redis, api, worker, socket, admin, web, nginx. Postgres/Redis not published. |
| Volumes | `sarh_postgres_data` → `/var/lib/postgresql` (PG 18), `sarh_redis_data` → `/data`. |
| Prisma | `schema.prisma` uses `DATABASE_URL` + `directUrl = DIRECT_URL`; compose builds both from `POSTGRES_*` with host `postgres`. One `PrismaClient` per process (api, worker, socket), default pool size. |
| Migrations | `backend-nest/scripts/docker-entrypoint.sh`: API role runs `prisma migrate deploy` on start unless `SKIP_MIGRATIONS=true` (flag already exists). Socket/worker never migrate. |
| Redis | All app clients come from `src/redis/redis-connection.ts` → `redisConnection()`: `REDIS_URL` (password percent-decoded) else `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`. Used by cache (db0), BullMQ (db1, shared client + duplicates), sessions (db2), Socket.IO redis adapter + disconnect pub/sub (db3). **Password is honoured everywhere in app code.** |
| Redis gap | The **worker container healthcheck** in compose built its own ioredis client with host/port only → would report unhealthy once Redis requires a password. Fixed (see §11). |
| Socket.IO | `@socket.io/redis-adapter` on db3 (production refuses to start without Redis). Clients use `transports: ['websocket','polling']`. |
| BullMQ | `bullRootConfig()` shared connection; queues: notifications, emails, push, fee-checks (delayed jobs), image-processing, subscriptions. |
| Nginx | `nginx/nginx.prod.conf` proxies to Docker service names (`api:3001`, `socket:3002`, `admin:3000`, `web`) via Docker DNS — unchanged on the app server. |
| Health | API `GET /api/health`, `GET /api/health/ready` (DB + Redis + worker heartbeat), socket `GET /health`, worker heartbeat key `sarh:worker:heartbeat`, admin `/admin/login`. |
| Backups | `scripts/hostinger/09-backup-postgres.sh` (pg_dump custom, sha256, 14 days) via cron 03:15; `10-restore-postgres.sh` is a destructive `--clean` restore into the live DB. |
| Server facts | Redis today: `appendonly yes`, `maxmemory 256mb`, `noeviction`, **no requirepass**. ufw **inactive**. An unrelated `sarh-butcher` stack runs on the same host (127.0.0.1:3100-3104 and its bridge gateway) — must keep working. |

## 3. Files

| File | Purpose |
|------|---------|
| `docker-compose.app.yml` | App server: api, worker, socket, admin, web, nginx. Same images/healthchecks/nginx mounts as prod. Builds `DATABASE_URL`/`DIRECT_URL` from `POSTGRES_*` + `DATA_SERVER_PRIVATE_IP`; Redis via `REDIS_HOST=DATA_SERVER_PRIVATE_IP` + required `REDIS_PASSWORD`; `REDIS_URL` forced empty; `SKIP_MIGRATIONS` defaults to `true`. Use with `docker-compose.prod.ssl.yml` unchanged. |
| `docker-compose.data.yml` | Data server: postgres + redis only. **Same project name `sarh`, same service names, same volumes** (declared `external`, names overridable via `POSTGRES_VOLUME_NAME`/`REDIS_VOLUME_NAME`). Ports published only on `DATA_SERVER_PRIVATE_IP`. Redis adds `--requirepass`. |
| `.env.app.example` / `.env.data.example` | Placeholder templates (real `.env.app` / `.env.data` are git-ignored). |
| `scripts/data-server/switch-to-data-only.sh` | Guarded in-place conversion (pre-flight checks, stop app services only, start data compose, health/auth checks). |
| `scripts/data-server/rollback-to-single-server.sh` | Start the old full stack again on the same volumes. |
| `scripts/data-server/setup-firewall.sh` | ufw + persistent `DOCKER-USER` rules (dry-run by default). |
| `scripts/data-server/backup-postgres.sh` | Daily pg_dump (custom), TOC check, sha256, lock, retention (newest N always kept). |
| `scripts/data-server/restore-verify.sh` | Restores a dump into a throwaway container and checks tables, exact row counts, `_prisma_migrations`; optional live/expected comparison. |
| `scripts/data-server/table-counts.sh` | Exact per-table row counts (read-only). |
| `scripts/data-server/backup-cron.example` | Cron: daily backup, weekly restore drill, off-site copy. |
| `scripts/wireguard/setup-wireguard.sh`, `wg0.*.conf.example` | WireGuard tunnel (keys stay on the servers). |
| `scripts/app-server/deploy.sh` / `verify.sh` / `migrate.sh` | Build+start (no migrations), read-only verification, explicit migrations. |
| `scripts/app-server/certbot-renew.cron.example` | Certificate renewal on the app server. |
| `scripts/hostinger/validate-env.sh` | New `ENV_PROFILE=app|data` (default `production` output unchanged). |

## 4. Private connectivity (choose one)

PostgreSQL/Redis are **never** published on `0.0.0.0` or the public IP in any option.
`DATA_SERVER_PRIVATE_IP` is the address they bind to; `APP_SERVER_PRIVATE_IP` is the only
client allowed.

### Option A — provider private network (if Hostinger offers one for both VPSes)
1. Attach both VPSes to the same private network; note each server's private IP.
2. Make sure the private interface comes up at boot **before Docker** (otherwise binding to
   that IP fails with `cannot assign requested address`).
3. Use those IPs as `DATA_SERVER_PRIVATE_IP` / `APP_SERVER_PRIVATE_IP`.

### Option B — WireGuard tunnel (preferred when no private network exists)
Pick an unused RFC1918 /24 for the tunnel (example only: data `10.88.0.1`, app `10.88.0.2`).
```bash
# both servers (root, repo at /opt/sarh)
ROLE=data ./scripts/wireguard/setup-wireguard.sh keygen      # on data server → prints public key
ROLE=app  ./scripts/wireguard/setup-wireguard.sh keygen      # on app server  → prints public key

# data server
ROLE=data PEER_PUBLIC_KEY=<APP_WG_PUBKEY> \
  DATA_SERVER_PRIVATE_IP=<data tunnel ip> APP_SERVER_PRIVATE_IP=<app tunnel ip> \
  ./scripts/wireguard/setup-wireguard.sh configure
# app server
ROLE=app PEER_PUBLIC_KEY=<DATA_WG_PUBKEY> DATA_SERVER_PUBLIC_IP=<DATA_SERVER_PUBLIC_IP> \
  DATA_SERVER_PRIVATE_IP=<data tunnel ip> APP_SERVER_PRIVATE_IP=<app tunnel ip> \
  ./scripts/wireguard/setup-wireguard.sh configure
ping -c3 <data tunnel ip>     # from the app server
```
- Private keys live only in `/etc/wireguard/wg0.key` (0600), loaded by `PostUp`.
- On the data server the script adds a `docker.service` drop-in
  (`After=wg-quick@wg0.service`) so 5432/6379 can bind to the tunnel IP after a reboot.
- UDP 51820 on the data server is allowed **only from `APP_SERVER_PUBLIC_IP`**
  (`setup-firewall.sh` with `APP_SERVER_PUBLIC_IP=...`). The app server initiates the
  tunnel (`PersistentKeepalive = 25`), so it needs no inbound UDP rule.
- Both servers should be in the same region/datacenter: the shared Redis clients use
  `connectTimeout 800ms` / `commandTimeout 500ms` (`redis-connection.ts`).

## 5. Firewall

### Data server — `scripts/data-server/setup-firewall.sh`
Docker-published ports are DNAT'ed in `PREROUTING` and traverse `FORWARD`, so **ufw INPUT
rules do not protect them**. Two layers are therefore used:
1. `docker-compose.data.yml` binds `DATA_SERVER_PRIVATE_IP:5432` / `:6379` only — nothing
   listens on the public interface.
2. Persistent `DOCKER-USER` rules (managed block in `/etc/ufw/after.rules`): connections
   originally addressed to `DATA_SERVER_PRIVATE_IP:5432|6379` are accepted only from
   `APP_SERVER_PRIVATE_IP` (+ `EXTRA_APP_SERVER_IPS`), everything else is dropped. Container
   egress and same-bridge traffic of other stacks are not matched.

ufw itself: allow SSH from `ADMIN_SSH_IP` (else rate-limited from anywhere), WireGuard
UDP from `APP_SERVER_PUBLIC_IP`, 5432/6379 from the app IP; default deny incoming. Traffic
from local Docker bridges (`docker0`, `br-*`) to the host stays allowed, so **sarh-butcher
(127.0.0.1:3100-3104 and its bridge gateway) is unaffected**; loopback is always allowed by ufw.
```bash
DRY_RUN=1 ADMIN_SSH_IP=<ADMIN_SSH_IP> APP_SERVER_PUBLIC_IP=<APP_SERVER_PUBLIC_IP> \
  ./scripts/data-server/setup-firewall.sh       # review plan + list of public listeners
DRY_RUN=0 ADMIN_SSH_IP=<ADMIN_SSH_IP> APP_SERVER_PUBLIC_IP=<APP_SERVER_PUBLIC_IP> \
  ./scripts/data-server/setup-firewall.sh       # apply (ufw is inactive today → this enables it)
```
- Keep an SSH session open while enabling; confirm a **new** SSH login works before closing it.
- The dry run prints non-loopback listeners; anything host-level not allowed becomes
  unreachable from outside (Docker-published ports are not affected by ufw). If sarh-butcher
  or anything else must stay publicly reachable on a host-level port, pass
  `EXTRA_ALLOW_TCP="port1,port2"`.
- Verify from a machine that is **not** the app server:
  `nc -vz -w3 <DATA_SERVER_PUBLIC_IP> 5432` and `6379` → must fail;
  from the app server `nc -vz -w3 <DATA_SERVER_PRIVATE_IP> 5432/6379` → must succeed.
- IPv6: the ports are bound to an IPv4 address only, so nothing is exposed over IPv6.

### App server (ufw)
```bash
ufw allow proto tcp from <ADMIN_SSH_IP> to any port 22   # or: ufw limit 22/tcp
ufw allow 80/tcp && ufw allow 443/tcp
ufw default allow outgoing && ufw default deny incoming && ufw enable
```
API (3001) and socket (3002) are published on `127.0.0.1` only; nginx publishes 80/443.

## 6. Environment files

### Data server `/opt/sarh/.env.data` (chmod 600)
From `.env.data.example`:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: **copy the current values from
  `.env.production`** (the existing cluster keeps its role/password — no rotation; these
  variables are only used by initdb on an empty volume).
- `DATA_SERVER_PRIVATE_IP`, `APP_SERVER_PRIVATE_IP`.
- `REDIS_PASSWORD`: new, e.g. `openssl rand -hex 32` (hex = no quoting/URL issues).
- `POSTGRES_VOLUME_NAME=sarh_postgres_data`, `REDIS_VOLUME_NAME=sarh_redis_data` (verify, §8 step 0).
- Leave `.env.production` **unchanged** — it is what the rollback uses.

### App server `/opt/sarh/.env.app` (chmod 600)
Start from the current `.env.production` (all app secrets identical: JWT, Twilio, Google,
Firebase, Cloudinary, NI/N-Genius, SMTP, CRON_SECRET, …) and adjust per `.env.app.example`:
- add `DATA_SERVER_PRIVATE_IP`, `REDIS_PASSWORD` (same as `.env.data`), `SKIP_MIGRATIONS=true`;
- `POSTGRES_*` same values as the data server. `POSTGRES_PASSWORD` is embedded verbatim in
  the connection URL → must be URL-safe (`[A-Za-z0-9._~-]`) or percent-encoded. The current
  compose already embeds it the same way, so the existing value works as-is;
- `DATABASE_URL`/`DIRECT_URL`/`REDIS_HOST`/`REDIS_URL` lines are overridden by the compose
  file — delete them to avoid confusion.
Validate: `ENV_PROFILE=app ./scripts/hostinger/validate-env.sh` (no secret output).

## 7. Migrations policy

- `docker-compose.app.yml` sets `SKIP_MIGRATIONS=${SKIP_MIGRATIONS:-true}` for the API.
  This **reuses the existing entrypoint flag** instead of adding a new one: the single-server
  `docker-compose.prod.yml` keeps its current behaviour (migrate on start) byte-for-byte, and
  no runtime logic changed. With several app servers, migrate-on-boot would also race.
- Explicit procedure (app server):
  ```bash
  ./scripts/app-server/migrate.sh --status-only   # read-only: prisma migrate status
  # fresh backup on the data server + restore-verify.sh OK, then:
  ./scripts/app-server/migrate.sh                 # asks for "MIGRATE", runs migrate deploy, shows status
  ```
- **Known pending migration `20261006120000_user_reviews`:** the production DB already has
  `User.rating`, `User.reviewCount` and `UserReview` (with its indexes/FKs) but the migration is
  not recorded in `_prisma_migrations`. The SQL is fully idempotent (`ADD COLUMN IF NOT
  EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`, FKs guarded by a
  `pg_constraint` lookup) — verified by applying it twice on PostgreSQL. `migrate deploy`
  will therefore only emit "already exists, skipping" notices and record the row. The app works
  without it (objects exist), so apply it **after** the cut-over is stable, after a fresh
  verified backup and after reviewing `migrate status` output.
- Never run `prisma migrate reset`, `migrate dev` or `db push` against production.

## 8. Primary plan — in-place conversion of the existing server (no data move)

### Phase 0 — preparation (no downtime)
0. **Data server: confirm names** (read-only):
   ```bash
   docker volume ls | grep -E 'sarh_(postgres|redis)_data'
   docker inspect sarh-postgres-1 --format '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{"\n"}}{{end}}'
   docker inspect sarh-redis-1    --format '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{"\n"}}{{end}}'
   docker network ls | grep sarh_internal
   ```
   Expected: `sarh_postgres_data -> /var/lib/postgresql`, `sarh_redis_data -> /data`. If
   different, set `POSTGRES_VOLUME_NAME` / `REDIS_VOLUME_NAME` in `.env.data`.
   `switch-to-data-only.sh` re-checks this and aborts on mismatch.
1. Data server: `git pull` in `/opt/sarh` (adds files only; running containers are not
   recreated). Create `.env.data`; `ENV_PROFILE=data ./scripts/hostinger/validate-env.sh`.
2. Private connectivity (§4). Make sure `DATA_SERVER_PRIVATE_IP` is assigned on the data server
   (`ip -4 addr`).
3. Firewall **dry run** on the data server (§5).
4. App server: install Docker + compose plugin, clone the repo to `/opt/sarh`, create
   `.env.app`, then `BUILD_ONLY=1 ./scripts/app-server/deploy.sh` (validates env, builds images,
   starts nothing).
5. TLS for the app server: copy `/etc/letsencrypt` from the data server to the app server
   (as an admin, e.g. `tar czf` → `scp` → extract, keep permissions), create `/var/www/certbot`.
   With the cert present, `deploy.sh` uses `docker-compose.prod.ssl.yml` automatically.
6. Lower the DNS TTL for `sarhsa.online` and `www` (e.g. 300 s) a day before (or use the
   Cloudflare proxy, where switching the origin is immediate).

### Phase 1 — verified backup (no downtime)
```bash
# data server, before the switch (old stack still running)
DATA_COMPOSE_FILE=/opt/sarh/docker-compose.prod.yml ENV_FILE=/opt/sarh/.env.production \
  ./scripts/data-server/backup-postgres.sh
DATA_COMPOSE_FILE=/opt/sarh/docker-compose.prod.yml ENV_FILE=/opt/sarh/.env.production \
  ./scripts/data-server/restore-verify.sh --compare-live     # must end with "RESTORE VERIFICATION: OK"
```
Copy that dump off the server as well (it is the rollback of last resort).

### Phase 2 — maintenance window (short downtime)
1. Data server: `./scripts/data-server/switch-to-data-only.sh` (type `SWITCH`). It refuses to
   run without a passing restore verification younger than 6 h, stops **only**
   `nginx web admin socket worker api` (`compose stop`; containers and volumes stay), recreates
   `postgres` + `redis` from `docker-compose.data.yml` on the same volumes, bound to
   `DATA_SERVER_PRIVATE_IP`, Redis with `requirepass`, and checks health, `NOAUTH` for
   anonymous clients, keyspace, `noeviction` and `appendonly`.
2. Data server: `DRY_RUN=0 ... ./scripts/data-server/setup-firewall.sh` (§5) and the outside
   `nc` checks.
3. App server: `./scripts/app-server/migrate.sh --status-only` → expect only
   `20261006120000_user_reviews` pending (do **not** deploy it yet unless reviewed).
4. App server: `./scripts/app-server/deploy.sh` then `./scripts/app-server/verify.sh`
   (TCP to data server, Redis auth + NOAUTH, `/api/health`, `/api/health/ready` = DB + Redis +
   worker heartbeat, socket health + polling handshake, admin/web/payment-bridge via nginx).
5. Pre-DNS HTTPS test from your PC:
   `curl --resolve sarhsa.online:443:<APP_SERVER_PUBLIC_IP> https://sarhsa.online/api/health`
6. Switch DNS A records (`sarhsa.online`, `www`) to `APP_SERVER_PUBLIC_IP`.
   Then `PUBLIC=1 ./scripts/app-server/verify.sh`.

### Phase 3 — functional verification (no real payment)
- Auth: OTP login with a test number; Google login; refresh token/session (Redis db2).
- Listings/Posts/Collections: browse (read) and one create/edit with a test account (write).
- Messaging + notifications: two test accounts, real-time message (Socket.IO via redis adapter),
  push/in-app notification (BullMQ → worker logs: `docker compose -f docker-compose.app.yml logs worker`).
- Admin: `https://sarhsa.online/admin` login and section navigation (JWT_SECRET in admin).
- Web: `https://sarhsa.online/`.
- N-Genius auth only (gets an access token, **no transaction**):
  ```bash
  docker compose -f docker-compose.app.yml --env-file .env.app run --rm --no-deps -T \
    -v "$PWD/backend-nest/scripts/test-ni-auth.js:/app/test-ni-auth.js:ro" \
    --entrypoint node api test-ni-auth.js
  ```
  Webhooks/return URLs use the domain (`/payment/result`, `/payment/cancel`) and follow DNS.
- Data server: `./scripts/data-server/table-counts.sh` (sanity; same volume, so nothing moves).

### Phase 4 — after the cut-over is stable
- Data server cron: replace the `09-backup-postgres.sh` line with
  `scripts/data-server/backup-cron.example` (same backup dir/naming; old dumps keep pruning) and
  add the weekly restore drill + an **off-site** copy.
- Remove `/etc/cron.d/sarh-certbot-renew` on the data server (its nginx is stopped) and install
  `scripts/app-server/certbot-renew.cron.example` on the app server.
- Apply `20261006120000_user_reviews` via `migrate.sh` after a fresh verified backup (§7).
- Review host crontabs on the data server for jobs that called the local API (e.g. with
  `CRON_SECRET`) and point them at `https://sarhsa.online` or move them to the app server.
- Keep the stopped app containers on the data server for the rollback window. Removing them
  later is optional (`docker compose -f docker-compose.prod.yml rm api worker socket admin web nginx`
  — never with `-v`, never `docker volume rm`).

### Rollback (any time)
1. App server: `docker compose -f docker-compose.app.yml -f docker-compose.prod.ssl.yml --env-file .env.app stop`
2. DNS back to `DATA_SERVER_PUBLIC_IP` (if already switched).
3. Data server: `./scripts/data-server/rollback-to-single-server.sh` (type `ROLLBACK`): recreates
   postgres/redis with the original definitions (unpublished, no password — `.env.production`
   is unchanged) and starts all app services on the **same volumes**, so every write made via the
   app server is kept. Then `./scripts/hostinger/05-verify.sh`.
4. ufw/DOCKER-USER rules can stay (they only concern 5432/6379 on the private IP; nginx's
   published 80/443 are not filtered by ufw).

## 9. Backups and restore

- **Daily** `backup-postgres.sh`: `pg_dump --format=custom --no-owner --no-acl` from the running
  container (consistent snapshot, no downtime), size check, `pg_restore --list` TOC check, sha256
  sidecar, `LATEST.txt`, lock against overlap, atomic rename (`.partial`). Retention: the newest
  `BACKUP_MIN_KEEP` (7) are always kept; older dumps beyond `RETENTION_DAYS` (14) are pruned.
- **Weekly** `restore-verify.sh --compare-live`: restores into a throwaway `postgres:18-alpine`
  container (`--network none`, removed with its anonymous storage) — the production cluster is
  never touched — and checks every dumped table exists, exact row counts
  (`<dump>.counts.tsv`), `_prisma_migrations`, `User` non-empty, live-vs-restored diff.
  `--expected FILE` does an exact comparison against counts captured during a write freeze.
- **Off-site**: the Docker volume and a local dump on the same disk are not backups. Configure
  `rclone`/restic to object storage (see cron example) and test a download occasionally.
- **Disaster restore (non-destructive)**: restore into a **new** database and point the app at it
  instead of overwriting the live one:
  ```bash
  docker compose -f docker-compose.data.yml --env-file .env.data exec -T postgres \
    createdb -U "$POSTGRES_USER" sarh_restore_YYYYMMDD
  docker compose -f docker-compose.data.yml --env-file .env.data exec -T postgres \
    pg_restore -U "$POSTGRES_USER" -d sarh_restore_YYYYMMDD --no-owner --no-acl --exit-on-error \
    < /opt/backups/sarh/postgres/sarh-YYYYMMDDTHHMMSSZ.dump
  # then POSTGRES_DB=sarh_restore_YYYYMMDD in .env.app and recreate api/worker/socket
  ```
  (`scripts/hostinger/10-restore-postgres.sh` remains for the single-server stack; it is
  destructive — `--clean` into the live DB.)

## 10. Optional alternative — fresh data server via pg_dump → pg_restore

Only if the data server must be a different machine:
1. Freeze writes on the old server: `docker compose -f docker-compose.prod.yml -f docker-compose.prod.ssl.yml --env-file .env.production stop nginx web admin socket worker api`.
2. Old server: `table-counts.sh` (with `DATA_COMPOSE_FILE=.../docker-compose.prod.yml ENV_FILE=.../.env.production`) → `counts-before.tsv`; `backup-postgres.sh`; `restore-verify.sh <dump> --expected counts-before.tsv` must be an EXACT MATCH.
3. Transfer dump + `.sha256` (+ counts) with `scp`/`rsync` over SSH; `sha256sum -c` on arrival.
4. New server: `docker volume create sarh_postgres_data` and `sarh_redis_data`, `.env.data`,
   `docker compose -f docker-compose.data.yml --env-file .env.data up -d`, then
   `pg_restore --no-owner --no-acl --exit-on-error` into the empty DB (as in §9) and compare
   `table-counts.sh` with `counts-before.tsv` (must match exactly).
5. Redis: BullMQ delayed jobs (fee checks) and sessions live in Redis. Either copy the stopped old
   Redis `/data` (AOF dir) into the new `sarh_redis_data` volume before first start, or accept that
   in-flight delayed jobs and Redis sessions are lost.
6. Only after all checks pass, point the app server at the new `DATA_SERVER_PRIVATE_IP`. The old
   server stays untouched as rollback.

## 11. Code / config changes and why

- **Worker healthcheck Redis password** (`docker-compose.prod.yml`, `docker-compose.app.yml`):
  the inline ioredis client in the worker healthcheck ignored `REDIS_PASSWORD`, so with
  `requirepass` the worker would be marked unhealthy (BullMQ itself was fine because it uses
  `redisConnection()`). Added `password: process.env.REDIS_PASSWORD || undefined` — identical
  behaviour when no password is set.
- **App code**: no change needed; `redisConnection()` already applies `REDIS_URL` password
  (percent-decoded) or `REDIS_PASSWORD` to every client (cache, sessions, BullMQ + duplicates,
  socket adapter pub/sub, disconnect channel). Unit tests added to lock this in.
- `docker-compose.app.yml` sets `REDIS_URL: ''` because `REDIS_URL` wins over host/password in
  `redisConnection()`; a stale value copied from an old env file could otherwise bypass the
  data server settings.

## 12. Scaling to a load balancer + multiple app servers

Nothing on the data server needs redesign:
- **API is stateless** (JWT; sessions/cache in shared Redis; media on Cloudinary/S3 —
  `STORAGE_PROVIDER=local` is rejected in production).
- **Socket.IO** already uses the Redis adapter (db3) and a Redis pub/sub channel for forced
  disconnects, so events reach users on any instance. Clients allow the `polling` transport,
  so the load balancer must use **sticky sessions for `/socket.io/`** (cookie or `ip_hash`),
  or clients must be switched to websocket-only.
- **BullMQ** workers on several servers share the same Redis queues; job IDs are deterministic
  (e.g. fee checks) so duplicates are de-duplicated by BullMQ.
- **Firewall**: add each new app server with `EXTRA_APP_SERVER_IPS=...` (and a WireGuard peer).
- **Connection budget**: each process (api, worker, socket) opens a Prisma pool of
  `2 × CPUs + 1` by default. Keep `app_servers × 3 × pool` well below PostgreSQL
  `max_connections` (100). Set e.g. `DATABASE_URL_PARAMS=?connection_limit=10` in `.env.app`.
  Beyond that, add **PgBouncer** (transaction mode) on the data server: `DATABASE_URL` →
  PgBouncer with `pgbouncer=true`, `DIRECT_URL` → PostgreSQL directly for migrations (the schema
  already declares `directUrl`).
- Run `migrate.sh` from **one** app server only (migrations never run on boot).

## 13. Optional: PostgreSQL TLS on the private link
Baseline security is private IP binding + firewall (+ WireGuard encryption in option B). On a
provider private network (unencrypted), TLS can be added: mount a server cert/key into the
postgres container, start with `-c ssl=on -c ssl_cert_file=... -c ssl_key_file=...`, then set
`DATABASE_URL_PARAMS=?sslmode=require` and `DIRECT_URL_PARAMS=?sslmode=require` in `.env.app`.
Redis TLS needs a TLS-enabled Redis config and `rediss://` (not covered; use WireGuard instead).

## 14. Never
- `docker compose down -v`, `docker volume rm`, `docker system prune --volumes` on the data server.
- Publishing 5432/6379 on `0.0.0.0` or a public IP, or relying on ufw alone for Docker ports.
- Committing `.env.app`, `.env.data`, `.env.production`, dumps or WireGuard keys.
- Running the app server and the old full stack against the same DB at the same time.
