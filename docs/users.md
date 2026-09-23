# Users & Profile

## 1. Business Purpose

User profiles represent platform identities — display name, avatar, bio, verification badge, country. Users can update their profile and manage push tokens.

**Who uses it:** All registered users; guests can view public profiles.

---

## 2. Frontend Flow

| Screen | Path | Action |
|--------|------|--------|
| Public profile | `app/users/[id].tsx` | View user, follow button |
| Edit profile | `app/profile/edit.tsx` | Update name, avatar, bio |
| Profile tab | `app/(tabs)/profile.tsx` | Own listings, messages |
| Push token sync | `lib/notifications.ts` | `PUT /users/:id` with `fcmToken` |

**State:** `AppContext.me` for current user; `services/users.ts` + `authFetch` for API.

**No Redux / React Query.**

---

## 3. API Flow

Controller: `users.controller.ts` — prefix `/api/users`

| Method | URL | Auth | Notes |
|--------|-----|------|-------|
| GET | `/users` | Public | List/search users |
| GET | `/users/:id` | OptionalAuth | Profile + viewer context |
| PUT | `/users/:id` | JWT | Owner or admin only |
| DELETE | `/users/:id` | JWT | Soft delete |
| POST | `/users/:id/follow` | JWT | Toggle follow |
| GET | `/users/:id/connections` | OptionalAuth | Followers/following |

**Update body (`UpdateUserDto`):** `displayName`, `arabicName`, `bio`, `avatar`, `fcmToken`, etc.

---

## 4. Backend Flow

```
UsersController → UsersService → UsersRepository → Prisma User
```

**getUser:** Cache read `user:{id}` (Redis) → DB → cache set.

**updateUser:** Ownership check (`userId === id` or admin) → invalidate cache.

**deleteUser:** Soft delete (`deletedAt`) → cascade rules per relations.

**toggleFollow:** Insert/delete `Follow` row; unique constraint on pair.

---

## 5. Database

**Model:** `User` — see `prisma/schema.prisma` lines 10–66.

Key fields: `username` (unique), `email`, `phone`, `role`, `verified`, `fcmToken`, `deletedAt`.

Relations: posts, listings, butcher profile, orders, notifications, etc.

Indexes: `username`, `email`, `country`, `isActive`, `deletedAt`.

---

## 6. Socket

Users feature does not emit socket events directly. Online presence: `online:{userId}` set on socket connect.

---

## 7. Notifications

Follow actions may create `Activity` records (if implemented in service). Push token stored on `User.fcmToken` for all future pushes.

---

## 8. Redis

| Key | Purpose |
|-----|---------|
| `user:{id}` | Profile cache |

Invalidated on update.

---

## 9. BullMQ

Not used directly by users module.

---

## 10. Security

- Users can only update/delete own profile (unless ADMIN)
- Soft delete preserves referential integrity
- `fcmToken` update requires authentication as that user
- Public list may expose limited fields

---

## 11. Possible Bugs / Risks

| Risk | Notes |
|------|-------|
| Public user list without pagination limits | Check `listUsers` default page size |
| Avatar URL validation | Depends on upload service |
| Stale cache after admin ban | Cache invalidation on admin update |

---

## 12. Production Readiness: **88%**

**Main files:** `backend-nest/src/users/`, `app/services/users.ts`, `app/users/[id].tsx`
