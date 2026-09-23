# Live Stream Likes (Socket)

## 1. Business Purpose

Viewers tap like during a live stream to increment aggregate like count, broadcast to all participants in real time.

---

## 2. Frontend Flow

### Mobile

| Screen | Usage |
|--------|-------|
| `app/live/watch/[id].tsx` | Emit `live:like` with `streamId` |
| `app/live/broadcast.tsx` | Listen `live:like` / `live:likes`, update UI |

`useLiveStream` / broadcast screen updates `likes` from `live:stats` on join.

---

## 3. API Flow

No REST endpoint for live likes. Count stored on `LiveStream.likes`.

---

## 4. Backend Flow

```
Client emit live:like (streamId UUID string)
  → AppGateway.onLiveLike
  → SocketGatewayService.handleLiveLike
    → incrementStreamLikes(streamId)
    → emitToStream(streamId, 'live:like', { userId, likes })
    → emitToStream(streamId, 'live:likes', likes)
```

**No per-user deduplication** — each emit increments total.

---

## 5. Database

| Model | Field |
|-------|-------|
| `LiveStream` | `likes` Int (default 0) |

No `LiveLike` join table — cannot list who liked.

---

## 6. Socket

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `live:like` | `streamId` (string UUID) |
| Server → Clients | `live:like` | `{ userId, likes }` |
| Server → Clients | `live:likes` | number (total) |
| Server → Clients | `live:stats` | `{ viewers, likes, commentsCount }` on join |

---

## 7. Notifications

None.

---

## 8. Redis

Not used for like counts.

---

## 9. BullMQ

Not used.

---

## 10. Security

- Auth required
- No verification stream is live before increment (increment may no-op if stream missing)
- Spam: unlimited likes per user

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Like inflation | No one-like-per-user constraint |
| Host can spam likes | Same handler for all users |
| Count not reset on stream restart | Persists on `LiveStream` row |

---

## 12. Production Readiness: **70%**

Basic counter + broadcast works. Gaps: deduplication, live check, abuse controls.

**Main files:** `backend-nest/src/gateway/socket-gateway.service.ts` (`handleLiveLike`)
