# «المجالس» — Voice Councils

Audio-only live rooms. Up to **12 speakers** (the host occupies one seat), unlimited listeners,
speak requests, host/moderator moderation, public or private (invite) councils. Native app only —
the web build shows an "available in the app" placeholder.

## Pieces

| Layer | Files |
|-------|-------|
| DB (additive) | `backend-nest/prisma/schema.prisma` (`Council`, `CouncilMember`, `CouncilSpeakRequest`, `CouncilInvite` + 4 enums), migration `prisma/migrations/20261006230000_councils/` |
| API | `backend-nest/src/councils/` (`CouncilsController` → `/api/councils/*`, `CouncilsService`, policy in `lib/council-policy.ts`) |
| Realtime | `gateway/app.gateway.ts` (`council:join` / `council:leave` / `council:heartbeat`), `councils/services/council-realtime.service.ts`, Redis bridge `gateway/services/council-socket-bridge*.ts` |
| Tokens | `backend-nest/src/shared/lib/agora.ts` → `generateCouncilToken` (live helpers unchanged) |
| Optional Agora REST | `councils/services/council-agora-moderation.service.ts` |
| App | `app/app/councils/*`, `app/components/councils/*`, `app/hooks/useCouncilAudio.ts`, `app/hooks/useCouncilSocket.ts`, `app/services/councils.ts`, `app/lib/councilsAgora.ts`, `app/lib/rtcProvider.ts`, `app/lib/rtcEngineGuard.ts` |

## Seats & the 12-speaker cap

"On stage" = the member row has a `seatIndex` (0..11). Every seat change (accept request, promote,
leave stage, demote, kick, ban, sweep) runs inside one transaction that first takes
`SELECT … FOR UPDATE` on the `Council` row, then picks the lowest free seat. Backstops in the DB:
`UNIQUE(councilId, seatIndex)` and `CHECK (seatIndex IS NULL OR seatIndex BETWEEN 0 AND 11)`
(violations map to `409 council_full`). Covered by a real-Postgres race test
(`src/councils/councils.integration.spec.ts`, runs when `COUNCILS_TEST_DATABASE_URL` is set).

## Agora token model

Channel `council_<uuid-hex>`, uid = the same FNV hash used by live (`uidFromUserId`).

| Role | Privileges |
|------|------------|
| Listener (and muted-by-moderator / off-stage) | join channel only (2h) — subscribe |
| Speaker on stage | join (2h) + **publish audio** with a **10 min** privilege |

Video and data-stream publishing are never granted. `POST /api/councils/:id/token` re-reads the
member row from the DB on every renewal, so a demoted/muted/banned speaker loses publish within
≤10 minutes even with a modified client; the app also renews on every role change.

### Required Agora Console setting

**Enable "Co-host token authentication"** for the project (Agora Console → Project → Features).
Without it Agora does not enforce the publish privilege and a subscriber token can still publish.

### Optional: instant enforcement (kicking-rule)

Set `AGORA_CUSTOMER_ID` / `AGORA_CUSTOMER_SECRET` (RESTful API key) to let the server create Agora
kicking-rules on kick/ban (`join_channel`) and on mute/demote (`publish_audio`), and delete them on
unmute/promote/unban. When unset, these calls are skipped silently — enforcement then relies on
the token expiry above plus the client following realtime events.

## Realtime

The API process has no Socket.IO server, so council events are published on Redis
(`socket:council-emit`, db 3) by `CouncilSocketBridgeService` and re-emitted by
`CouncilSocketBridgeListenerService` inside the socket process (only `council:*` events to
`council:<uuid>` / `user:<uuid>` rooms are accepted).

Events: `council:speakers`, `council:listeners`, `council:mic`, `council:role`, `council:kicked`,
`council:request-result`, `council:requests` (host/mods), `council:updated`, `council:ended`,
`council:joined`, `council:error`. The app also resyncs from REST on (re)connect, foreground, and
every 45s.

Listener count = Redis presence ZSET per council (`council:presence:<id>`, heartbeat 25s, stale
after 75s, removed on disconnect) minus online speakers. There is no listener list endpoint/UI.

Client → server council messages (`council:join` / `council:leave` / `council:heartbeat`) are
bound as raw socket listeners in `handleConnection` (auth = the socket handshake, per-socket
budget of 20 messages / 10s), not `@SubscribeMessage`: in the socket process the global HTTP
guards/interceptors (`JwtAuthGuard`, `RateLimitGuard`, `RequestIdInterceptor`) throw on the ws
context.

> Notes: (1) chat messages are sent via REST from the API process, where `SocketEmitService`
> has no server — those emits are no-ops there. (2) The global HTTP guards/interceptors now
> return early for non-HTTP contexts (`context.getType() !== 'http'`), so `@SubscribeMessage`
> handlers (`chat:*`, `live:*`, `presence:ping`, …) work in the socket process; socket auth stays
> in `handleConnection` (handlers wait for `client.data.user` via `socketUser()`).

## Media (LiveKit by default)

`RTC_PROVIDER=livekit|agora` (default `livekit`). Room = `council_<hex id>`, identity = userId.
Listeners get a subscribe-only token; speakers get a microphone-only publish token (no data,
never screen share). Camera is granted only in golden councils (see below). Moderation applies instantly through the LiveKit server API (`updateParticipant`
permission, `mutePublishedTrack`, `removeParticipant` with token revocation) on seat accept,
role change, mute, kick and ban. With `agora` the previous behaviour (token renewal + kicking
rule) is kept. See `docs/livekit.md`.

