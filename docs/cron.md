# Worker Cron Schedules

## 1. Business Purpose

Hourly tick in the worker process runs daily maintenance: overdue fee checks, DB cleanup, subscription expiry/reminders, and weekly live-minute resets.

**Who uses it:** `WorkerCronService` in the BullMQ worker process only (not HTTP API cron).

---

## 2. Frontend Flow

No direct UI. Users see effects: fee overdue notifications, expired subscriptions, cleaned old data.

---

## 3. API Flow

| Method | URL | Trigger |
|--------|-----|---------|
| POST | `/api/admin/cleanup` | Called by cron with `x-cron-secret: CRON_SECRET` |

---

## 4. Backend Flow

**File:** `queue/services/worker-cron.service.ts`

**Mechanism:**
- `setInterval(tick, 60 * 60 * 1000)` — hourly check
- `shouldRun(key, hour)` — runs once per calendar day when local hour matches
- `withLock(redisKey, ttl, fn)` — NX lock on Redis DB 0

### Schedules (local server time)

| Job key | Hour | Day | Action |
|---------|------|-----|--------|
| `fee_check` | **09:00** | daily | Find overdue `ListingFee` → enqueue `fee-checks` jobs |
| `db_cleanup` | **03:00** | daily | `POST {APP_URL}/api/admin/cleanup` with cron secret |
| `subscription` | **06:00** | daily | Enqueue `subscriptions` jobs: `expire`, `reminders` |
| `subscription_weekly` | **04:00** | **Monday only** | Enqueue `reset_live_minutes` |

**Fee check lock:** `cron:fee_check:lock` (120s TTL) — separate from `withLock` wrapper.

**Cleanup lock:** `cron:db_cleanup:lock` (300s).

**Subscription lock:** `cron:subscription:lock` (300s).

**Weekly reset lock:** `cron:subscription:weekly_reset` (300s).

---

## 5. Database

Cleanup (`AdminRepository.runCleanup`) deletes/archives:
- Expired `UserSession`
- Read notifications > 90 days
- Expired `Story` (> 30 days past `expiresAt`, not soft-deleted)
- Expired `ButcherOffer`
- Hard purge soft-deleted posts, listings, streams, tickets, sections, butcher stories/products after retention

---

## 6. Socket

Not used by cron.

---

## 7. Notifications

Fee cron → `FeeCheckProcessor` → `fee_due` notification. Subscription cron → reminder/expire notifications via `SubscriptionLifecycleService`.

---

## 8. Redis

Distributed locks on DB 0 (see `redis.md`).

---

## 9. BullMQ

Cron enqueues to `fee-checks` and `subscriptions` queues rather than running heavy logic inline.

---

## 10. Security

- `CRON_SECRET` required for unattended cleanup HTTP call
- Staff JWT also accepted by `runCleanupAuthorized`
- Locks prevent duplicate runs across worker instances

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Hourly tick only checks at top of hour | Miss if worker down entire hour window |
| Uses server local timezone | `getHours()` not UTC |
| Cleanup HTTP self-call | Requires `APP_URL` reachable from worker |
| Story cleanup 30 days after expiry | Not immediate on `expiresAt` |

---

## 12. Production Readiness: **82%**

Functional for single-region deployment. Gaps: timezone documentation, no external scheduler (e.g. K8s CronJob) as backup.

**Main files:** `backend-nest/src/queue/services/worker-cron.service.ts`, `backend-nest/src/queue/repositories/worker-cron.repository.ts`
