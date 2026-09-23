# Connections (Followers / Following Lists)

## 1. Business Purpose

Exposes a user's social graph: who follows them (`followers`) and whom they follow (`following`). When a viewer is authenticated, each listed user includes `isFollowing` so the UI can show follow/unfollow buttons in context.

**Primary users:** Profile owners and visitors browsing another user's network.

**Key files:** `backend-nest/src/users/users.controller.ts`, `backend-nest/src/users/services/users.service.ts`, `app/app/profile/connections.tsx`, `app/services/users.ts`.

---

## 2. Frontend Flow

**Screen:** `app/app/profile/connections.tsx`

| Step | Behavior |
|------|----------|
| Route params | `userId` (defaults to `me.id`), `tab` (`followers` \| `following`), optional `username` |
| Load | `fetchUserConnections(targetUserId, activeTab)` on mount / tab change |
| Tabs | Switch between `followers` and `following` (client-side; refetches API) |
| Row tap | `openUserProfile(router, item.id)` |
| Follow button | Hidden for self; calls `toggleFollowUser` and patches local `isFollowing` |

**Navigation entry points:**

- `app/app/users/[id].tsx` — `openConnections('followers' | 'following')` with `userId`, `tab`, `username`
- `app/app/(tabs)/profile.tsx` — links to own connections

**Service:** `app/services/users.ts` → `GET /api/users/:userId/connections?type={type}`

---

## 3. API Flow

| Method | Endpoint | Auth | Query | Response `data` |
|--------|----------|------|-------|-----------------|
| GET | `/api/users/:id/connections` | OptionalAuth (`@Public()` + `@OptionalAuth()`) | `type` = `followers` (default) \| `following` | `{ type, users: ConnectionUser[] }` |

**`ConnectionsQueryDto`** (`users.dto.ts`): `type` optional enum, default `followers`.

**Each user object:**

```typescript
{
  id, username, displayName, arabicName, avatar?, verified,
  isFollowing: boolean  // false for self; else viewer's follow state
}
```

**Errors:**

| Code | HTTP | When |
|------|------|------|
| `invalid_id` | 400 | Empty `id` |
| `invalid_type` | 400 | `type` not `followers` or `following` |
| `not_found` | 404 | Target user inactive / missing |

---

## 4. Backend Flow

```
GET /users/:id/connections?type=
  → UsersController.connections()
  → UsersService.getConnections(id, query, viewer)
      → UsersRepository.findActiveUserId(id)
      → type === 'followers'
           ? findFollowers(id, PAGE_SIZE=50)
           : findFollowing(id, PAGE_SIZE=50)
      → map follower | following user from join rows
      → if viewer: findFollowsByViewer(viewerId, listedUserIds)
      → attach isFollowing per user
```

**Repository selects** (`connectionUserSelect`): `id`, `username`, `displayName`, `arabicName`, `avatar`, `verified`.

**Ordering:** `createdAt desc` on `Follow` rows.

---

## 5. Database

**Primary model:** `Follow` (same as follow feature)

| Query | Prisma filter |
|-------|---------------|
| Followers | `where: { followingId: id }` → select `follower` |
| Following | `where: { followerId: id }` → select `following` |
| Viewer follows | `where: { followerId: viewerId, followingId: { in: ids } }` |

**User visibility:** `findActiveUserId` requires `isActive: true` and `deletedAt: null`.

No separate `Connection` table.

---

## 6. Socket

**missing** — connections list is REST-only; no live updates when someone follows/unfollows while screen is open.

---

## 7. Notifications

**missing** for the connections list endpoint itself.

Follow actions initiated from this screen use the follow notification path (`type: 'follow'`) documented in `docs/follow.md`.

---

## 8. Redis

**missing** for connections endpoint — no cache read/write in `getConnections`.

Profile endpoint (`user:{id}`) may still cache follower **counts**, not the connection list.

---

## 9. BullMQ

**missing** — no queue involvement for listing connections.

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| Public read | `@Public()` — anyone can list another user's followers/following |
| `isFollowing` enrichment | Only when valid JWT viewer present |
| Active users only | Target must pass `findActiveUserId` |
| Rate limiting | `@RateLimit('api')` |
| Privacy | No block/mutual-follow filtering implemented |

---

## 11. Possible Bugs

1. **Hard limit 50** — `PAGE_SIZE = 50` in `UsersService`; no `cursor` query param; UI cannot load more.
2. **Tab param desync** — `connections.tsx` sets tab from URL on `useEffect` but local `activeTab` state can briefly show wrong data during switch.
3. **Stale list after follow** — Row updates `isFollowing` only; does not add/remove user from the other tab.
4. **`isFollowing` for anonymous** — Always `false` when no viewer; follow buttons still shown but gated by login alert.
5. **Inactive followers** — Follow rows are not filtered by `User.isActive`; deactivated accounts may appear if follow row exists.

---

## 12. Production Readiness (with %)

**72%**

| Ready | Gap |
|-------|-----|
| Working followers/following API | No pagination |
| OptionalAuth `isFollowing` hints | No caching (may be heavy for popular accounts) |
| Mobile list UI + inline follow | No socket refresh |
| Validation + rate limits | No privacy controls (private accounts) |
