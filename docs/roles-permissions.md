# Roles & Plan Permissions

## 1. Business Purpose

Two authorization layers:
1. **Staff roles** (`Role` enum + `RolesGuard`) for admin API
2. **Subscription plan permissions** (`PlanPermissionService`) for paid features (ads, live, featured listings, analytics flag, etc.)

---

## 2. Frontend Flow

### Mobile

- JWT `user.role` is typically `USER` (butcher mode is client `activeMode`, not server `BUTCHER` role)
- `SubscriptionContext` exposes plan limits (`featuredAdsUsed`, `pinnedAdsUsed`, etc.)
- Plan feature labels: `app/services/subscriptionPlans.ts`

### Admin panel

- Login stores user with `ADMIN` or `MODERATOR`
- Settings page restricted to `ADMIN` in UI

---

## 3. API Flow

**Staff:** `@Roles(...)` on `admin.controller.ts`, `admin-plans.controller.ts`

**Plans:** Resolved server-side per user subscription — no separate permissions REST endpoint; entitlements checked inside domain services (`assertCanCreateListing`, `assertCanCreateLiveStream`, etc.).

---

## 4. Backend Flow

### RolesGuard

```
@Roles('ADMIN', 'MODERATOR')
  → RolesGuard reads ROLES_KEY metadata
  → Compares req.user.role from JWT
  → ForbiddenException if not in list
```

**Role enum (Prisma):** `USER`, `BUTCHER`, `ADMIN`, `MODERATOR`

**Note:** `BUTCHER` role exists in schema but butcher access is primarily via `Butcher.userId` link; JWT role often remains `USER`.

### PlanPermissionService

Resolves effective plan (`free` if unpaid) via `PlanResolverService`.

| Method | Permission key |
|--------|----------------|
| `canCreateLive` | `canCreateLive` |
| `maxAdsPer24Hours` | `maxAdsPer24Hours` |
| `monthlyFeaturedAds` | `monthlyFeaturedAds` |
| `monthlyPinnedAds` | `monthlyPinnedAds` |
| `monthlyLiveHours` / `monthlyLiveMinutes` | `monthlyLiveHours` |
| `hasPrioritySearch` | `prioritySearch` |
| `hasPriorityHome` | `priorityHome` |
| `hasVerifiedBadge` | `verifiedBadge` |
| `storeCommission` | `storeCommission` |
| `isStoreEnabled` | `storeEnabled` |
| `canReceiveOrders` | `receiveOrders` |
| `hasAnalyticsDashboard` | `analyticsDashboard` |
| `priorityBoost` | Derived from priority flags |

**Enforcement:** `SubscriptionEntitlementService.assertCanCreateListing`, `assertCanCreateLiveStream`, listing sort boost via `PlanResolverService.planTier`.

**Catalog:** `plans/plan-feature-catalog.ts`; seeded in `scripts/seed-plans.ts`.

---

## 5. Database

| Model | Relevant fields |
|-------|-----------------|
| `User` | `role` |
| `Subscription` | `planId`, `planAudience`, usage counters |
| `Plan`, `PlanFeature` | Feature key/value pairs |

---

## 6. Socket

Uses same JWT role for connection; no separate plan check on socket connect (live/order handlers check ownership separately).

---

## 7. Notifications

Not role-specific except staff receiving butcher-application notifications.

---

## 8. Redis

`subscription:{userId}` caches subscription view.

---

## 9. BullMQ

Subscription processor resets monthly counters (`reset_live_minutes` job).

---

## 10. Security

- Global `JwtAuthGuard` + per-route `@Roles`
- Plan permissions enforced server-side on create listing/live
- Client-side gating alone is insufficient — backend throws `403` with codes like `featured_limit`, `plan_required`

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| `BUTCHER` JWT role unused | Schema vs runtime mismatch |
| `analyticsDashboard` not enforced on `GET /butchers/stats` | See `analytics.md` |
| `pinnedAds` entitlement without listing `pinned` field | See `pinned-listings.md` |
| Moderator ≈ Admin on many routes | Broad `@Roles(...STAFF)` |

---

## 12. Production Readiness: **83%**

Plan entitlement system is thorough for listings/live. Gaps: butcher role clarity, analytics gating, pinned ads completion.

**Main files:** `backend-nest/src/auth/guards/roles.guard.ts`, `backend-nest/src/plans/plan-permission.service.ts`, `backend-nest/src/subscriptions/services/subscription-entitlement.service.ts`
