# Butcher Reviews (Ratings & Comments)

## 1. Business Purpose

Customers rate butcher shops (1–5 stars) with optional comment. One review per user per butcher (`@@unique([butcherId, reviewerId])`). Submitting upserts the review and recomputes `Butcher.rating` and `Butcher.reviewCount` aggregates displayed on discovery cards and profile.

**Key files:** `backend-nest/src/butchers/butchers.controller.ts`, `backend-nest/src/butchers/butchers.service.ts`, `backend-nest/src/butchers/repositories/butchers.repository.ts`, `app/app/butchers/[id].tsx`.

---

## 2. Frontend Flow

### Display — `app/app/butchers/[id].tsx`

| Element | Source |
|---------|--------|
| Header rating | `butcher.rating`, `butcher.reviewCount` from `GET /api/butchers/:id` |
| Reviews strip | Maps `b.reviews` embedded in butcher response to `ButcherReview` UI model |
| `ReviewsStrip` | Horizontal scroll of cards (avatar, stars, comment) |

**Submit UI:** **missing** in mobile app — no `POST /api/butchers/:id/reviews` call found under `app/`. Reviews are read-only in current client.

### Separate reviews endpoint

`GET /api/butchers/:id/reviews` exists on backend but profile screen uses embedded reviews from butcher GET, not this route.

---

## 3. API Flow

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| GET | `/api/butchers/:id/reviews` | OptionalAuth (`@Public` on route group) | — | Array of reviews + `reviewer` (max 20, `findReviews`) |
| POST | `/api/butchers/:id/reviews` | JWT | `{ rating: 1-5, comment?: string }` | Upserted review + reviewer |

### POST validation (`reviewSchema`)

```typescript
rating: z.number().int().min(1).max(5)
comment: z.string().max(500).optional()
```

### Errors

| Code | HTTP | When |
|------|------|------|
| `not_found` | 404 | Butcher missing |
| `invalid_action` | 400 | Owner reviews own shop |
| `validation_error` | 400 | Zod failure |
| `already_reviewed` | 409 | Prisma P2002 (race; upsert normally prevents) |

---

## 4. Backend Flow

**getReviews(butcherId):**

1. `findButcherOwner` exists check
2. `findReviews(butcherId)` — latest 20 with reviewer profile

**submitReview(butcherId, user, body):**

1. `findButcherForReview` — must exist; `butcher.userId !== user.userId`
2. Zod parse
3. `repo.upsertReview({ butcherId, reviewerId, rating, comment })`
4. `aggregateReviews` → `_avg.rating`, `_count.rating`
5. `updateButcherRating(butcherId, avg, count)`
6. `redis.cacheDel(\`butcher:${butcherId}\`)`
7. Return review row

**Embedded in profile:** `findButcherById` includes `reviews: { take: 10, orderBy: createdAt desc, include: reviewer }`.

---

## 5. Database

**Model:** `ButcherReview` — `schema.prisma` (lines 679–692)

| Field | Type |
|-------|------|
| `id` | UUID |
| `butcherId` | FK → Butcher |
| `reviewerId` | FK → User |
| `rating` | Int (1–5) |
| `comment` | String? |
| `createdAt` | DateTime |

**Constraint:** `@@unique([butcherId, reviewerId])` — one review per pair; upsert updates existing.

**Denormalized:** `Butcher.rating` (Float), `Butcher.reviewCount` (Int) updated on each submit.

**User profile:** `UsersService.formatProfile` exposes butcher `rating` / `reviewCount` when user has `butcherProfile`.

---

## 6. Socket

**missing** — new reviews do not push to butcher dashboard or profile viewers.

---

## 7. Notifications

**missing** — butcher owner is not notified when a review is submitted.

---

## 8. Redis

On submit:

- `redis.cacheDel(\`butcher:${butcherId}\`)` in `ButchersService.submitReview`

Profile cache for `butcher:me` is **not** explicitly cleared on review (may stale for owner until TTL).

---

## 9. BullMQ

**missing** — no async moderation queue for review text or fraud detection.

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| Submit | JWT required |
| Self-review | Blocked (`invalid_action`) |
| Read | Public GET reviews; embedded on OptionalAuth butcher profile |
| One review per user | DB unique + upsert semantics |
| Rate limiting | `@RateLimit('api')` on controller |
| Comment length | Max 500 chars |

**missing:** verified-purchase requirement (any user can review any butcher).

---

## 11. Possible Bugs

1. **No mobile submit form** — API exists but app cannot create reviews.
2. **Field name mismatch risk** — UI expects `authorNameAr`, `commentAr`; API returns `reviewer.arabicName`, `comment` — mapping in `[id].tsx` must stay in sync.
3. **Aggregate drift** — if reviews deleted manually in DB, aggregates not recalculated (no delete review endpoint).
4. **409 vs upsert** — service catches P2002 but upsert should prevent; redundant error path.
5. **Embedded vs GET reviews** — two sources (10 vs 20 items) may confuse if client mixes them.
6. **Rating on list cards** — defaults to `5.0` in `index.tsx` when null (`b.rating ?? 5.0`) — misleading for new butchers.

---

## 12. Production Readiness (with %)

**62%**

| Ready | Gap |
|-------|-----|
| Backend POST/GET with upsert + aggregates | No mobile review submission UI |
| DB constraints + owner self-review block | No notifications to butcher |
| Public read on profile | No verified-buyer gate |
| Cache invalidation on submit | No review delete/moderation API |
