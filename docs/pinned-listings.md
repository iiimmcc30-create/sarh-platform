# Pinned Listings

## 1. Business Purpose

Subscription plans define `monthlyPinnedAds` limits intended for **pinned** listings (top placement). Usage counters exist on subscriptions, but **full pinned listing behavior is not implemented**.

---

## 2. Frontend Flow

### Mobile

- `SubscriptionContext` exposes `pinnedAdsUsed` from subscription API
- Plan marketing copy in `subscriptionPlans.ts` may mention pinned ads
- **No UI found** to pin a listing at create time (no `pinned` in `CreateListingDto` or create listing screen)

---

## 3. API Flow

**Missing public API** for pinned listings.

`SubscriptionEntitlementService.assertCanCreateListing` accepts `pinned?: boolean` and enforces `monthlyPinnedAds` limit, but:

- `ListingsService.create()` only passes `featured`, never `pinned`
- `CreateListingDto` has no `pinned` field
- `Listing` model has **no `pinned` column** in Prisma schema (only `featured`)

---

## 4. Backend Flow

**Partial implementation:**

```
assertCanCreateListing(..., { pinned: true })  // would check plan + pinnedAdsUsed
ListingsRepository.createListingWithFee({ pinned?: boolean })
  → if pinned: pinnedAdsUsed increment on subscription
```

**Never called with `pinned: true` from listings service.**

---

## 5. Database

| Model | Field | Status |
|-------|-------|--------|
| `Subscription` | `pinnedAdsUsed` | **Implemented** — incremented only if pinned create path used |
| `Listing` | `pinned` | **Missing** — not in schema |

---

## 6. Socket

Not used.

---

## 7. Notifications

None.

---

## 8. Redis

Listing list cache does not account for pinned (N/A).

---

## 9. BullMQ

Monthly reset clears `pinnedAdsUsed` with other counters.

---

## 10. Security

N/A until API exists.

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| **Feature incomplete** | Entitlement without Listing field or API |
| Users see limit in subscription UI but cannot use | `pinnedAdsUsed` always 0 |
| Misleading plan marketing | `monthlyPinnedAds` in seed plans |

---

## 12. Production Readiness: **25%**

Plan plumbing only. **Missing:** `Listing.pinned`, create/update API, list sort, mobile UI.

**Main files:** `subscription-entitlement.service.ts`, `listings.repository.ts` (pinned increment stub)