Listener cap: `LIVEKIT_MAX_COUNCIL_PARTICIPANTS` (default 200, env-driven; set it from load-test
results). A full council answers `503 room_full` (`livekitError: 'room_full'` in the join
response). Audio rooms have no HLS fallback. Provider switches apply to new sessions only.

## Private councils (join code)

Private councils appear in the public list with a lock. `GET :id` for a non-member returns the card
only (`locked: true`, no speakers/listeners/codes). `POST :id/join` runs the access check **before**
rules and before any media credentials:

- owner, existing non-banned members, and users with a per-user invite pass;
- everyone else must send `code` (the host's join code, case-insensitive; the invite-link code is
  also accepted). Errors: `403 council_code_required`, `403 council_code_invalid`,
  `429 council_code_locked`.
- Wrong attempts are limited to 5 per user+council and 40 per council per 10 minutes (Redis
  `incr`/`expire`, in-memory fallback). A locked user is rejected before the code is compared.
- The host sets `joinCode` on create/update (4–16 letters/digits) or gets a generated one;
  `POST :id/join-code/regenerate` (alias `invite-code/rotate`) renews both join code and invite link.
  Kick/ban work as before.
- «طلب الرمز»: `POST :id/code-request` notifies the host (`data.kind = 'council_code_request'`;
  limits: 1 per user+council per 10 min, 10 per user per hour → `429 code_request_rate_limited`).
  Host answers with `POST :id/code-requests/:userId/respond` `{action: invite | send_code | ignore}`:
  `invite` creates a **one-time** invite (consumed after the join succeeds), `send_code` notifies the
  requester with the code (`council_code`), `ignore` is silent. `GET :id/code-requests` lists pending.

## Golden councils (المجلس الذهبي)

`Council.golden` is set by an admin (`PATCH admin/councils/:id/golden`, ADMIN role; payment later).
Publish policy (`councilPublishFor`, used for tokens and live `updateParticipant`):

| member | golden? | verified seller? | camera approved? | grant |
| --- | --- | --- | --- | --- |
| listener / banned / muted by moderator | any | any | any | none |
| speaker | no | any | any | microphone |
| speaker | yes | no | any | microphone |
| speaker | yes | yes | no | microphone |
| speaker | yes | yes | yes | microphone + camera |
| host | yes | yes | n/a | microphone + camera |
| host | yes | no | n/a | microphone |

Verified seller = `User.verified === true` on an active, non-deleted account. Screen share is never
granted. The host approves/withdraws a speaker's camera with member actions `allow_camera` /
`revoke_camera` (409 `golden_required`, `not_on_stage`, `seller_not_verified`, `camera_unavailable`
under Agora). Revoking golden (admin) re-applies grants, drops approvals and the gallery.

Stage gallery: `PUT :id/stage/images` (≤10 images), `POST :id/stage/images/step {dir}`, removal via
`DELETE :id/image`. Host only, golden, verified seller.

Bandwidth: the token response carries `videoProfile` (only with a camera grant) from
`COUNCIL_VIDEO_MAX_HEIGHT` (default 540, max 720), `COUNCIL_VIDEO_MAX_FPS` (24) and
`COUNCIL_VIDEO_MAX_BITRATE_KBPS`. LiveKit does not enforce resolution server-side, so the app applies it
(capture size, simulcast with a half-size layer, `adaptiveStream` + `dynacast`) and listeners subscribe to
camera tracks only while the room screen is open.

Admin: `GET admin/councils` (STAFF), `PATCH admin/councils/:id/golden` (ADMIN),
`POST admin/councils/:id/close` (STAFF). Migration `20261021090000_golden_councils_join_code`
(additive; also copies the invite code to `joinCode` for existing PRIVATE councils).

## Rules & edge cases

- Rules must be accepted before the first join (`412 rules_required`).
- Private councils are listed (lock badge) but entering needs the host's join code — see
  «Private councils» below. Invites reuse the `system` notification type
  (`data.kind = 'council_invite'`).
- Kick = 10 min re-join block; ban = permanent until unbanned. Rejected requests: 60s cooldown.
- Host leaves → council stays LIVE (host keeps seat 0 and can return). Host "end" ends it.
  Host absent > 30 min → auto-ended.
- Speakers without presence for > 2 min lose their seat (sweep, Redis presence only).
- App: one engine at a time (`rtcEngineGuard`) — a council will not start while a live stream is
  connected. Audio runs only while the room screen is focused. v1 background policy: auto-mute
  speakers when the app goes to the background; resync on foreground (no `UIBackgroundModes`).
- With `RTC_PROVIDER=agora` the app loads Agora for councils via `EXPO_PUBLIC_COUNCILS_ENABLED` (true in `eas.json`
  profiles). Live streaming keeps its own `EXPO_PUBLIC_AGORA_ENABLED` gating, unchanged.

## Deploy checklist

1. `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` set on the API.
2. Agora Console: enable Co-host token authentication.
3. Apply the migration (`prisma migrate deploy`) when approved.
4. New native build (EAS) — the councils flag is a build-time env.
5. Optional: `AGORA_CUSTOMER_ID` / `AGORA_CUSTOMER_SECRET`.
