# Content Moderation (Admin)

## 1. Business Purpose

Staff hide inappropriate **posts** and **suspend listings** (plus soft-delete) from the admin panel without deleting user accounts.

**Who uses it:** `ADMIN` and `MODERATOR`.

---

## 2. Frontend Flow

### Admin panel

| Screen | Action |
|--------|--------|
| `posts/page.tsx` | Filter hidden posts; toggle `isHidden`; delete |
| `listings/page.tsx` | Set listing `status` including `suspended`; delete |

Uses `ResourcePage` + `admin.service.ts` helpers.

---

## 3. API Flow

### Posts

| Method | URL | Body |
|--------|-----|------|
| GET | `/admin/posts?hidden=true\|false` | — |
| PATCH | `/admin/posts/:id` | `{ isHidden: boolean }` |
| DELETE | `/admin/posts/:id` | Sets `isHidden: true` + soft delete |

### Listings

| Method | URL | Body |
|--------|-----|------|
| GET | `/admin/listings?status=suspended` | — |
| PATCH | `/admin/listings/:id` | `{ status: 'active'\|'sold'\|'expired'\|'pending_fee'\|'suspended' }` |
| DELETE | `/admin/listings/:id` | Sets `status: 'suspended'` + soft delete |

**Schemas:** `updatePostSchema`, `updateListingSchema` in `admin/dto/admin.dto.ts`.

---

## 4. Backend Flow

```
AdminService.updatePost / deletePost / updateListing / deleteListing
  → AdminRepository
```

**Post hide:** `isHidden: true` — post remains in DB, excluded from public feeds when queries filter hidden (verify feed queries use `isHidden: false`).

**Listing suspend:** `status: 'suspended'` — listing excluded from `listings.service` which filters `status: 'active'`.

**Dashboard stats:** Counts `hiddenPosts` and `suspendedListings` in `getDashboardStats`.

---

## 5. Database

| Model | Moderation fields |
|-------|-------------------|
| `Post` | `isHidden`, `deletedAt` |
| `Listing` | `status` (incl. `suspended`), `deletedAt` |

---

## 6. Socket

Not used for moderation events. Hidden posts do not trigger socket fanout.

---

## 7. Notifications

**Not implemented:** No automatic notify to author when post hidden or listing suspended.

---

## 8. Redis

Post/listing caches may serve stale data until TTL expires. **Missing:** explicit cache invalidation on admin update.

---

## 9. BullMQ

Not used.

---

## 10. Security

- Moderator and admin share same moderation endpoints
- No appeal workflow API
- Delete is soft archive with retention purge via cron

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Stale listing cache | `listing:{id}` may remain until TTL |
| Hidden post may still appear in direct link | Depends on `getPost` query |
| DELETE post forces hidden | Cannot hard delete from panel |

---

## 12. Production Readiness: **78%**

Core hide/suspend works. Gaps: author notification, cache bust, audit log.

**Main files:** `backend-nest/src/admin/`, `admin-panel/.../posts/`, `listings/`
