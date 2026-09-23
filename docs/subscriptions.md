# Subscriptions

## 1. Business Purpose

Subscriptions control **plan tier**, **feature permissions**, and **usage counters** (listings, live minutes, featured/pinned/daily ads) for **USER** and **BUTCHER** audiences. Users upgrade via NI payment; the app reads effective plan and permissions on every gated action.

**Who uses it:**
- **Mobile app** — `SubscriptionContext`, subscription picker, payment, fees hub, live eligibility, listing creation
- **Backend** — entitlements, livestreams, listings, payments fulfillment
- **Admin** — indirect via plan management (not subscription rows directly in admin UI reviewed)

---

## 2. Frontend Flow

| Screen / module | File | Role |
|-----------------|------|------|
| Plan picker | `app/app/subscription.tsx` | Lists plans via `usePlans`, billing toggle, navigates to `/payment` |
| Payment | `app/app/payment.tsx` | Initiates subscription payment |
| Fees hub (subscription tab) | `app/app/fees.tsx` | Shows current plan, links to `/subscription` |
| Profile / gating | `app/app/(tabs)/profile.tsx`, create flows | `useSubscription()` for permissions |
| Global state | `app/contexts/SubscriptionContext.tsx` | Fetches and caches subscription + plan catalog |

### `SubscriptionContext` flow

1. On auth: `GET /api/subscriptions` via `authFetch`.
2. Fetches `GET /api/plans?audience={planAudience}` to map plan details.
3. Exposes: `subscription` (id, planSlug, planAudience, plan, renewDate, permissions, usageCounters), `refetchSubscription`, `upgradePlan` (triggers refetch).

### `subscription.tsx` flow

1. `usePlans(subscription.planAudience)` for catalog.
2. User selects plan + monthly/yearly cycle.
3. `handleContinue` → `router.push({ pathname: '/payment', params: { planId: selected, cycle } })`.
4. Shows current plan card via `getPlanBySlug(subscription.planSlug)`.

**Provider mount:** `SubscriptionProvider` in app layout (wraps authenticated tree).

---

## 3. API Flow

| Method | URL | Auth | Body |
|--------|-----|------|------|
| GET | `/api/subscriptions` | JWT | — |
| POST | `/api/subscriptions/cancel` | JWT | — (no body) |

Both use `@RateLimit('api')`.

### `GET /api/subscriptions` response (enriched)

Includes: `id`, `planId`, `planAudience`, `billingCycle`, `renewDate`, `status`, `effectivePlanSlug`, `autoRenew`, usage counters, `permissions`, nested `plan` object from `PlanResolverService.toApiResponse()`.

Auto-creates free subscription if missing (`SubscriptionsRepository.upsertFree`).

### `POST /api/subscriptions/cancel`

Calls `SubscriptionLifecycleService.cancelAutoRenew(userId)` — sets `autoRenew: false` for active paid subscriptions; does not immediately downgrade.

Invalidates `subscription:{userId}` Redis cache.

---

## 4. Backend Flow

```
SubscriptionsController.getMine
  → SubscriptionsService.getMine(user)
    → repo.findByUserId OR upsertFree
    → SubscriptionLifecycleService.getForUser(userId)
      → expireIfNeeded (downgrade if expired)
      → PlanPermissionService.resolveEffective(slug, audience, hasPaidAccess)
    → RedisCacheService.set('subscription:{userId}', payload, 120s)

SubscriptionsController.cancel
  → SubscriptionLifecycleService.cancelAutoRenew()
  → SubscriptionCacheService.invalidate()
```

**Payment activation** (not in subscriptions controller): `PaymentsRepository.processSuccessfulPayment` updates subscription on successful NI webhook.

**Related services:**
- `SubscriptionEntitlementService` — `assertCanCreateListing`, `assertCanCreateLiveStream`, audience resolution
- `PlanPermissionService` — permission helpers used in lifecycle enrichment

---

## 5. Database

### `Subscription` model

| Field | Purpose |
|-------|---------|
| `userId` | Unique — one subscription per user |
| `planId` | Slug string, default `free` |
| `planAudience` | `USER` \| `BUTCHER` |
| `planDbId` | FK to `Plan` table |
| `billingCycle` | `monthly` \| `yearly` |
| `renewDate` | Paid access end / renewal anchor |
| `autoRenew` | Grace period eligibility when false after expiry |
| `listingsUsed`, `liveMinutesUsed`, `featuredAdsUsed`, `pinnedAdsUsed`, `dailyAdsUsed` | Usage counters |
| `status` | String — includes `active`, `downgraded` |

Related: `Payment.subscriptionId` links payments to subscription rows.

---

## 6. Socket

Subscriptions do not use dedicated socket events. Plan changes appear after REST refetch or notification tap.

---

## 7. Notifications

| Event | Type | Source |
|-------|------|--------|
| Cancel auto-renew | `subscription_renew` | `cancelAutoRenew` |
| Renewal success | `subscription_renew` + email | `notifyRenewalSuccess` (payment webhook) |
| Renewal failure | `subscription_renew` | `notifyRenewalFailed` (failed payment webhook) |
| Expiration downgrade | `subscription_renew` | `downgradeUser(..., 'expiration')` |
| Refund downgrade | `system` | `downgradeUser(..., 'refund')` |
| Renewal reminders (7/3/1 days) | `subscription_renew` + email | `sendRenewalReminder` (cron job) |

---

## 8. Redis

| Key | TTL | Purpose |
|-----|-----|---------|
| `subscription:{userId}` | 120s | Response cache from `SubscriptionsService.getMine` |
| `subscription:reminder:{userId}:{kind}` | 8 days | Dedup renewal reminders (`markReminderSent`) |

`SubscriptionCacheService.invalidate(userId)` on payment, cancel, downgrade, activation.

---

## 9. BullMQ

Subscriptions controller does not enqueue jobs. Lifecycle maintenance runs via `SubscriptionProcessor` (see `docs/subscription-lifecycle.md`).

Emails for renewal/reminder use `EmailQueueService.addEmail` with template `subscription_renew`.

---

## 10. Security

- All subscription endpoints require JWT.
- Users can only read/cancel their own subscription (`userId` from token).
- Effective permissions computed server-side — client `permissions` object is advisory for UI.
- Payment initiate validates plan slug against `PlansService.getUpgradablePlans` and blocks duplicate payment during active period.

---

## 11. Possible Bugs

1. **`upgradePlan` in context only refetches** — does not change plan without payment.
2. **Cache staleness** — 120s Redis cache may serve pre-payment subscription briefly.
3. **`isSubscriptionCacheStale` defined but unused** in hot path for invalidation on read.
4. **Cancel semantics** — UI may imply immediate cancellation; backend only disables auto-renew until `renewDate`.
5. **Audience mismatch** — user role vs `planAudience` resolved in `SubscriptionEntitlementService` (not in subscriptions controller).

---

## 12. Production Readiness (%)

**84%**

Read/cancel APIs, enriched permissions, payment fulfillment, and cache invalidation are solid. Gaps: no subscription history endpoint, no explicit upgrade-without-payment admin path in this module, and client relies on manual refetch after payment.
