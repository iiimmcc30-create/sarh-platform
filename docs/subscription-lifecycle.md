# Subscription Lifecycle

## 1. Business Purpose

Subscription lifecycle manages **paid access windows**, **grace periods**, **expiration downgrades**, **renewal reminders**, **usage counter resets**, and **side effects** (verified badge, butcher subscription flags). Pure helpers live in `lib/subscription-lifecycle.ts`; orchestration in `subscription-lifecycle.service.ts`.

**Who uses it:**
- **Subscriptions API** — enrich `GET /api/subscriptions`
- **Payments webhook** — renewal success/failure notifications, refund downgrade
- **Livestreams / listings** — `expireIfNeededForUser` before entitlement checks
- **Cron / BullMQ** — batch expiration and reminders

---

## 2. Frontend Flow

No dedicated lifecycle screen. Users experience lifecycle through:

| UX | Trigger |
|----|---------|
| Plan shows as free after expiry | `expireIfNeeded` on `GET /api/subscriptions` |
| "تم إلغاء التجديد التلقائي" | `POST /api/subscriptions/cancel` |
| Renewal reminder notifications | Cron → `processReminderBatch` |
| "انتهى اشتراكك" notification | Expiration batch or grace reminder |

`SUBSCRIPTION_GRACE_DAYS` env (default **3**) controls grace after `renewDate` when `autoRenew: true`.

---

## 3. API Flow

Lifecycle logic is **not** exposed as standalone REST routes. It runs inside:

| Entry | Method | Path |
|-------|--------|------|
| Get subscription | GET | `/api/subscriptions` |
| Cancel auto-renew | POST | `/api/subscriptions/cancel` |
| Payment webhook | POST | `/api/payments/webhook` |
| Live eligibility | GET | `/api/livestreams/eligibility` |

---

## 4. Backend Flow

### Core helpers (`backend-nest/src/lib/subscription-lifecycle.ts`)

| Function | Behavior |
|----------|----------|
| `isPaidPlan(planId)` | slug !== `free` |
| `hasPaidAccess(sub, now)` | `renewDate > now` OR grace window if `autoRenew` |
| `getSubscriptionStatus(sub, now)` | `active` \| `cancelled` \| `grace_period` \| `expired` |
| `getEffectivePlanSlug(sub, now)` | paid slug or `free` when expired |
| `shouldBlockSubscriptionPayment(sub, targetPlan, tierOf)` | blocks pay if still in paid window |
| `daysUntilRenewDate(renewDate, now)` | reminder math |

### `SubscriptionLifecycleService` methods

| Method | Purpose |
|--------|---------|
| `getForUser` | Load row, `expireIfNeeded`, enrich with permissions |
| `expireIfNeeded` / `expireIfNeededForUser` | Downgrade if status `expired` |
| `downgradeUser` | `downgradeToFreeTx` + cache invalidate + notify |
| `cancelAutoRenew` | `setAutoRenew(false)` for active paid |
| `shouldBlockPayment` | Used by `PaymentsService.initiate` |
| `notifyRenewalSuccess` / `notifyRenewalFailed` | Post-payment notifications |
| `sendRenewalReminder` | Deduped via Redis, push + email |
| `processReminderBatch` | Days 7, 3, 1 before renew |
| `processExpirationBatch` | Downgrade expired; grace day-0 reminder |
| `activateFromPayment` | Alternate activation path (repository tx + notify) — **not called from payments webhook** (webhook uses `payments.repository.processSuccessfulPayment` instead) |

### `SubscriptionProcessor` (`backend-nest/src/queue/processors/subscription.processor.ts`)

| Job `kind` | Handler |
|------------|---------|
| `expire` | `lifecycle.processExpirationBatch()` |
| `reminders` | `lifecycle.processReminderBatch()` |
| `reset_live_minutes` | `subscriptionRepo.resetMonthlyUsageCounters()` |
| `auto_renew_attempt` | `notifyRenewalFailed(userId, 'subscription')` only — **no payment charge** |

Concurrency: **3**. Queue: `QUEUE_NAMES.SUBSCRIPTIONS` (`subscriptions`).

### Cron schedule (`WorkerCronService`)

| Job | Schedule | Action |
|-----|----------|--------|
| Subscription maintenance | Daily **06:00** (server local hour) | Enqueue `expire` + `reminders` |
| Weekly live minutes reset | **Monday 04:00** | Enqueue `reset_live_minutes` |

Uses Redis lock keys `cron:subscription:lock` and `cron:subscription:weekly_reset` (TTL 300s).

`SubscriptionQueueService.addSubscriptionJob` no-ops if Redis disabled or queue unavailable.

---

## 5. Database

### `SubscriptionLifecycleRepository`

| Method | DB effect |
|--------|-----------|
| `findExpirablePaidSubscriptions` | `planId != free` AND `renewDate < now` |
| `findPaidSubscriptionsRenewingWithin(days)` | renew within N days, `autoRenew: true` |
| `downgradeToFreeTx` | plan → free, reset counters, clear butcher subscription, verified badge side effect |
| `activatePaidPlanTx` | Used by `activateFromPayment` |
| `setAutoRenew` | `autoRenew: false` |
| `resetMonthlyUsageCounters` | Batch reset `liveMinutesUsed` (weekly cron job name is historical) |

---

## 6. Socket

No lifecycle-specific socket events.

---

## 7. Notifications

See `subscriptions.md`. Lifecycle service is the primary emitter for expiration, reminders, cancel, and downgrade (except payment success which also runs from `PaymentsService`).

Email template: `subscription_renew` via `EmailQueueService`.

---

## 8. Redis

| Key pattern | Purpose |
|-------------|---------|
| `subscription:{userId}` | Invalidated on state changes |
| `subscription:reminder:{userId}:d{7\|3\|1\|0}` | NX lock — one reminder per window |
| `cron:subscription:lock` | Cron deduplication |

---

## 9. BullMQ

**Queue:** `subscriptions` (Redis DB **1**, `QUEUE_CONNECTION`)

**Jobs enqueued by cron:**
```typescript
{ kind: 'expire' }
{ kind: 'reminders' }
{ kind: 'reset_live_minutes' }
```

**Defined but never enqueued in codebase:**
```typescript
{ kind: 'auto_renew_attempt', userId, subscriptionId }
```

Job options: 3 attempts, exponential backoff 5s, `removeOnComplete: 50`.

---

## 10. Security

- Expiration/downgrade always server-side — cannot extend `renewDate` from client.
- `shouldBlockSubscriptionPayment` prevents paying while still in paid window.
- Reminder dedup prevents notification spam per user/kind.
- Cron locks prevent duplicate batch runs across instances.

---

## 11. Possible Bugs

1. **`auto_renew_attempt` never scheduled** — no true auto-renew charging; only failure notification if manually enqueued.
2. **Dual activation paths** — `activateFromPayment` vs `processSuccessfulPayment` may diverge over time.
3. **`activateFromPayment` unused by webhook** — dead code risk / confusion.
4. **Cron hour uses server local time** — may not match KSA business expectations.
5. **Weekly job named `reset_live_minutes`** — resets monthly usage counters; naming mismatch.
6. **Grace reminder at day 0** — sent during expiration batch for `grace_period` but downgrade waits until grace ends.

---

## 12. Production Readiness (%)

**76%**

Expiration, reminders, downgrade transactions, and cron infrastructure are implemented. Major gap: **no automatic NI rebill** — `auto_renew_attempt` only notifies failure. Auto-renew flag affects grace only, not payment collection.
