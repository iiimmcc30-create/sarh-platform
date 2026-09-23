# Search (Trending + Client-Side Discovery)

## 1. Business Purpose

Discovery UX combining:

1. **Backend trending hashtags** — only `GET /api/search/trending` (hashtag frequency from recent posts).
2. **Client-side filtering** — listings from `AppContext` filtered in the app.
3. **Direct API calls** — `GET /api/users` (with optional `search`) and `GET /api/livestreams` for accounts and live streams.

There is **no** unified backend search endpoint for listings, users, or livestreams in `SearchController`.

**Key file:** `app/app/search.tsx`, `backend-nest/src/search/search.controller.ts`.

---

## 2. Frontend Flow

**Screen:** `app/app/search.tsx`

| Phase | Behavior |
|-------|----------|
| Empty query | Shows recent searches (`AsyncStorage` key `safat_recent_searches`) + trending tags from API |
| With query | Filter chips: `all`, `listings`, `users`, `live` |
| Listings | `useApp().listings` filtered locally by title / `arabicTitle` / `arabicLocation` |
| Users | `dbUsers` from `GET /api/users` or `GET /api/users?search={query}` — **no client filter** (`filteredUsers = dbUsers`) |
| Live | `dbLiveStreams` from `GET /api/livestreams`, filtered locally by title |

**Trending load (mount only):**

```typescript
fetch(`${API_BASE}/api/search/trending`)
```

**Users/live load:** `useEffect` on `[query]` — refetches when query changes.

**Recent searches:** saved on submit (max 10 terms).

---

## 3. API Flow

### Backend (`SearchController` only)

| Method | Endpoint | Auth | Response `data` |
|--------|----------|------|-----------------|
| GET | `/api/search/trending` | Public (`@Public()`) | `{ trending: { tag: string, count: number }[] }` |

Top 10 hashtags from posts in last **30 days** (max 500 posts scanned).

### Other endpoints used by mobile (not in Search module)

| Method | Endpoint | Auth | Used for |
|--------|----------|------|----------|
| GET | `/api/users` | Public | User list / `?search=` |
| GET | `/api/livestreams` | Public | Live stream list |

**missing:** `GET /api/search/listings`, `GET /api/search/posts`, Elasticsearch/Meilisearch integration.

---

## 4. Backend Flow

```
GET /search/trending
  → SearchController.trending()
  → SearchService.getTrending()
      → SearchRepository.findRecentPosts(since: now - 30d)
      → Regex /#[\u0600-\u06FF\w_]+/g on content + arabicContent
      → Count, sort desc, slice(0, 10)
```

**Files:**

- `backend-nest/src/search/search.controller.ts`
- `backend-nest/src/search/search.service.ts`
- `SearchRepository` in same file as service

**Users search** (separate module): `UsersService.listUsers` — `findActiveUsers(search)` max 20, case-insensitive on username/displayName/arabicName.

**Listings search** (if called directly): `ListingsService.list` supports `search` query (≥2 chars) — **not used by `search.tsx`**.

---

## 5. Database

| Source | Query |
|--------|-------|
| Trending | `Post` where `createdAt >= since`, `notDeleted`, `isHidden: false`, take 500 |
| Users | `User` where `isActive: true`, optional OR `contains` on names |
| Livestreams | `LiveStream` via livestreams module (read in app only) |
| Listings (local) | Already loaded in `AppContext` — not queried at search time |

No `TrendingTag` or search index tables.

---

## 6. Socket

**missing** — search results are static HTTP pulls; live tab does not subscribe to stream start/stop events.

---

## 7. Notifications

**missing** — search feature does not send notifications.

---

## 8. Redis

**missing** in `SearchService` — trending recomputed on every request.

`ListingsService` and `UsersService` may cache their own endpoints, but trending endpoint has no cache layer.

---

## 9. BullMQ

**missing** — no background job to precompute trending tags or build search indexes.

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| Trending | `@Public()` — no auth |
| Users list | `@Public()` on `GET /users` |
| Rate limiting | Users/listings controllers use `@RateLimit('api')`; **SearchController trending has no `@RateLimit`** |
| Injection | Prisma parameterized queries; hashtag regex only on fetched text |
| PII | User search returns public profile fields only |

---

## 11. Possible Bugs

1. **Listings scope** — search only covers listings already fetched in `AppContext` (first page), not full catalog.
2. **Users search mismatch** — when query empty, loads all users (limit 20); when query set, server filters but client assigns all results without secondary filter.
3. **Trending not refreshed** — fetched once on mount; stale if user stays on screen.
4. **No rate limit on trending** — cheap but unbounded repeated DB reads (500 posts × regex).
5. **Arabic hashtag normalization** — `toLowerCase()` only; may split duplicate Arabic tags.
6. **Live filter** — uses `arabicTitle.includes(q)` without lowercasing Arabic query consistently.

---

## 12. Production Readiness (with %)

**58%**

| Ready | Gap |
|-------|-----|
| Trending hashtags API works | Only one backend search endpoint |
| Usable mobile UX with filters | Listings not server-searched |
| Recent search persistence | No trending cache or rate limit |
| Users + live wired | No unified search API or indexing |
