# Plans

## 1. Business Purpose

Plans define **pricing**, **audience** (`USER` vs `BUTCHER`), and **feature permissions** (live streaming, ad limits, store commission, verified badge, etc.) stored in PostgreSQL. The app and backend resolve permissions from the database rather than hardcoded tiers.

**Who uses it:**
- **Mobile app** — `usePlans`, subscription/payment screens, entitlement-gated features
- **Admin panel** — plan CRUD and feature editing
- **Backend** — payments (price validation), subscriptions, listings, livestreams, commissions

---

## 2. Frontend Flow

### Mobile (`app/hooks/usePlans.ts`)

1. `GET /api/plans?audience={USER|BUTCHER}` on mount.
2. Maps API rows via `mapApiPlan()` from `app/services/subscriptionPlans.ts`.
3. Returns `{ plans, loading, getPlanBySlug, refetch }`.

**Consumers:**
| File | Usage |
|------|-------|
| `app/app/subscription.tsx` | Plan cards, pricing, upgrade CTA |
| `app/app/payment.tsx` | Amount, gradient colors, plan name |
| `app/contexts/SubscriptionContext.tsx` | Plan catalog for current subscription |
| `app/app/fees.tsx` | Plan display on subscription tab |

### Admin (`admin-panel`)

| Screen | File | API |
|--------|------|-----|
| Plans list | `admin-panel/src/app/(dashboard)/plans/page.tsx` | `GET /api/admin/plans` |
| Plan detail/edit | `admin-panel/src/app/(dashboard)/plans/[id]/page.tsx` | `GET/PATCH /api/admin/plans/:id` |

`admin.service.ts`: `fetchPlans`, `createPlan`, `updatePlan`, `deactivatePlan`, `duplicatePlan`, `deletePlan`, `fetchFeatureCatalog`.

---

## 3. API Flow

### Public

| Method | URL | Auth | Query |
|--------|-----|------|-------|
| GET | `/api/plans` | Public | `?audience=USER` \| `BUTCHER` (optional) |

Response: `{ success: true, data: { plans: PlanApiResponse[] } }`

### Admin (`AdminPlansController` — `backend-nest/src/plans/admin-plans.controller.ts`)

| Method | URL | Roles |
|--------|-----|-------|
| GET | `/api/admin/plans` | ADMIN, MODERATOR |
| GET | `/api/admin/plans/feature-catalog/list` | ADMIN, MODERATOR |
| GET | `/api/admin/plans/:id` | ADMIN, MODERATOR |
| POST | `/api/admin/plans` | ADMIN |
| PATCH | `/api/admin/plans/:id` | ADMIN |
| PATCH | `/api/admin/plans/:id/features` | ADMIN |
| POST | `/api/admin/plans/:id/deactivate` | ADMIN |
| POST | `/api/admin/plans/:id/duplicate` | ADMIN |
| DELETE | `/api/admin/plans/:id` | ADMIN |

---

## 4. Backend Flow

```
PlansController.getPlans
  → PlansService.getPlans(audience)
    → PlanResolverService.refreshCache()
    → getActiveByAudience / getAllActive
    → toApiResponse() per plan

Admin mutations
  → PlansRepository create/update/delete
  → PlanResolverService.refreshCache()

Entitlement checks (elsewhere)
  → PlanPermissionService.resolveEffective(planSlug, audience, hasPaidAccess)
  → PlanPermissionService.canCreateLive, maxAdsPer24Hours, storeCommission, etc.
```

### `PlanPermissionService` (`plan-permission.service.ts`)

| Method | Permission key |
|--------|----------------|
| `resolveForUser` / `resolveEffective` | Full context; falls back to default free plan |
| `canCreateLive` | `canCreateLive` |
| `maxAdsPer24Hours` | `maxAdsPer24Hours` |
| `monthlyFeaturedAds` | `monthlyFeaturedAds` |
| `monthlyPinnedAds` | `monthlyPinnedAds` |
| `monthlyLiveHours` / `monthlyLiveMinutes` | `monthlyLiveHours` |
| `hasPrioritySearch` / `hasPriorityHome` | priority flags |
| `hasVerifiedBadge` | `verifiedBadge` |
| `storeCommission` | `storeCommission` (default 5) |
| `isStoreExempt` | commission <= 0 |
| `priorityBoost` | composite ranking boost |

### `PlanResolverService`

In-memory `Map` cache keyed `audience:slug`, refreshed from `Plan` + `PlanFeature` rows on module init and after admin changes.

### Payments integration

`PaymentsService.initiate` uses:
- `PlansService.getUpgradablePlans(audience)`
- `PlansService.getPlanPrice(slug, audience, billingCycle)`

---

## 5. Database

### `Plan`

| Field | Notes |
|-------|-------|
| `slug`, `audience` | Unique together |
| `monthlyPrice`, `yearlyPrice` | SAR default |
| `sortOrder` | Upgrade ordering |
| `isActive` | Hidden when false |

### `PlanFeature`

| Field | Notes |
|-------|-------|
| `key` | e.g. `canCreateLive`, `storeCommission` |
| `value` | string stored |
| `valueType` | `BOOLEAN` \| `NUMBER` \| `STRING` \| `JSON` |

`buildPermissions(features)` in `plan.types.ts` converts features to `PlanPermissions` object.

Seed script: `backend-nest/scripts/seed-plans.ts`  
Migration: `prisma/migrations/20250707000000_database_driven_plans/`

---

## 6. Socket

Plans do not use socket events.

---

## 7. Notifications

No plan-specific notifications. Plan changes affect users on next subscription fetch or payment fulfillment notification.

---

## 8. Redis

`PlanResolverService` uses **in-process memory cache**, not Redis.

Subscription cache (`subscription:{userId}`) holds resolved plan in API payload.

---

## 9. BullMQ

Plans module does not enqueue BullMQ jobs.

---

## 10. Security

- Public plan list exposes pricing and features only (no secrets).
- Admin routes require `ADMIN` or `MODERATOR` (`@Roles`).
- Create/update/delete restricted to `ADMIN`.
- Delete blocked if plan in use (`plan_in_use` error).
- Payment initiate validates slug against upgradable list server-side.

---

## 11. Possible Bugs

1. **In-memory plan cache per instance** — admin changes may take until `refreshCache` on each instance; no Redis pub/sub invalidation.
2. **Legacy slug normalization** — `normalizePlanSlug` accepts old slugs (`starter`/`pro`/`vip`); mismatch risk if DB only has new slugs.
3. **`getUpgradablePlans` logic** — must align with `subscription.tsx` `isUpgrade` sortOrder UI.
4. **Free plan row required per audience** — downgrade assumes `slug_audience: { slug: 'free', audience }` exists.

---

## 12. Production Readiness (%)

**88%**

Database-driven plans with admin CRUD, feature catalog, permission service, and payment price validation are production-ready. Minor gaps: distributed cache coherence and reliance on seed data for free tier rows.
