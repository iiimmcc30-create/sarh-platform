# Redis

## 1. Business Purpose

Redis provides entity caching, rate limiting, session/token storage, BullMQ backing, Socket.IO clustering, distributed cron locks, and upload rate limits.

**Who uses it:** All backend processes when `REDIS_ENABLED !== 'false'`.

---

## 2. Frontend Flow

Clients do not connect to Redis directly. Effects are indirect (faster API, rate limits, realtime).

---

## 3. API Flow

No public Redis API. Health check reports cache/session ping: `GET /api/health`.

---

## 4. Backend Flow

| Service | File | DB |
|---------|------|-----|
| `RedisCacheService` | `redis/services/redis-cache.service.ts` | **0** |
| `RedisSessionService` | `redis/services/redis-session.service.ts` | **2** |
| BullMQ | `queue/constants.ts` `QUEUE_CONNECTION.db` | **1** |
| Socket.IO adapter | `socket-redis-adapter.service.ts` | **3** |
| Socket disconnect pub/sub | `socket-disconnect.service.ts` | **3** |
| Rate limiter | `rate-limit.service.ts` | **0** |

`RedisService` facade exposes cache + session helpers.

---

## 5. Database

Redis is not the primary store. PostgreSQL remains source of truth; cache TTLs are short (default 300s).

---

## 6. Socket

DB **3**: `@socket.io/redis-adapter` for horizontal scaling; channel `socket:disconnect` for forced logout.

---

## 7. Notifications

No dedicated notification cache. Queue on DB 1 handles async notification jobs.

---

## 8. Redis Keys & DBs

### DB 0 — Cache & limits

| Key pattern | TTL | Purpose |
|-------------|-----|---------|
| `user:{id}` | 300s | User profile cache |
| `listing:{id}` | 300s | Listing detail |
| `listings:v2:{json}` | 90s | Listing list pages |
| `listings:{page}:{filters}` | — | Legacy pattern in `CacheKeys` |
| `post:{id}` | — | Post cache |
| `posts:{page}` | — | Post list |
| `butcher:{id}` | 300s | Butcher profile |
| `butchers:{country}:{page}` | 180s | Butcher list |
| `feed:{userId}:{page}` | — | User feed |
| `streams:live` | 15s | Active live streams |
| `stories:feed:{viewerId\|anon}` | 20s | Stories feed |
| `stories:feed:*` | — | Pattern invalidation |
| `butchers:stories:active` | 30s | Butcher stories list |
| `subscription:{userId}` | varies | Subscription view cache |
| `subscription:reminder:{userId}:{kind}` | NX lock | Reminder dedup |
| `online:{userId}` | 3600s | Socket presence |
| `rl:api:{ip}` | 900s window | API rate limit |
| `rl:auth:{ip}` | 900s | Auth rate limit |
| `rl:payment:{ip}` | 3600s | Payment rate limit |
| `cron:fee_check:lock` | 120s | Fee cron lock |
| `cron:db_cleanup:lock` | 300s | Cleanup cron lock |
| `cron:subscription:lock` | 300s | Subscription cron lock |
| `cron:subscription:weekly_reset` | 300s | Weekly live minutes reset |

### DB 1 — BullMQ

All queue metadata and jobs for: `notifications`, `emails`, `push-notifications`, `fee-checks`, `image-processing`, `subscriptions`.

### DB 2 — Session

| Key pattern | TTL | Purpose |
|-------------|-----|---------|
| `blacklist:{accessToken}` | 900s | Revoked JWT |
| `email_verify:{userId}` | 600s | Email verification code |
| `email_verify_cooldown:{userId}` | — | Resend cooldown |
| `upload_count:{userId}` | 3600s | Upload rate limit (hourly) |

### DB 3 — Socket

Socket.IO adapter channels + `socket:disconnect` pub/sub (no app-defined key prefix beyond adapter internals).

---

## 9. BullMQ

Uses DB 1 exclusively. Disabled when `REDIS_ENABLED=false` — queues no-op.

---

## 10. Security

- Redis should not be exposed publicly
- Session DB holds short-lived auth artifacts
- Dev mode may skip cache when Redis unavailable (`markedUnavailable`)

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Dev silently drops cache | `RedisCacheService.markUnavailable` |
| Rate limit bypass in development | `NODE_ENV === 'development'` skips limits |
| Upload counter on session DB not cache DB | Intentional but easy to mis-document |
| Multiple DBs on one instance | Requires Redis `SELECT` support |

---

## 12. Production Readiness: **90%**

Four-DB layout is clear and used consistently. Ensure `REDIS_ENABLED=true` and persistence policy in prod.

**Main files:** `backend-nest/src/redis/`, `backend-nest/src/common/services/rate-limit.service.ts`
