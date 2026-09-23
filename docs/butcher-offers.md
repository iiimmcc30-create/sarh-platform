# Butcher Offers (Promotional Deals)

## 1. Business Purpose

Time-limited promotional offers for butcher shops: bilingual titles/descriptions, discount metadata, hero image, validity date, and country. Owners create and manage offers in the butcher dashboard; customers view active offers on the butcher profile **Offers** tab.

**Key files:** `backend-nest/src/butchers/butchers.controller.ts` (offers routes), `backend-nest/src/butchers/butchers.service.ts`, `backend-nest/src/butchers/repositories/butchers.repository.ts`, `app/app/butchers/[id].tsx` (`OffersTab`), `app/app/(butcher)/manage.tsx`.

---

## 2. Frontend Flow

### Customer — `app/app/butchers/[id].tsx`

- `OffersTab` renders offers from butcher detail payload (`GET /api/butchers/:id` includes `offers`)
- Empty state: "لا توجد عروض حالياً"
- Shows image, titles, prices, `validUntil`

### Owner — `app/app/(butcher)/manage.tsx`

- Offers section loads via authenticated `GET /api/butchers/offers` (own butcher only)
- Create/update/delete calls:
  - `POST /api/butchers/offers`
  - `PUT /api/butchers/offers/:id`
  - `DELETE /api/butchers/offers/:id`

(Exact form component names vary in manage screen; API paths match controller.)

**Public list:** No separate public `GET /butchers/:id/offers` — relies on embedded offers in butcher GET.

---

## 3. API Flow

| Method | Endpoint | Auth | Body |
|--------|----------|------|------|
| GET | `/api/butchers/offers` | JWT | — (resolves butcher from `user.userId`) |
| POST | `/api/butchers/offers` | JWT | `createOfferSchema` |
| PUT | `/api/butchers/offers/:id` | JWT | `updateOfferSchema` |
| DELETE | `/api/butchers/offers/:id` | JWT | — → `{ deleted: true }` |

**No** `GET /api/butchers/:butcherId/offers` for anonymous clients.

### `createOfferSchema` (Zod)

| Field | Validation |
|-------|------------|
| `titleAr`, `titleEn` | 2–100 chars |
| `descriptionAr`, `descriptionEn` | 2–500 chars |
| `discountPercent` | 0–100 optional |
| `originalPrice`, `offerPrice` | positive optional |
| `image` | URL required |
| `validUntil` | ISO datetime string |
| `country` | `countrySchema` |

---

## 4. Backend Flow

**listOffers(user):**

1. `findButcherIdByUser` — 404 if no profile
2. `findActiveOffers(butcher.id)` — repository filters valid/non-deleted

**createOffer:**

1. Resolve butcher from JWT user
2. Validate body
3. `createOffer({ butcherId, ... validUntil: new Date(...) })`
4. Invalidate Redis `butcher:{butcherId}`, `butcher:me`

**updateOffer / deleteOffer:**

- `findOwnedOffer(id, user.userId)` — ownership check
- Soft delete on remove (`softDeleteOffer`)
- Cache invalidation same as create

**Public profile:** `findButcherById` includes all `offers: true` (not only active) — **verify** repository filters expired offers on detail include.

---

## 5. Database

**Model:** `ButcherOffer` — `schema.prisma` (lines 572–592)

| Field | Type |
|-------|------|
| `butcherId` | FK → Butcher |
| `titleAr`, `titleEn` | String |
| `descriptionAr`, `descriptionEn` | String |
| `discountPercent` | Float? |
| `originalPrice`, `offerPrice` | Float? |
| `image` | String |
| `validUntil` | DateTime |
| `country` | Country |
| `deletedAt` | DateTime? soft delete |

Indexes: `butcherId`, `validUntil`, `deletedAt`.

---

## 6. Socket

**missing** — no push when new offer published or offer expires.

---

## 7. Notifications

**missing** — customers are not notified of new offers.

Butcher stories type `offer` is a separate feature (`ButcherStory`), not tied to `ButcherOffer` rows.

---

## 8. Redis

Invalidation on create/update/delete:

```
redis.cacheDel(`butcher:${butcherId}`)
redis.cacheDel('butcher:me')
```

**missing** dedicated offer cache keys; offers ride on butcher detail cache (300s for `me`).

---

## 9. BullMQ

**missing** — no scheduled job to expire offers or notify before `validUntil`.

Expiry must be enforced in queries (`findActiveOffers`) or client-side display only.

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| List/create/update/delete | JWT + butcher ownership (`findOwnedOffer`) |
| Admin | Not explicit on offers — owner match via `userId` on butcher |
| Validation | Zod strict; image must be URL |
| Rate limiting | `@RateLimit('api')` |
| Public exposure | Only non-deleted offers on profile; auth required for owner list endpoint |

---

## 11. Possible Bugs

1. **Expired offers on profile** — `BUTCHER_DETAIL_INCLUDE` uses `offers: true` without `validUntil > now` filter; expired offers may still display.
2. **No public offers API** — third parties cannot fetch offers without full butcher detail.
3. **Discount fields optional** — schema allows all price fields null; UI may show incomplete pricing.
4. **Timezone** — `validUntil` parsed with `new Date(iso)`; client display depends on locale.
5. **Cache staleness** — after create, cached `butcher:me` cleared but public `findButcherById` cache only for `id=me` path — other users may see stale offers until TTL.

---

## 12. Production Readiness (with %)

**68%**

| Ready | Gap |
|-------|-----|
| Owner CRUD API + validation | Expired offer filtering inconsistent |
| Profile display tab | No customer notifications |
| Soft delete + ownership checks | No expiry automation (BullMQ) |
| Redis cache invalidation on write | No public read-optimized offers endpoint |
