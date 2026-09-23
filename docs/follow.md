# Follow (User Follow / Unfollow)

## 1. Business Purpose

Lets authenticated users follow or unfollow other users to build a social graph. Following updates follower counts on profiles and triggers a push/in-app notification to the followed user. Self-follow is blocked.

**Primary users:** Registered app users viewing profiles or connection lists.

**Key files:** `backend-nest/src/users/users.controller.ts`, `backend-nest/src/users/services/users.service.ts`, `app/services/users.ts`, `app/app/users/[id].tsx`, `app/app/profile/connections.tsx`.

---

## 2. Frontend Flow

| Screen | Path | Behavior |
|--------|------|----------|
| Public profile | `app/app/users/[id].tsx` | Loads profile via `fetchUserProfile`; follow button calls `toggleFollowUser(profile.id)`; updates `isFollowing` and `followersCount locally |
| Connections list | `app/app/profile/connections.tsx` | Per-row follow toggle via `toggleFollowUser`; requires `accessToken` |
| Profile tab | `app/app/(tabs)/profile.tsx` | Navigates to connections with `userId` / `tab` params |

**Service layer:** `app/services/users.ts`

- `toggleFollowUser(userId)` → `POST /api/users/:id/follow` via `authFetch`
- `fetchUserProfile(userId)` → returns `isFollowing` when viewer is authenticated

**State:** No dedicated follow context; local component state + `AppContext.me` for current user id.

---

## 3. API Flow

Base prefix: `/api/users` (`UsersController`)

| Method | Endpoint | Auth | Request | Response `data` |
|--------|----------|------|---------|-----------------|
| POST | `/users/:id/follow` | JWT required (`@RateLimit('api')`) | — | `{ following: boolean }` — `true` = now following, `false` = unfollowed |
| GET | `/users/:id` | OptionalAuth | — | Profile includes `isFollowing`, `followersCount`, `followingCount` |

**Errors (from `UsersService.toggleFollow`):**

| Code | HTTP | When |
|------|------|------|
| `invalid_action` | 400 | `targetId === followerId` |
| `not_found` | 404 | Target user missing |
| `forbidden` | 403 | missing/invalid JWT (global guard) |

---

## 4. Backend Flow

```
POST /users/:id/follow
  → UsersController.follow()
  → UsersService.toggleFollow(targetId, user.userId)
      → UsersRepository.findFollow(followerId, followingId)
      → if exists: deleteFollow → cacheDel user:{targetId} → { following: false }
      → else: createFollow → AppNotificationsService.notifyUser(type: 'follow')
             → cacheDel user:{targetId} → { following: true }
```

**Repository methods** (`users.repository.ts`): `findFollow`, `createFollow`, `deleteFollow`, `findFollowers`, `findFollowing`, `findFollowsByViewer`.

**Profile cache:** `getUser` caches at `user:{id}` (TTL 300s). Follow toggle invalidates target profile cache only.

---

## 5. Database

**Model:** `Follow` — `backend-nest/prisma/schema.prisma` (lines 82–93)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `followerId` | String | FK → `User` (`Followers` relation) |
| `followingId` | String | FK → `User` (`Following` relation) |
| `createdAt` | DateTime | Default `now()` |

**Constraints:** `@@unique([followerId, followingId])`; indexes on `followerId`, `followingId`; `onDelete: Cascade` on both user FKs.

**Related counts:** `User._count.followers` / `following` used in profile and list endpoints.

---

## 6. Socket

**missing** for follow events. No socket emit on follow/unfollow.

`SocketDisconnectService` is injected in `UsersService` but only used in `deleteUser`, not follow.

---

## 7. Notifications

On **new follow** (not unfollow), `UsersService.toggleFollow` calls:

```typescript
AppNotificationsService.notifyUser({
  userId: targetId,
  type: 'follow',
  titleAr: 'متابع جديد',
  bodyAr: `${follower?.arabicName || 'مستخدم'} بدأ متابعتك`,
  data: { actorId: followerId, actorAvatar: follower?.avatar },
});
```

Delivery path: `AppNotificationsService` → `NotificationQueueService` (BullMQ) → FCM/persisted notification (see queue workers).

**Unfollow:** no notification.

---

## 8. Redis

| Key | Operation | TTL | When |
|-----|-----------|-----|------|
| `user:{targetId}` | `cacheDel` | — | After follow or unfollow |
| `user:{id}` | `cacheGet` / `cacheSet` | 300s | Profile read in `getUser` |

Uses `RedisService` (`cacheGet`, `cacheSet`, `cacheDel`) in `UsersService`.

---

## 9. BullMQ

Follow notifications are enqueued indirectly via `AppNotificationsService` → notification BullMQ queue. No dedicated follow job type or follow-specific queue.

**Fee checks / other queues:** not used for follow.

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| Authentication | `POST :id/follow` requires JWT (`@CurrentUser()`); no `@Public()` |
| Authorization | Any authenticated user may follow any other user (except self) |
| Rate limiting | `@RateLimit('api')` on controller |
| Idempotency | Toggle semantics: repeated POST alternates follow state |
| Data integrity | DB unique constraint prevents duplicate follow rows |

---

## 11. Possible Bugs

1. **Stale follower count on follower’s device** — `users/[id].tsx` adjusts count optimistically; no server recount returned from follow endpoint.
2. **Profile cache race** — 300s cached profile may show wrong `isFollowing` if cache invalidation fails.
3. **Connections list cap** — `getConnections` uses `PAGE_SIZE = 50` with no cursor; large follower lists are truncated.
4. **Notification fan-out** — `void this.notifications.notifyUser(...)` on follow; failures are logged only.
5. **Guest follow UX** — connections screen alerts login; profile screen should gate similarly (verify `users/[id].tsx` auth check).

---

## 12. Production Readiness (with %)

**78%**

| Ready | Gap |
|-------|-----|
| CRUD + unique constraint + toggle API | No real-time socket update for counts |
| Push notification on follow | No pagination on connections |
| Redis profile cache invalidation | Optimistic UI can drift from server |
| Rate limiting + auth | No follow spam/abuse limits beyond generic API rate limit |
