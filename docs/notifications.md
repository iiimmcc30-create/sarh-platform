# In-App Notifications

## 1. Business Purpose

In-app notifications give users a persistent Arabic inbox for social, commerce, subscription, and system events. Push alerts are a separate layer (see `push-notifications.md`); this feature is the **read/mark-read REST inbox** backed by PostgreSQL.

**Who uses it:** Authenticated mobile users (`USER` role). Staff do not have a dedicated admin inbox; they may receive `system` notifications on mobile if logged in as admin.

---

## 2. Frontend Flow

### Mobile (`app/`)

| Screen | Path | Trigger |
|--------|------|---------|
| Notification center | `app/notifications/index.tsx` | Profile tab, bell icon, or deep link |

**State:** `hooks/useNotificationsList.ts` — cursor pagination, mark read, mark all read.

**Flow:**
1. `GET /api/notifications` — load first page + `unreadCount`
2. Tap row → `markAsRead(id)` → `PATCH /api/notifications` with `{ ids: [id] }`
3. `handleNotificationNavigation()` from `lib/notifications.ts` routes by `type` + `data`
4. Header “mark all” → `PATCH /api/notifications` with `{}` (no ids = all read)
5. Unread badge elsewhere: `hooks/useUnreadNotificationCount.ts` → `GET /api/notifications/unread-count`

**Sockets:** Optional realtime mark-read via `notifications:read` (see `socket.md`). No server push of new inbox rows over socket in current code.

---

## 3. API Flow

Base: `/api/notifications` — `notifications.controller.ts`

| Method | URL | Auth | Rate limit |
|--------|-----|------|------------|
| GET | `/notifications` | JWT | `api` |
| PATCH | `/notifications` | JWT | `api` |
| GET | `/notifications/unread-count` | JWT | `api` |

**Query params (GET list):** `cursor` — UUID of last item for pagination (page size 30).

**PATCH body:** `{ ids?: string[] }` — max 100 UUIDs; omit or empty `ids` to mark **all** read.

**Response envelope:** `{ success: true, data: { notifications, nextCursor, hasMore, unreadCount } }`

---

## 4. Backend Flow

### Write path (async pipeline)

```
Domain service (posts, orders, stories, …)
  → AppNotificationsService.notifyUser()
    → NotificationQueueService.addNotification({ name: 'create', … })
      → NotificationProcessor
        → NotificationPersistService.persistNotificationAndEnqueuePush()
          → Prisma Notification.create
          → PushQueueService.addPush() (if fcmToken)
```

`AppNotificationsService` (`queue/services/app-notifications.service.ts`) stringifies `data` values and swallows enqueue errors (logs warning).

### Read path (sync REST)

```
NotificationsController
  → NotificationsService
    → NotificationsRepository (findMany, countUnread, markRead)
```

---

## 5. Database

| Model | Purpose |
|-------|---------|
| `Notification` | `userId`, `type` (`NotificationType` enum), `titleAr`, `bodyAr`, `data` (JSON), `isRead`, `readAt` |

**Indexes:** `userId`, `(userId, isRead)`, `createdAt`.

**Cleanup:** Daily cron deletes read notifications older than 90 days (`admin.repository.runCleanup`).

**NotificationType enum:** `like`, `follow`, `comment`, `repost`, `offer`, `order_update`, `fee_due`, `subscription_renew`, `new_message`, `live_start`, `system`, `story_reaction`, `story_reply`.

---

## 6. Socket

| Client → Server | Purpose |
|-----------------|---------|
| `notifications:read` | Body: array of notification UUIDs (max 50). Marks read in DB via `SocketRepository.markNotificationsRead`. |

No server→client `notification:new` event is emitted when a notification is created.

---

## 7. Notifications

This module **is** the notification inbox. Creation is always via `AppNotificationsService` → BullMQ (not direct REST create).

Producers include: `posts.service`, `messages.service`, `order-lifecycle.service`, `listings.service`, `livestreams.service`, `stories.service`, `subscription-lifecycle.service`, `butcher-application-notifications.service`, `socket-gateway.service` (chat), `fee-check.processor`.

---

## 8. Redis

Feed-related cache keys are invalidated by story/post flows; the notification inbox itself is **not** Redis-cached.

Story feed cache (`stories:feed:*`) is separate — see `story-viewer.md`.

---

## 9. BullMQ

| Queue | Job | Processor |
|-------|-----|-----------|
| `notifications` | `create` | `NotificationProcessor` → persist + enqueue push |

If Redis/BullMQ disabled, `NotificationQueueService` no-ops; notifications are **not** persisted.

---

## 10. Security

- All REST endpoints require JWT (`JwtAuthGuard`).
- Users can only list/mark their own notifications (`userId` from token).
- `data` payload may contain entity IDs; navigation is client-side only.

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Notifications lost when Redis off | Queue required for persist path |
| No realtime inbox refresh | Client must poll or pull on focus |
| `notifyUser` failures silent | Caught and logged in `AppNotificationsService` |
| Socket `notifications:read` accepts raw array, not DTO | `socket-gateway.service.ts` — inconsistent with REST validation |

---

## 12. Production Readiness: **88%**

REST inbox and async persist pipeline are solid. Gaps: no push-to-socket for new rows, queue dependency for durability.

**Main files:** `backend-nest/src/notifications/`, `backend-nest/src/queue/services/app-notifications.service.ts`, `app/app/notifications/index.tsx`
