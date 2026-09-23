# Featured Listings

## 1. Business Purpose

Sellers with paid plans can mark new listings as **featured** (`Listing.featured = true`) for higher visibility in search/home ordering, within monthly plan limits (`monthlyFeaturedAds`).

---

## 2. Frontend Flow

### Mobile

- Create listing: `app/create/listing.tsx` — may pass `featured: true` if plan allows
- `ListingCard` shows “مميز” badge when `listing.featured`
- Home tab sorts featured first (`app/(tabs)/index.tsx`)
- `SubscriptionContext` shows `featuredAdsUsed` vs plan limit

---

## 3. API Flow

| Method | URL | Body |
|--------|-----|------|
| POST | `/api/listings` | `{ featured?: boolean, ... }` |
| GET | `/api/listings` | Query `featured=true` filters featured only |

**Errors:** `403 featured_limit` or `plan_required` when over quota or on free plan.

---

## 4. Backend Flow

```
ListingsService.create()
  → SubscriptionEntitlementService.assertCanCreateListing(userId, { featured })
    → checks monthlyFeaturedAds vs subscription.featuredAdsUsed
  → ListingsRepository.createListingWithFee()
    → increments featuredAdsUsed on subscription if featured
```

**List ordering:** `featured DESC`, then seller plan tier, then `createdAt` (`listings.service.ts`).

**Plan keys:** `monthlyFeaturedAds` in `PlanFeature`; `PlanPermissionService.monthlyFeaturedAds()`.

---

## 5. Database

| Model | Field |
|-------|-------|
| `Listing` | `featured` Boolean, indexed |
| `Subscription` | `featuredAdsUsed` Int |

Monthly reset: `SubscriptionProcessor` job `reset_live_minutes` resets usage counters via `resetMonthlyUsageCounters` (includes featured/pinned counts).

---

## 6. Socket

Not used.

---

## 7. Notifications

`fee_due` on listing create, not specific to featured.

---

## 8. Redis

`listings:v2:*` cache invalidated on create. Featured filter in cache key.

---

## 9. BullMQ

Fee check scheduled on listing create.

---

## 10. Security

- Entitlement enforced server-side
- Cannot toggle featured on update via `UpdateListingDto` (no `featured` field) — **featured only at create time**

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Cannot feature existing listing later | No PATCH featured |
| Counter increments even if listing later suspended | No decrement on admin suspend |
| Free plan: featured must be false | Validated in assert |

---

## 12. Production Readiness: **85%**

Featured create + list boost implemented. Gaps: post-create featuring, decrement on delete.

**Main files:** `backend-nest/src/listings/`, `subscription-entitlement.service.ts`
