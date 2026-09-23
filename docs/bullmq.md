# BullMQ Job Queues

## 1. Business Purpose

Background workers process notifications, email, push, listing fee checks, subscription maintenance, and (stub) image processing without blocking HTTP requests.

**Who uses it:** Worker process (`queue/worker.main.ts`); producers in API and cron.

---

## 2. Frontend Flow

Not visible to users except via delayed effects (push, emails, fee overdue).

---

## 3. API Flow

No direct REST to enqueue jobs (except indirect domain actions).

---

## 4. Backend Flow

**Worker entry:** `backend-nest/src/queue/worker.main.ts` → `WorkerModule`

**Registration:** `queue.module.ts` — `BullModule.forRoot({ connection: QUEUE_CONNECTION })` where `db: 1`.

**Global producers:** `AppNotificationsService`, `EmailQueueService`, `PushQueueService`, `FeeCheckQueueService`, `ImageQueueService`, `SubscriptionQueueService`.

All queue services no-op when Redis disabled or queue injection null.

---

## 5. Database

Processors read/write PostgreSQL (`PrismaService`, repositories).

---

## 6. Socket

`OrderLifecycleService` emits sockets directly, not via queue.

---

## 7. Notifications

Primary path: `notifications` queue → persist → `push-notifications` queue.

---

## 8. Redis

Queue connection: Redis **DB 1** (`QUEUE_CONNECTION` in `queue/constants.ts`).

---

## 9. BullMQ Queues & Processors

| Queue name | Job names | Processor | Concurrency | Purpose |
|------------|-----------|-----------|-------------|---------|
| `notifications` | `create` | `NotificationProcessor` | 10 | Persist `Notification`, enqueue push |
| `push-notifications` | `send` | `PushProcessor` | 5 | FCM send |
| `emails` | `send` | `EmailProcessor` | 3 | SMTP via nodemailer |
| `fee-checks` | `check` | `FeeCheckProcessor` | 5 | Mark overdue listing fees |
| `subscriptions` | `expire`, `reminders`, `reset_live_minutes`, `auto_renew_attempt` | `SubscriptionProcessor` | 3 | Subscription lifecycle |
| `image-processing` | `process` | `ImageProcessingProcessor` | 2 | **Stub** — logs only |

**Default job options:** Varies per queue (`removeOnComplete`, `attempts: 2-3`, exponential backoff on subscriptions).

**Email templates:** `welcome`, `fee_reminder`, `order_update`, `subscription_renew`, `email_verification`.

**Fee check scheduling:** `FeeCheckQueueService.scheduleFeeCheck` with delay when listing created.

---

## 10. Security

- Workers run with full DB access — protect worker host
- SMTP and Firebase creds in env only
- No user-facing job injection endpoint

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| No jobs if Redis off | Entire notification pipeline skipped |
| `image-processing` never enqueued | `addImageProcessing` has no callers |
| Email fails silently if SMTP unset | Processor may throw at runtime |
| Duplicate cron on multiple workers | Mitigated by Redis locks in `WorkerCronService` |

---

## 12. Production Readiness: **85%**

Core queues are production-ready. Gaps: image queue unused, no dead-letter admin UI.

**Main files:** `backend-nest/src/queue/`
