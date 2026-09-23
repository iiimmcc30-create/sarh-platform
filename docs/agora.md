# Agora RTC Tokens

## 1. Business Purpose

Agora provides realtime audio/video transport for livestreams. The backend generates **short-lived RTC tokens** so hosts can publish and viewers can subscribe without exposing the App Certificate to clients. Channel names and UIDs are derived deterministically from stream and user IDs.

**Who uses it:**
- **LivestreamsService** — issues tokens on stream create (host) and viewer join (token action)
- **Mobile app** — `useLiveStream` + `AgoraVideoView` consume tokens passed from API or route params

---

## 2. Frontend Flow

| Component | File | Role |
|-----------|------|------|
| Agora hook | `app/hooks/useLiveStream.ts` | Join channel, publish/subscribe, token renewal |
| Video view | `app/components/live/AgoraVideoView.tsx` | Renders local/remote video |
| Platform SDK | `app/lib/agora.ts` / `app/lib/agora.web.ts` | Native vs web Agora module loader |
| Host | `app/app/live/broadcast.tsx` | Params from `live/create.tsx` after `POST /api/livestreams` |
| Viewer | `app/app/live/watch/[id].tsx` | `GET /api/livestreams/:id?action=token` |

### Token usage

**Host** receives from create stream API:
- `agoraAppId`, `agoraChannel`, `agoraToken`, `agoraUid`

**Viewer** receives from token endpoint; refreshes on `onTokenWillExpire` in `useLiveStream`.

Channel join via `getAgoraModule()` — **requires development build** (not Expo Go).

---

## 3. API Flow

Tokens are not a standalone route; they are returned embedded in livestream endpoints:

| Call | Token role | Generator |
|------|------------|-----------|
| `POST /api/livestreams` | Host (publisher) | `generateHostToken(stream.id, user.userId)` |
| `GET /api/livestreams/:id?action=token` | Viewer (subscriber) | `generateViewerToken(id, user.userId)` |

Response fields: `agoraAppId` (from env), `agoraChannel`, `agoraToken`, `agoraUid`, viewer also `expiresIn: 7200`.

---

## 4. Backend Flow

**Source:** `backend-nest/src/shared/lib/agora.ts`

```
getAgoraConfig()
  → validate AGORA_APP_ID (exactly 32 chars)
  → validate AGORA_APP_CERTIFICATE (min 32 chars)

streamIdToChannel(streamId)
  → streamId.replace(/-/g, '')  // hex channel, max 64 chars

uidFromUserId(userId)
  → FNV-1a style hash → uint32, non-zero

generateHostToken(streamId, userId)
  → RtcRole.PUBLISHER, expire 4 hours (HOST_TOKEN_EXPIRE)

generateViewerToken(streamId, userId)
  → RtcRole.SUBSCRIBER, expire 2 hours (VIEWER_TOKEN_EXPIRE)

buildToken()
  → RtcTokenBuilder.buildTokenWithUid(appId, certificate, channel, uid, role, expire, expire)
```

Package: `agora-token` (`RtcTokenBuilder`, `RtcRole`).

**Called from:** `backend-nest/src/livestreams/livestreams.service.ts` in `createStream` and `getViewerToken`.

---

## 5. Database

Agora tokens are **not stored** in the database. Only `LiveStream` records reference `streamId` used as channel input.

Persistence: stream metadata, comments, viewer/like counts — separate from token lifecycle.

---

## 6. Socket

Agora handles media transport; **signaling** for comments/viewers uses Socket.IO (`live:*` events), not Agora signaling.

No Agora-specific socket events.

---

## 7. Notifications

None from Agora module. Stream start notifications are sent by `LivestreamsService.notifyFollowers` independently.

---

## 8. Redis

Agora token generation does not use Redis.

Live stream **list** cache uses Redis (15s) — unrelated to tokens.

---

## 9. BullMQ

No Agora-related BullMQ jobs.

---

## 10. Security

- **App Certificate** only on server (`AGORA_APP_CERTIFICATE` env).
- Clients receive time-limited tokens only.
- Host tokens: publisher role, 4h expiry.
- Viewer tokens: subscriber role, 2h expiry; endpoint requires JWT and live stream.
- UID deterministic per user — stable across reconnects for same user.
- Channel name derived from stream UUID — unguessable without stream id.

**Required env:**
- `AGORA_APP_ID` (32 characters)
- `AGORA_APP_CERTIFICATE`

---

## 11. Possible Bugs

1. **Expiry mismatch** — viewer API returns `expiresIn: 7200` (2h) matching code; host 4h not exposed in API metadata for client renewal (host may need manual re-create).
2. **UID collision** — hash to uint32 has theoretical collision risk (low).
3. **Channel name** — stripping hyphens only; assumes UUID format.
4. **Throws on misconfig** — `getAgoraConfig()` throws at token build time; surfaces as 500 on stream create.
5. **Duplicate lib** — `app/lib/agora.ts` is client SDK wrapper; do not confuse with `backend-nest/src/shared/lib/agora.ts` server token generator.

---

## 12. Production Readiness (%)

**90%**

Official `agora-token` builder, role separation, env validation, and integration with livestream flows are production-standard. Ensure certificate rotation process and host token renewal UX for streams longer than 4 hours.
