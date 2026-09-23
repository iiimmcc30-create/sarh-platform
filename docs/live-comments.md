# Live Stream Comments (Socket)

## 1. Business Purpose

Viewers send real-time comments (and optional price offers) during a live stream. Comments persist to `LiveComment` and broadcast to all viewers in the stream room.

---

## 2. Frontend Flow

### Mobile

| Screen | Usage |
|--------|-------|
| `app/live/watch/[id].tsx` | Emit `live:comment`, listen for incoming comments |
| `app/live/broadcast.tsx` | Host sees comments on `live:comment` |

Uses app socket client with stream room from `live:join`.

---

## 3. API Flow

**No REST** for sending live comments. Optional HTTP for stream metadata via `livestreams` module.

---

## 4. Backend Flow

```
Client emit live:comment (LiveCommentDto)
  → AppGateway.onLiveComment
  → SocketGatewayService.handleLiveComment
    → findLiveStreamForComment (must be isLive)
    → createLiveComment in DB
    → emitToStream(streamId, 'live:comment', comment)
```

**DTO:** `streamId`, `message` (1–500 chars), optional `isOffer`, `offerAmount`.

**Profile:** Username/avatar from user profile at send time.

---

## 5. Database

| Model | Fields |
|-------|--------|
| `LiveComment` | `streamId`, `userId`, `username`, `message`, `isOffer`, `offerAmount`, timestamps |
| `LiveStream` | `comments` relation; `_count.comments` in join stats |

---

## 6. Socket

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `live:comment` | `LiveCommentDto` |
| Server → Clients | `live:comment` | Full comment object |
| Server → Client | `live:stats` | Includes `commentsCount` on join |

**Room:** `stream:{streamId}` (after `live:join`).

**Errors:** `stream_ended` if stream not live.

---

## 7. Notifications

Live comments do not trigger push notifications (unlike chat DMs).

---

## 8. Redis

Stream list cache `streams:live` separate; comments not cached in Redis.

---

## 9. BullMQ

Not used.

---

## 10. Security

- Requires authenticated socket
- Stream must be live at comment time
- No per-user rate limit on comments in gateway
- Offer amount validated 0.01–10M

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Comment spam / flood | No throttle |
| Host moderation tools missing | No delete/hide comment API |
| Comments persist after stream ends | No cleanup on end |

---

## 12. Production Readiness: **80%**

Realtime comment path works. Gaps: moderation, rate limits, REST history pagination for VOD.

**Main files:** `backend-nest/src/gateway/app.gateway.ts`, `socket-gateway.service.ts` (`handleLiveComment`)
