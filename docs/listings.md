# Listings (Marketplace Ads)

## 1. Business Purpose

Marketplace listings for livestock and related goods (camels, sheep, feed, equipment, etc.). Sellers publish ads with images, price, location, and optional featured placement. Creation enforces subscription entitlements, calculates commission fees, schedules fee-check jobs, and ranks results by featured flag and plan tier.

**Primary users:** Sellers (`USER` audience subscriptions); buyers browse market tab.

**Key files:** `backend-nest/src/listings/listings.module.ts`, `app/app/(tabs)/market.tsx`, `app/app/create/listing.tsx`, `app/contexts/SubscriptionContext.tsx`.

---

## 2. Frontend Flow

| Screen | Path | Behavior |
|--------|------|----------|
| Market tab | `app/app/(tabs)/market.tsx` | Reads `listings` from `AppContext`; **client-side** filter by category, country, featured, search text |
| Create listing | `app/app/create/listing.tsx` | 4-step wizard; uploads images; `addListing` → `POST /api/listings`; commission preview via `calculateCommission` + `subscription.permissions` |
| Listing detail | `app/listing/[id].tsx` | (separate screen; not primary doc scope) |

**AppContext:**

- `fetchListings` → `GET /api/listings` (first page, no cursor)
- `addListing` → `POST /api/listings`
- `removeListing` → `DELETE /api/listings/:id`

**SubscriptionContext** (`app/contexts/SubscriptionContext.tsx`):

- Fetches `GET /api/subscriptions` + plan catalog
- Exposes `subscription.permissions` and `usageCounters` (`listingsUsed`, `featuredAdsUsed`, `dailyAdsUsed`, etc.)
- Used in create flow for commission preview; **backend enforces limits** on create

---

## 3. API Flow

Controller: `ListingsController` — prefix `/api/listings`

| Method | Endpoint | Auth | Query / Body | Response |
|--------|----------|------|--------------|----------|
| GET | `/listings` | OptionalAuth | `cursor`, `category`, `country`, `search`, `featured`, `sellerId`, `minPrice`, `maxPrice` | `{ listings, nextCursor, hasMore }` |
| POST | `/listings` | JWT | `CreateListingDto` | Created listing + seller + fee |
| GET | `/listings/:id` | OptionalAuth | — | Listing detail; increments views |
| PUT | `/listings/:id` | JWT | `UpdateListingDto` | Updated listing |
| DELETE | `/listings/:id` | JWT | — | `{ deleted: true }` (marks `sold`) |

**Create body highlights:** `title`, `arabicTitle`, descriptions, `price`, `currency`, `category`, `images[]`, `featured`, `quantity`, `location`, `country`, optional `breed`, `age`.

---

## 4. Backend Flow

```
ListingsController → ListingsService → ListingsRepository
                  ↘ SubscriptionEntitlementService.assertCanCreateListing
                  ↘ calculateCommission (lib/commissions)
                  ↘ FeeCheckQueueService.scheduleFeeCheck
                  ↘ AppNotificationsService (fee_due)
```

**list:**

- Cache `listings:v2:{filters}` when no search/price range (TTL 90s)
- `where: { status: 'active', notDeleted }`
- Re-sort by featured, plan tier (`PlanResolverService`), `createdAt`

**create:**

1. `assertCanCreateListing(userId, { images, featured })` — daily ads, featured limits
2. `calculateCommission(category, price, quantity, permissions)`
3. Transaction: create `Listing` + `ListingFee` + increment subscription usage counters
4. Schedule BullMQ fee check at `dueDate + 60s`
5. Notify seller `fee_due`
6. `cache.delPattern('listings:v2:*')`

**remove:** `markSold` + soft delete fields; cache invalidation

---

## 5. Database

| Model | Key fields |
|-------|------------|
| `Listing` | `sellerId`, titles, `price`, `category`, `images[]`, `featured`, `status`, `views`, `expiresAt?`, soft delete |
| `ListingFee` | `commission`, `dueDate`, `status` (`pending`), linked 1:1 to listing |
| `Subscription` | `listingsUsed`, `dailyAdsUsed`, `featuredAdsUsed`, `pinnedAdsUsed`, `dailyAdsWindowStart` |

**Schema:** `backend-nest/prisma/schema.prisma` — `Listing` (~185), `ListingFee` (~224).

`createListingWithFee` increments `listingsUsed` and `dailyAdsUsed` atomically in repository transaction.

---

## 6. Socket

**missing** — no live listing updates or new-listing broadcasts.

---

## 7. Notifications

On successful create (`listings.service.ts`):

```typescript
type: 'fee_due',
titleAr: '✅ تم نشر إعلانك',
bodyAr: `إعلانك "${dto.arabicTitle}" منشور. الرسوم: ${commission} ريال خلال ١٤ يوم.`,
data: { listingId, feeId }
```

Via `AppNotificationsService` → notification queue.

---

## 8. Redis

`RedisCacheService` in `ListingsService`:

| Key | TTL | When |
|-----|-----|------|
| `listings:v2:{json filters}` | 90s | List without search/price filter |
| `listing:{id}` | 300s | Single listing GET |

Invalidation: `delPattern('listings:v2:*')` on create/update/delete; `del(listing:{id})` on update/delete.

---

## 9. BullMQ

**Fee check queue** — `FeeCheckQueueService.scheduleFeeCheck`:

- Queue: `QUEUE_NAMES.FEE_CHECKS`
- Job: `{ listingFeeId, userId, amount }`
- Delay: `dueDate - now + 60_000` ms
- Job id: `fee:{listingFeeId}`
- Skipped if Redis/BullMQ disabled (`cache.isEnabled()` / queue null)

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| Create | JWT + subscription entitlement checks |
| Update/delete | Seller or `ADMIN` |
| Public browse | OptionalAuth on list/detail |
| Rate limiting | `@RateLimit('api')` |
| Image URLs | Validated in DTO (URLs expected after client upload) |
| Featured abuse | Plan-gated `featuredAdsUsed` / `featured_limit` errors |

---

## 11. Possible Bugs

1. **Mobile loads one page** — `AppContext.fetchListings` ignores `nextCursor`; market tab filters in-memory only.
2. **Client vs server search** — `market.tsx` filters loaded listings locally; server supports `search` query but app does not use it on market tab.
3. **Lat/lng not sent** — `create/listing.tsx` captures map coords but `addListing` payload omits them (only text location).
4. **`listing_limit` handler** — `listings.service.ts` catch references `listing_limit` but `assertCanCreateListing` throws `listing_limit` for **daily** ad cap; monthly `listingsUsed` check may be missing in entitlement (verify plan rules).
5. **Delete = sold** — `remove` sets `status: 'sold'` not `deleted` only; semantic confusion.
6. **Featured toggle** — no client-side check against `featuredAdsUsed` before submit; user sees generic error.

---

## 12. Production Readiness (with %)

**75%**

| Ready | Gap |
|-------|-----|
| Full REST CRUD + fees + entitlements | Mobile pagination/search not wired |
| Redis caching + plan-based sort | No socket/real-time market |
| BullMQ fee scheduling | Geo coordinates not persisted from create UI |
| Commission + pledge UX | Plan limit errors could be clearer in app |
