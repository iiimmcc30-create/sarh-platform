# Livestreams

## 1. Business Purpose

Livestreams let eligible sellers **broadcast live video** (Agora RTC) with realtime viewer counts, comments, and likes. Viewers watch via the watch screen; hosts broadcast from the broadcast screen. Access is gated by subscription plan permissions and listing requirements.

**Who uses it:**
- **Hosts** — `app/app/live/create.tsx` → `app/app/live/broadcast.tsx`
- **Viewers** — `app/app/live/watch/[id].tsx`, live tab list `app/app/(tabs)/live.tsx`
- **Followers** — `live_start` notifications when stream starts

---

## 2. Frontend Flow

| Screen | File | Flow |
|--------|------|------|
| Live tab | `app/app/(tabs)/live.tsx` | `GET /api/livestreams` — list live streams |
| Create stream | `app/app/live/create.tsx` | `POST /api/livestreams` → navigate to broadcast with Agora params |
| Host broadcast | `app/app/live/broadcast.tsx` | Agora host + `useLiveSocket` for comments/viewers/likes |
| Watch | `app/app/live/watch/[id].tsx` | Stream info + viewer token + Agora join + `useLiveSocket` |

### `broadcast.tsx`

1. Receives route params: `streamId`, `agoraAppId`, `agoraChannel`, `agoraToken`, `agoraUid`, title, category.
2. `useLiveStream({ role: 'host' })` — joins Agora channel, publishes AV.
3. `useLiveSocket` — `live:join`, comments, viewer/like stats.
4. Calls `POST /api/livestreams/:id?action=start` when going live; `action=end` on stop.

### `watch/[id].tsx`

1. Parallel fetch: `GET /api/livestreams/:id` + `GET /api/livestreams/:id?action=token`.
2. `useLiveStream({ role: 'viewer' })` — subscribes to host video.
3. `useLiveSocket` for comments, viewers, likes.
4. Token refresh via `onTokenWillExpire` → refetch `?action=token`.

### `useLiveSocket` (`app/hooks/useLiveSocket.ts`)

Connects `connectSocket(accessToken)`, emits `live:join` / `live:leave`, listens `live:comment`, `live:viewers`, `live:like`, `live:likes`, `live:stats`. Sends `live:comment`, `live:like`.

---

## 3. API Flow

| Method | URL | Auth | Notes |
|--------|-----|------|-------|
| GET | `/api/livestreams` | Public | List live streams (cached 15s) |
| POST | `/api/livestreams` | JWT | Create stream + host Agora token |
| GET | `/api/livestreams/eligibility` | JWT | Can user stream? plan + listing check |
| GET | `/api/livestreams/:id` | Optional JWT | Stream detail + comments |
| GET | `/api/livestreams/:id?action=token` | JWT required | Viewer Agora token |
| POST | `/api/livestreams/:id?action=start` | JWT (host) | Mark live, notify followers |
| POST | `/api/livestreams/:id?action=end` | JWT (host) | End stream, bill live minutes |

Invalid `action` on GET (other than `token`) → `405 Method Not Allowed`.

### Create response

```json
{
  "streamId", "agoraAppId", "agoraChannel", "agoraToken", "agoraUid"
}
```

### Viewer token response

```json
{
  "agoraAppId", "agoraChannel", "agoraToken", "agoraUid", "expiresIn": 7200
}
```

---

## 4. Backend Flow

```
LivestreamsController → LivestreamsService

listStreams()
  → Redis cache key liveStreams (15s)
  → repo.findLiveStreams()

createStream(user, body)
  → no active stream for host
  → listingsCount > 0
  → subscriptionLifecycle.expireIfNeededForUser
  → entitlements.assertCanCreateLiveStream
  → repo.createStream
  → generateHostToken(streamId, userId) from shared/lib/agora.ts

startStream(id, user)
  → host owns stream, not already live
  → assertCanCreateLiveStream again
  → repo.startStream, invalidate list cache
  → notifyFollowers → live_start notifications

endStream(id, user)
  → repo.endStream
  → incrementLiveMinutes(userId, durationMinutes)
  → invalidate cache

getViewerToken(id, user)
  → stream exists and isLive
  → generateViewerToken(id, userId)
```

Realtime comments/likes/viewers: **Socket.IO** via `SocketGatewayService` (not REST).

---

## 5. Database

Via `LivestreamsRepository` (typical fields):

| Model / fields | Role |
|----------------|------|
| Live stream | `hostId`, `title`, `arabicTitle`, `category`, `isLive`, `viewers`, `peakViewers`, `likes`, `startedAt`, `endedAt` |
| Live comment | `streamId`, `userId`, `message`, `isOffer`, `offerAmount` |
| Subscription.liveMinutesUsed | Incremented on `endStream` by duration minutes |

---

## 6. Socket

**Client → Server:**

| Event | Payload | Handler |
|-------|---------|---------|
| `live:join` | `streamId` | Increment viewers (non-host), emit stats |
| `live:leave` | `streamId` | Decrement viewers |
| `live:comment` | `{ streamId, message, isOffer?, offerAmount? }` | Persist + broadcast |
| `live:like` | `streamId` | Increment likes |

**Server → Client:**

| Event | Room | Data |
|-------|------|------|
| `live:stats` | `stream:{id}` | `{ viewers, likes, commentsCount }` |
| `live:viewers` | `stream:{id}` | count number |
| `live:comment` | `stream:{id}` | comment object |
| `live:like` / `live:likes` | `stream:{id}` | like payload or total |

Room: `stream:{streamId}` (joined on `live:join`).

---

## 7. Notifications

| Trigger | Type | Audience |
|---------|------|----------|
| Stream started | `live_start` | All followers of host |

Via `AppNotificationsService.notifyUsers` with `data: { streamId }`.

---

## 8. Redis

| Key | TTL | Purpose |
|-----|-----|---------|
| Live streams list cache | 15s | `RedisService.CacheKeys.liveStreams()` |

Deleted on start/end stream.

---

## 9. BullMQ

Livestreams do not enqueue dedicated jobs. Follower notifications use the notification queue.

Live minute billing updates `Subscription` directly in `endStream` (usage tied to subscription lifecycle weekly reset job).

---

## 10. Security

- Create/start require plan permission `canCreateLive` and live minutes quota (`SubscriptionEntitlementService`).
- At least one listing required to create stream.
- Host-only `start`/`end`; viewer token requires auth and live stream.
- One active stream per host (409 if exists).
- Optional auth on stream detail GET; token action requires JWT.

---

## 11. Possible Bugs

1. **Viewer count drift** — socket join/leave vs disconnect may desync; negative viewers reset in `handleLiveLeave`.
2. **Host joins as viewer count** — host `live:join` does not increment viewers (by design).
3. **Comments on watch screen** — duplicate comments possible if both REST-loaded history and socket append same IDs (socket only for new).
4. **Expo Go** — `useLiveStream` warns Agora requires dev build.
5. **Eligibility vs create** — race if plan expires between eligibility check and create.

---

## 12. Production Readiness (%)

**83%**

Full create/start/end API, Agora tokens, socket realtime, entitlement gating, and follower notifications are implemented. Needs production Agora credentials, dev-build distribution, and viewer-count hardening.
