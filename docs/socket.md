# Socket.IO Gateway

## 1. Business Purpose

Realtime layer for DMs, live stream presence/comments/likes, butcher order status updates, online presence, and optional notification mark-read.

**Who uses it:** Authenticated mobile users. Separate process from HTTP API.

---

## 2. Frontend Flow

### Mobile (`app/lib/socket.ts`, hooks)

| Hook / screen | Events used |
|---------------|-------------|
| Chat | `chat:join`, `chat:send`, `chat:typing`, `chat:read` |
| Live watch/broadcast | `live:join`, `live:leave`, `live:comment`, `live:like` |
| Butcher orders | `order:status` (butcher), listen `order:updated` |
| Admin orders panel | `hooks/useAdminOrderSocket.ts` |

**Connection:** `SOCKET_URL` (default port `3002`). Auth via `handshake.auth.token` or `Authorization: Bearer`.

---

## 3. API Flow

Sockets are **not** REST. HTTP companion: none required beyond JWT issuance.

---

## 4. Backend Flow

**Entry:** `backend-nest/src/gateway/socket.main.ts` → `AppGateway` (`app.gateway.ts`)

**Services:**
- `SocketGatewayService` — auth, handlers, business logic
- `SocketEmitService` — `emitToUser`, `emitToThread`, `emitToStream`
- `SocketRedisAdapterService` — multi-instance adapter (Redis DB 3)
- `SocketDisconnectService` / `SocketDisconnectListenerService` — forced logout disconnect

**Auth on connect:**
1. Verify JWT access token
2. Check `blacklist:{token}` in Redis session DB
3. Validate `passwordVersion`
4. Confirm user active
5. `client.join('user:{userId}')`

---

## 5. Database

Socket handlers read/write via `SocketRepository`:
- `Message`, `MessageThread` — chat
- `LiveStream`, `LiveComment` — live
- `ButcherOrder` — order status
- `Notification` — mark read
- `User.lastSeenAt` — disconnect cleanup

---

## 6. Socket Events

### Client → Server (`@SubscribeMessage`)

| Event | Payload | Handler |
|-------|---------|---------|
| `chat:join` | `threadId` (UUID string) | Join `thread:{id}` after participant check |
| `chat:leave` | `threadId` | Leave room |
| `chat:send` | `ChatSendDto` | Persist message, emit to thread + receiver |
| `chat:typing` | `ChatTypingDto` | Emit to `user:{receiverId}` |
| `chat:read` | `ChatReadDto` | Mark read, emit `chat:read` to thread |
| `live:join` | `streamId` | Join `stream:{id}`, bump viewers, emit stats |
| `live:leave` | `streamId` | Decrement viewers |
| `live:comment` | `LiveCommentDto` | Persist comment, broadcast |
| `live:like` | `streamId` | Increment likes, broadcast |
| `order:status` | `OrderStatusDto` | Butcher-only status transition |
| `presence:ping` | — | Refresh `online:{userId}` TTL |
| `notifications:read` | `string[]` (notification ids) | Mark notifications read |

### Server → Client (emitted)

| Event | Room | Purpose |
|-------|------|---------|
| `error` | socket | `{ code, message }` |
| `chat:message` | `thread:{id}` | New message |
| `chat:notification` | `user:{id}` | DM preview for receiver |
| `chat:typing` | `user:{id}` | Typing indicator |
| `chat:read` | `thread:{id}` | Read receipt |
| `live:stats` | `stream:{id}` | `{ viewers, likes, commentsCount }` |
| `live:viewers` | `stream:{id}` | Viewer count |
| `live:comment` | `stream:{id}` | New comment object |
| `live:like` | `stream:{id}` | `{ userId, likes }` |
| `live:likes` | `stream:{id}` | Total like count |
| `order:updated` | `user:{customerId}`, `user:{butcherUserId}` | From `OrderLifecycleService` |

### Rooms

| Pattern | Joined when |
|---------|-------------|
| `user:{userId}` | On connection (automatic) |
| `thread:{threadId}` | `chat:join` |
| `stream:{streamId}` | `live:join` |

---

## 7. Notifications

`chat:send` triggers `AppNotificationsService.notifyUser` (`type: new_message`) for the receiver.

---

## 8. Redis

| DB | Usage |
|----|-------|
| 0 | `online:{userId}` — presence (TTL 3600s) |
| 2 | `blacklist:{token}` — auth on connect |
| 3 | Socket.IO adapter pub/sub; `socket:disconnect` channel |

**Env:** `SOCKET_PORT` (3002), `ALLOWED_ORIGINS`, `SOCKET_USE_MEMORY_ADAPTER=true` for single-instance dev.

---

## 9. BullMQ

Not used by the gateway directly.

---

## 10. Security

- Unauthenticated connections disconnected immediately
- Thread/stream participation verified before join/send
- `order:status` limited to butcher owner of order
- Forced disconnect on logout via Redis pub/sub

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| In-memory adapter in dev | No cross-instance rooms if Redis down |
| Viewer count can drift | `handleLiveLeave` resets negative viewers |
| `notifications:read` weak validation | Raw array, not `NotificationsReadDto` |
| Live like not deduplicated per user | Increments on every `live:like` |

---

## 12. Production Readiness: **90%**

Core chat/live/order realtime is production-grade with Redis adapter. Gaps: live like spam, no socket rate limits.

**Main files:** `backend-nest/src/gateway/`
