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
| App | `app/app/councils/*`, `app/components/councils/*`, `app/hooks/useCouncilAudio.ts`, `app/hooks/useCouncilSocket.ts`, `app/services/councils.ts`, `app/lib/councilsAgora.ts`, `app/lib/rtcEngineGuard.ts` |

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

> Notes (pre-existing, not changed here): (1) chat messages are sent via REST from the API
> process, where `SocketEmitService` has no server — those emits are no-ops there. (2) The same
> global HTTP guards/interceptors make every existing `@SubscribeMessage` handler (`chat:*`,
> `live:*`, `presence:ping`, …) fail in the socket process. Councils avoid both.

## Rules & edge cases

- Rules must be accepted before the first join (`412 rules_required`).
- Private councils: owner, members, invited users, or a valid invite code — everyone else gets
  `404` (list/detail/token never leak private data). Invites reuse the `system` notification type
  (`data.kind = 'council_invite'`).
- Kick = 10 min re-join block; ban = permanent until unbanned. Rejected requests: 60s cooldown.
- Host leaves → council stays LIVE (host keeps seat 0 and can return). Host "end" ends it.
  Host absent > 30 min → auto-ended.
- Speakers without presence for > 2 min lose their seat (sweep, Redis presence only).
- App: one engine at a time (`rtcEngineGuard`) — a council will not start while a live stream is
  connected. Audio runs only while the room screen is focused. v1 background policy: auto-mute
  speakers when the app goes to the background; resync on foreground (no `UIBackgroundModes`).
- The app loads Agora for councils via `EXPO_PUBLIC_COUNCILS_ENABLED` (true in `eas.json`
  profiles). Live streaming keeps its own `EXPO_PUBLIC_AGORA_ENABLED` gating, unchanged.

## Deploy checklist

1. `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` set on the API.
2. Agora Console: enable Co-host token authentication.
3. Apply the migration (`prisma migrate deploy`) when approved.
4. New native build (EAS) — the councils flag is a build-time env.
5. Optional: `AGORA_CUSTOMER_ID` / `AGORA_CUSTOMER_SECRET`.
