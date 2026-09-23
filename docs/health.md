# Health Check

## 1. Business Purpose

Liveness/readiness probe for load balancers and ops to verify API dependencies: PostgreSQL, Redis cache/session, and BullMQ connectivity.

---

## 2. Frontend Flow

Not used by mobile or admin UI.

---

## 3. API Flow

| Method | URL | Auth |
|--------|-----|------|
| GET | `/api/health` | **Public** (`@Public`) — liveness (DB required) |
| GET | `/api/health/ready` | **Public** — readiness (DB + Redis + queue + worker when Redis enabled) |

**Response (200 or 503):**
```json
{
  "status": "ok" | "degraded",
  "checks": {
    "db": boolean,
    "redis_cache": boolean,
    "redis_session": boolean,
    "queue": boolean,
    "worker": boolean
  },
  "duration": "12ms",
  "uptime": 3600,
  "timestamp": "ISO-8601",
  "version": "1.0.0"
}
```

HTTP status: **200** if `db` ok AND (Redis disabled OR both redis checks ok); else **503**.

---

## 4. Backend Flow

```
HealthController.get()
  → HealthService.check()
    → HealthRepository.pingDb() — SELECT 1
    → RedisCacheService.ping()
    → RedisSessionService.ping()
    → NotificationQueueService.getJobCounts() (if queue enabled)
```

Checks run in parallel via `Promise.allSettled`.

---

## 5. Database

Raw query only; no models.

---

## 6. Socket

Not covered. Socket process has **no** dedicated health endpoint in code.

---

## 7. Notifications

Queue check uses `notifications` queue as BullMQ probe.

---

## 8. Redis

Probes DB 0 (cache) and DB 2 (session). BullMQ on DB 1 via queue service.

When `REDIS_ENABLED=false`, redis checks skipped; healthy if DB up.

---

## 9. BullMQ

`checks.queue` true if `notificationQueue.isEnabled()` and `getJobCounts()` succeeds.

---

## 10. Security

Public endpoint — reveals dependency status (acceptable for internal LB). No sensitive data.

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Socket/worker not probed | Separate processes |
| Redis disabled marks healthy without queue | By design |
| `version` from npm_package_version | May be unset |

---

## 12. Production Readiness: **75%**

Good for API process. Add socket/worker health endpoints for full stack monitoring.

**Main files:** `backend-nest/src/health/health.controller.ts`, `health.service.ts`
