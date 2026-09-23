# Chat & Messages

## 1. Business Purpose

Direct messaging lets users converse 1:1 (e.g. customer ↔ butcher) with text, images, and video. Threads are persisted in PostgreSQL; the backend also supports real-time delivery via Socket.IO `chat:*` events (mobile chat screen currently uses REST only).

**Who uses it:**
- **Customers / sellers** — butcher chat, messages tab, profile messages panel
- **Butchers** — `(butcher)/messages.tsx` tab
- **Backend socket layer** — optional realtime for clients that connect

---

## 2. Frontend Flow

| Screen | File | Entry |
|--------|------|-------|
| Messages tab | `app/app/(tabs)/messages.tsx` | Tab bar — `<MessagesPanel variant="standalone" />` |
| Profile embedded | `app/app/(tabs)/profile.tsx` | `<MessagesPanel variant="embedded" />` |
| Butcher messages tab | `app/app/(butcher)/messages.tsx` | Butcher layout — threads + activity |
| Chat thread | `app/app/butchers/chat.tsx` | From MessagesPanel, butcher profile, or deep link params |

### `MessagesPanel` (`app/components/feature/MessagesPanel.tsx`)

- `useMessageThreads(accessToken)` → `GET /api/messages`
- Tabs: `messages` | `activity` (notifications via `fetchNotifications`)
- Opens chat: `router.push({ pathname: '/butchers/chat', params: { threadId, receiverId, receiverName, receiverAvatar } })`

### `butchers/chat.tsx`

**Modes:** thread (`threadId` + `receiverId`), direct (`receiverId` only), butcher (`butcherId`).

**REST only (no socket in this file):**
- Load threads/messages: `GET /api/messages`, `GET /api/messages/:threadId`
- Send: `POST /api/messages` with `{ receiverId, text?, imageUrl?, videoUrl? }`
- Media: upload via `uploadMediaFromUri` then send URLs

Optimistic UI adds temp message; replaces with server message on success.

### `useMessageThreads` (`app/hooks/useMessageThreads.ts`)

Polls `GET /api/messages` on mount — no socket subscription.

---

## 3. API Flow

| Method | URL | Auth | Body / query |
|--------|-----|------|--------------|
| GET | `/api/messages` | JWT | — (thread list) |
| POST | `/api/messages` | JWT | `SendMessageDto`: `receiverId`, optional `text`, `imageUrl`, `videoUrl`, `orderId` |
| GET | `/api/messages/:threadId` | JWT | `?cursor=` (pagination) |

All `@RateLimit('api')`.

### Responses

**GET threads:** array of `{ id, participant, lastMessage, lastMessageAt, unread, isMine }`

**POST:** `{ message, threadId }` — creates thread via upsert if needed

**GET thread messages:** `{ messages, nextCursor, hasMore }` — page size 40; marks thread read

---

## 4. Backend Flow

### REST (`MessagesService`)

```
getThreads(user)
  → findThreadsForUser
  → load participants, unread counts
  → map last message preview

sendMessage(user, dto)
  → validate not self, receiver exists
  → upsertThread(sorted participant pair)
  → createMessage
  → AppNotificationsService.notifyUser type 'new_message'

getThreadMessages(user, threadId, cursor)
  → verify participant
  → paginate messages
  → markThreadRead
```

### Socket (`AppGateway` + `SocketGatewayService`)

**Client → Server (subscribe messages):**

| Event | Payload | Handler |
|-------|---------|---------|
| `chat:join` | `threadId` (UUID string) | Verify participant → `client.join('thread:{id}')` |
| `chat:leave` | `threadId` | Leave room |
| `chat:send` | `ChatSendDto` | Create message + emit |
| `chat:typing` | `{ threadId, receiverId }` | Forward to receiver |
| `chat:read` | `{ threadId, messageIds[] }` | Mark read + broadcast |

**Server → Client:**

| Event | Target | Payload |
|-------|--------|---------|
| `chat:message` | `thread:{threadId}` | Full message row |
| `chat:notification` | `user:{receiverId}` | `{ threadId, senderId, senderName, preview }` |
| `chat:typing` | `user:{receiverId}` | `{ threadId, userId }` |
| `chat:read` | `thread:{threadId}` | `{ threadId, readBy }` |
| `error` | caller | `{ code, message }` |

Socket auth: JWT in `handshake.auth.token` or `Authorization` header (`SocketGatewayService.authenticate`).

---

## 5. Database

Typical models (via `MessagesRepository` / `SocketRepository`):

| Entity | Role |
|--------|------|
| Message thread | Two participants (`participant1`, `participant2`), `lastMessageAt` |
| Message | `threadId`, `senderId`, `receiverId`, `text`, `imageUrl`, `videoUrl`, `orderId`, `isRead` |

Thread upsert uses sorted participant IDs for stable pairing.

---

## 6. Socket

**Gateway:** `backend-nest/src/gateway/app.gateway.ts`  
**Port:** `SOCKET_PORT` env (default **3002**)  
**Client:** `app/lib/socket.ts` — `connectSocket(accessToken)` → `io(EXPO_PUBLIC_SOCKET_URL)`

**Rooms:**
- `user:{userId}` — joined on connect
- `thread:{threadId}` — joined on `chat:join`

**Note:** Mobile `butchers/chat.tsx` does **not** call `connectSocket` or `chat:*` events. Realtime path exists server-side for future/other clients.

Redis adapter: `SocketRedisAdapterService` for multi-instance emit.

---

## 7. Notifications

| Path | Type | When |
|------|------|------|
| REST `sendMessage` | `new_message` | Always on POST |
| Socket `chat:send` | `new_message` | On socket send |

Payload includes `threadId`, `messageId`, `senderId`, `actorId`, `actorAvatar`, optional `orderId`/media URLs.

Push via BullMQ `notifications` → `push-notifications`.

---

## 8. Redis

| Key | TTL | Purpose |
|-----|-----|---------|
| `online:{userId}` | 3600s | Presence on socket connect / `presence:ping` |

Socket scaling via Redis adapter (not message persistence).

---

## 9. BullMQ

Chat does not enqueue dedicated jobs. `new_message` notifications go through `NotificationQueueService`.

---

## 10. Security

- REST and socket require valid JWT; revoked/blacklisted tokens rejected on socket.
- Thread access: participant check on join, send, and message fetch.
- Socket `chat:send` validates `receiverId` matches other participant in thread.
- Cannot message self (REST 400).
- `chat:read` limited to 50 message IDs per call (notifications read handler pattern).

---

## 11. Possible Bugs

1. **Mobile chat not realtime** — no socket listeners; users must reload/pull to see new messages.
2. **Duplicate send paths** — REST and socket both create messages independently; clients mixing both could duplicate logic.
3. **No typing/read in mobile UI** — socket events unused in `chat.tsx`.
4. **Thread list stale** — `useMessageThreads` only fetches on mount, not on focus.
5. **Activity tab conflates notifications** — not true chat activity feed.

---

## 12. Production Readiness (%)

**72%**

REST messaging, notifications, and full socket protocol are implemented server-side. Mobile UX is REST-only, so realtime chat is **not production-complete** for the primary app client.
