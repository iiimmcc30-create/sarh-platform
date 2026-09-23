# Butchers (Discovery & Profile)

## 1. Business Purpose

Butcher (ملحمة) profiles: discovery list with filters, public profile with products/offers/reviews/stories, profile view analytics, and subscription-verified badge. Registration is application-based — `POST /api/butchers` is blocked in favor of butcher application flow.

**Key files:** `backend-nest/src/butchers/butchers.controller.ts`, `backend-nest/src/butchers/butchers.service.ts`, `app/app/butchers/index.tsx`, `app/app/butchers/[id].tsx`.

---

## 2. Frontend Flow

### Discovery — `app/app/butchers/index.tsx`

| Feature | Implementation |
|---------|----------------|
| List | `GET /api/butchers` → maps `json.data.butchers` |
| Filters | Client-side: country, search text, verified-only (`subscriptionActive`) |
| Sort | `rankButchers()` client helper after fetch |
| Stories row | `GET /api/butchers/stories` — butcher story rings (separate from user stories) |
| Card tap | `router.push(/butchers/[id])` |

### Profile — `app/app/butchers/[id].tsx`

| Feature | Implementation |
|---------|----------------|
| Load | `GET /api/butchers/:id` — includes `products`, `offers`, `reviews` (embedded) |
| Tabs | `products`, `offers`, `stories`, `about`, `chat` |
| Stories tab | Also fetches `GET /api/butchers/stories` |
| Order CTA | Navigates to order flow with selected product |
| Reviews display | `ReviewsStrip` from embedded `b.reviews` on butcher payload |

**Auth:** Optional `Authorization` header when `accessToken` present.

---

## 3. API Flow

Controller: `ButchersController` — prefix `/api/butchers`

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/butchers` | OptionalAuth | Query: `cursor`, `country`, `verified`, `search`, `isOpen` → `{ butchers, nextCursor, hasMore }` |
| GET | `/butchers/:id` | OptionalAuth | Detail with products, offers, reviews; `id=me` for owner |
| PUT | `/butchers/:id` | JWT | Update profile (`updateButcherSchema`) |
| POST | `/butchers` | JWT | **Always 403** `application_required` |
| GET | `/butchers/stories` | Public | Active butcher stories |
| GET | `/butchers/stats` | JWT | Owner analytics |
| GET | `/butchers/:id/reviews` | OptionalAuth | Review list (separate from embedded reviews) |

**List page size:** 20 (`PAGE_SIZE` in service).

---

## 4. Backend Flow

**listButchers:**

1. Cache key `butchers:v2:{filters}` when no search (TTL 180s via `RedisService.cacheSet`)
2. `findManyButchers` — order: `subscriptionActive desc`, `rating desc`, `activityScore desc`
3. Filters: country, `subscriptionActive` (verified), `isOpen`, text search (≥2 chars) on name/city fields
4. Cursor pagination

**getButcher:**

- `id !== 'me'`: verify exists; increment `profileViews` if viewer ≠ owner
- `id === 'me'`: requires JWT; cache `butcher:me` / `butcher:{id}` 300s
- `findButcherById` / `findButcherByUserId` with `BUTCHER_DETAIL_INCLUDE` (products, offers, reviews×10, user)

**registerButcher:** throws `application_required` — use `butcher-applications` module instead.

---

## 5. Database

**Model:** `Butcher` — `backend-nest/prisma/schema.prisma` (~490–539)

| Field | Purpose |
|-------|---------|
| `userId` | Link to `User` |
| `nameAr`, `nameEn`, `logo`, `cover` | Branding |
| `rating`, `reviewCount` | Aggregated from `ButcherReview` |
| `subscriptionActive` | Verified badge in UI |
| `isOpen`, `openTime`, `closeTime`, `closedDays` | Hours |
| `lat`, `lng`, `address`, `city`, `country` | Location |
| `profileViews`, `activityScore` | Discovery ranking |

**Relations:** `products`, `offers`, `reviews`, `orders`, `stories`.

**List include:** `user`, `_count.products`, `_count.orders`.

---

## 6. Socket

**missing** for butcher discovery/profile (open/closed status, new products, etc.).

Order flow may use sockets elsewhere — not in butcher list/profile screens.

---

## 7. Notifications

**missing** in butcher list/get flows.

Butcher application approval and orders use other modules.

Story create under butcher path does not notify followers in `ButchersService.createStory` (unlike user stories reactions).

---

## 8. Redis

`RedisService` in `ButchersService`:

| Key | TTL | When |
|-----|-----|------|
| `butchers:v2:{filters}` | 180s | List without search |
| `butcher:me` / `butcher:{id}` | 300s | Owner profile (`id=me`) |
| `butchers:stories:active` | 30s | Active butcher stories |

Invalidation on profile/product/offer updates: `cacheDel(butcher:{id})`, `butcher:me`.

---

## 9. BullMQ

**missing** for butcher discovery and profile.

Stats/orders may use queues in order lifecycle — outside this feature surface.

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| Public browse | List + public profile OptionalAuth |
| Owner update | JWT + `butcher.userId === user.userId` or ADMIN |
| Registration guard | Direct register endpoint disabled |
| Rate limiting | `@RateLimit('api')` on controller |
| Soft delete | `notDeleted` on butcher queries |
| Profile view inflation | Increment only when viewer ≠ owner |

---

## 11. Possible Bugs

1. **Mobile ignores pagination** — index loads first page only; `nextCursor` unused.
2. **Client-side search** — server supports `search` query but app filters locally after full fetch.
3. **`seenStories` local only** — butcher story rings use client `Set`; not synced with server.
4. **Reviews mapping** — `[id].tsx` expects `authorNameAr`, `commentAr`; API returns `reviewer` + `comment` — mapping layer must align (verify field names in fetch handler).
5. **`GET /butchers/me`** — mobile uses UUID from list; `me` alias may be unused on client.
6. **Chat tab** — preview messages empty array; placeholder UI.

---

## 12. Production Readiness (with %)

**76%**

| Ready | Gap |
|-------|-----|
| Discovery API + caching + ranking | Mobile pagination/search not aligned with API |
| Rich profile with relations | No real-time status |
| Application-gated onboarding | Story seen state client-only |
| Stats endpoint for owners | Chat tab incomplete |
