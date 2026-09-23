# Messages (Direct Messaging)

> This feature shares implementation with [chat.md](./chat.md). This document focuses on the **Message** domain model and REST API.

## 1. Business Purpose

Direct messaging lets users send text/image/video messages in 1:1 threads. Messages can reference butcher orders via optional `orderId`.

**Who uses it:** Authenticated users (customers, butchers). Guests cannot send messages.

---

## 2. Frontend Flow

| Entry | File |
|-------|------|
| Profile messages | `app/(tabs)/profile.tsx` → `MessagesPanel` |
| Hidden messages tab | `app/(tabs)/messages.tsx` |
| Butcher messages | `app/(butcher)/messages.tsx` |
| Chat thread UI | `app/butchers/chat.tsx` |

**Hook:** `hooks/useMessageThreads.ts` → `GET /api/messages`

**Navigation:** `/butchers/chat` with params `threadId`, `receiverId`, `receiverName`, `receiverAvatar`.

**State:** No Redux/React Query — local state + `authFetch`.

**Note:** Mobile chat uses **REST only** for send/receive. Backend also supports `chat:*` socket events (see [socket.md](./socket.md)); mobile does not subscribe to them in `butchers/chat.tsx`.

---

## 3. API Flow

Controller: `messages.controller.ts` — prefix `/api/messages`

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| GET | `/messages` | JWT | List threads for current user |
| POST | `/messages` | JWT | Send message (creates thread if needed) |
| GET | `/messages/:threadId` | JWT | Paginated messages in thread |

**Send body (`SendMessageDto`):** `receiverId`, `content`, `type` (text/image/video), optional `orderId`, `mediaUrl`.

**Rate limit:** `api` (100/15min).

---

## 4. Backend Flow

```
MessagesController
  → MessagesService
    → MessagesRepository
      → Prisma Message + MessageThread
```

**sendMessage:** Find or create `MessageThread` between two users → insert `Message` → optional socket emit via gateway (`chat:message`, `chat:notification`).

**getThreads:** Returns threads with last message preview, ordered by recent activity.

**Authorization:** User must be participant in thread.

---

## 5. Database

| Model | Purpose |
|-------|---------|
| `MessageThread` | Two participants, unique pair |
| `Message` | Content, type, `senderId`, `threadId`, optional `orderId` |

Relations: `Message` → `User` (sender/receiver), optional `ButcherOrder`.

---

## 6. Socket

See [chat.md](./chat.md) and [socket.md](./socket.md).

| Event | Direction |
|-------|-----------|
| `chat:join` / `chat:leave` | Client → Server |
| `chat:send` | Client → Server (alternative to REST) |
| `chat:message` | Server → `thread:{id}` room |
| `chat:notification` | Server → `user:{receiverId}` |
| `chat:typing`, `chat:read` | Bidirectional |

---

## 7. Notifications

New message → `chat:notification` socket to receiver. May also enqueue in-app notification via message service (verify `messages.service.ts` for `AppNotificationsService` calls).

Push: If notification persisted and receiver has `fcmToken`.

---

## 8. Redis

No message-specific cache keys documented in `messages/` module.

---

## 9. BullMQ

Messages do not enqueue dedicated jobs. Notifications may use `notifications` queue indirectly.

---

## 10. Security

- Thread access restricted to participants
- `receiverId` must be valid active user
- Rate limited under global API limit
- Media URLs should come from upload service

---

## 11. Possible Bugs / Risks

| Risk | Notes |
|------|-------|
| Mobile REST-only vs socket on backend | Duplicate delivery patterns if both used |
| No E2E encryption | Messages stored plaintext in DB |
| Order-linked messages | `orderId` optional; validation depth varies |

---

## 12. Production Readiness: **85%**

REST API and backend sockets exist; mobile does not use sockets for chat. See [chat.md](./chat.md) for full chat flow.

**Main files:** `backend-nest/src/messages/`, `app/hooks/useMessageThreads.ts`, `app/butchers/chat.tsx`
