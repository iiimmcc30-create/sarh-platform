# LiveKit: scaling, HLS fallback, cross-provider nodes

Companion to `docs/livekit.md` (single node). Everything here is config-only on the media side:
adding a node or an egress worker never needs an app or backend code change.

Legend: **[tested]** = exercised for real in the PR (see the PR description for evidence);
**[untested]** = implemented/configured but not yet verified under real conditions.

## 1. How LiveKit actually distributes load

With `redis:` set in `livekit.yaml` the nodes form a cluster:

- Each node registers itself (IP, CPU load, room/participant counts) in Redis.
- When the **first** participant joins a room, LiveKit picks one node for that room using
  `node_selector` and records it in Redis. **Every later participant of that room is routed to that
  same node**, regardless of which node's signalling URL they connected to (signalling is proxied
  through Redis). **[tested locally with 2 livekit-server processes + Redis]**
- **One room lives on exactly one node.** Adding nodes increases the *number of rooms* the cluster
  can host; it does **not** raise the audience of a single room. One very large stream is bounded by
  one node's CPU/NIC. That is why large audiences use HLS (section 4), not more nodes.
- There is no rebalancing of live rooms and no migration. Selection happens only at room creation.
  `node_selector.kind: sysload` with `sysload_limit` avoids nodes already above that load; `sort_by`
  is `random` (what we render). Do not assume smarter balancing than that.
- The `limit:` section is a node guard: the rendered `limit.bytes_per_sec` (`NODE_BYTES_PER_SEC`) and
  `room.max_participants` (`ROOM_MAX_PARTICIPANTS`) are accepted by the config parser **[tested]**;
  their runtime enforcement behaviour has **not** been load-verified **[untested]**. The backend caps
  below are the primary protection.

### Entry point / DNS

| Name | Points to | Purpose |
|------|-----------|---------|
| `rtc.getsarh.com` | node 1 (A record) | `LIVEKIT_URL` used by the backend and clients |
| `rtc2.getsarh.com`, ... | node 2... | each node's own Caddy cert + direct check |
| `turn.getsarh.com`, `turn2...` | each node | TURN/TLS SNI (one per node) |

Clients connect to `LIVEKIT_URL` only; whichever node answers proxies to the room's node. The
**entry node is a single point of failure for signalling** (inference from the architecture, not
tested). To remove it, put several A records on `rtc.getsarh.com` (DNS round-robin; each node must
then serve a valid cert for that name, e.g. DNS-01 challenge or by sharing the cert) or use an
external TCP/TLS load balancer. Media itself always goes straight to the room's node via ICE
candidates (`NODE_IP`), not through the entry node.

## 2. Adding a node (any provider, no app change)

1. New VPS (Contabo, Hetzner, ...). Do **not** use the DB server. Open the firewall (below).
2. DNS: `rtcN.getsarh.com` and `turnN.getsarh.com` A records to the new IP (DNS only, no proxy).
3. `git clone`, `cp .env.media.node.example .env.media`, fill in:
   same `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`, this node's `RTC_DOMAIN`/`TURN_DOMAIN`/`NODE_IP`,
   the shared `REDIS_*` (section 3).
4. `docker compose -f docker-compose.media.yml --env-file .env.media up -d`
5. `sh scripts/media/verify-node.sh <ip> rtcN.getsarh.com turnN.getsarh.com` (black-box TLS/SNI/
   signalling/Redis-not-public checks).
6. Backend env: raise `LIVEKIT_NODE_COUNT` (and `LIVEKIT_MAX_PARTICIPANTS_PER_NODE` if set). Restart
   the backend. No new code, no app release.
7. Confirm in logs: `docker logs sarh-livekit` shows the node registering; create a test room and
   look for `selected node for room`.

Node-count and caps are **not** auto-discovered by the backend; keep `LIVEKIT_NODE_COUNT` honest.

### Firewall (every node)

| Port | Proto | Purpose |
|------|-------|---------|
| 80 | TCP | ACME HTTP-01 (Caddy) |
| 443 | TCP | SNI-routed: `rtc.*` -> Caddy (wss), `turn.*` -> LiveKit 5349 (TURN/TLS passthrough) |
| 5349 | TCP | TURN/TLS direct |
| 7881 | TCP | WebRTC over TCP fallback |
| 3478 | UDP | TURN/UDP |
| 50000-60000 | UDP | WebRTC media |
| 30000-40000 | UDP | TURN relay range |
| 51820 | UDP | WireGuard (only on nodes in the tunnel) |

Never open 6379 (Redis) publicly. 7880 and 8443 are loopback only.

## 3. Securing Redis across providers (no shared private network)

Redis holds node/room state and egress job queues. Anyone who can write to it can hijack rooms.
Pick one:

### A. WireGuard (preferred) **[tested: config renders + livekit connects; tunnel itself not brought up in CI]**
- Redis host = hub (`infra/media/wireguard/wg0-hub.conf.example`, `10.8.0.1`), every other node and
  egress worker = spoke (`wg0-node.conf.example`, `10.8.0.x`).
- Hub `.env.media`: `REDIS_BIND_IP=10.8.0.1`, `REDIS_PASSWORD=<strong>`, start with
  `--profile redis`. Redis listens on the WireGuard address only (not 0.0.0.0).
- Spokes: `REDIS_ADDRESS=10.8.0.1:6379`, same password, `REDIS_TLS=false` (the tunnel encrypts).
- Firewall: only 51820/udp is public; 6379 is reachable only through `wg0`.
- Latency matters (Redis is on the signalling path). Keep nodes in the same region, or accept the
  RTT on join.

### B. Redis TLS + password + firewall allowlist **[tested: mutual TLS accept + reject cases with real Redis and livekit-server]**
- `sh infra/media/gen-redis-tls.sh server redis.getsarh.com` then
  `sh infra/media/gen-redis-tls.sh client node2` for every node/worker. Files land in
  `infra/media/secrets/redis-tls/` (git-ignored); copy `ca.crt`, `client.crt`, `client.key` to
  each node.
- Hub: `REDIS_TLS_SERVER=true`, `REDIS_BIND_IP=<public IP>`, strong `REDIS_PASSWORD`. Redis then
  requires a client certificate signed by your CA **and** the password.
- Firewall (mandatory with this option): allow 6379/tcp **only from the node IPs**. Mutual TLS +
  password is defence in depth; the allowlist keeps the port off scanners.
- Nodes: `REDIS_TLS=true`, `REDIS_TLS_SERVER_NAME`, `REDIS_TLS_CA_FILE`,
  `REDIS_TLS_CLIENT_CERT_FILE`, `REDIS_TLS_CLIENT_KEY_FILE` (see `.env.media.node.example`).
- Rotate the client certs when a node is decommissioned (re-issue CA to revoke everyone).

### Egress workers
Egress uses the same Redis. An egress-only machine uses `.env.media.egress.example`: same Redis
settings as a node (WireGuard IP or mutual TLS), plus `EGRESS_WS_URL=wss://rtc.getsarh.com`. It
serves no viewers and exposes no public ports.

## 4. HLS fallback for big rooms

### Why
A WebRTC room is bounded by one node. Above the viewer cap the backend sends viewers to HLS:
the host's tracks are encoded by LiveKit Egress into HLS segments in S3-compatible storage
(R2/Bunny/...) and served by a CDN. HLS viewers do not consume LiveKit capacity.

### What viewers get (and don't)
- Latency about **5-10 seconds** more than WebRTC (2 s segments + player buffer). The app shows a
  badge with the delay.
- HLS viewers are **not** WebRTC participants: no mic/camera, and anything needing a media
  connection is disabled with an explanation in the UI. **Chat, likes and gifts still use the
  sockets/REST API** exactly as for WebRTC viewers.
- HLS viewers are not LiveKit participants, so the webhook-based viewer count does not include them.

### State machine
Backend (`HlsEgressService`), stored in Redis + `LiveStream.hlsEgressId/hlsUrl`:

```
off --start--> preparing --playlist has #EXTM3U + #EXTINF--> ready
                  |  \--HLS_READY_TIMEOUT_SECONDS--> failed(timeout)
                  \--egress_ended with error / FAILED / ABORTED / LIMIT_REACHED --> failed(reason)
ready --egress_ended clean--> off
```

- `hlsUrl` is exposed **only** when the backend itself fetched the playlist and saw real segments.
  While preparing, the viewer-token API answers `503 hls_preparing`; on failure `503 hls_failed`
  with `details.reason`; when HLS isn't available `503 room_full` / `cluster_full`.
- Starting is idempotent and wrapped in a timeout (`HLS_EGRESS_START_TIMEOUT_SECONDS`), so "no
  egress worker available" surfaces as `failed` instead of hanging.
- Host not publishing yet (track mode): `failed(host_not_publishing)`.

App (`app/lib/liveViewerMode.ts`, a pure reducer, tested): `connecting`, `webrtc`,
`hls_preparing` (spinner + message, polls `hls-status`), `hls` (player + latency badge + note),
`hls_failed` (clear message + retry), `waiting_slot` (stays in the queue, retries for a WebRTC
slot every 10 s), `ended`, `error`. The preparing state also has a client timeout (70 s) and the
player's own error maps to `hls_failed(playback_error)`; there is never a black screen or a
success state without a verified playlist.

Endpoints: `POST /api/livestreams/:id?action=hls-start|hls-stop` (host/admin),
`GET ...?action=hls-status`. `egress_started|updated|ended` webhooks update state.

### Egress capacity
- Default mode `track` (`LIVE_HLS_EGRESS_MODE`) encodes the host's camera+mic tracks directly, no
  headless Chrome. Cheaper than `room` mode (RoomComposite), which renders a layout in Chrome and
  needs several CPU cores per job (LiveKit guidance; not measured here).
- Each egress container needs `SYS_ADMIN` and shm (already in the compose). Run egress on its own
  VPS when you expect more than a stream or two at once, never on the DB server.
- Concurrency is bounded by egress worker CPU. When all workers are busy or absent, the request
  fails/times out and the viewer sees `hls_failed` + retry or waits for a WebRTC slot.
  **[unit-tested with mocks; real behaviour with no worker is untested]**

### Storage / CDN
Set `HLS_S3_*` + `HLS_PUBLIC_BASE_URL` (https CDN origin). All four of bucket/key/secret/public URL
must be present or HLS stays disabled (production boot reports a half-configured setup). Add an
expiry/lifecycle rule on `HLS_PATH_PREFIX/` in the bucket: segments are deleted only by lifecycle,
not by the app. Playlist cache TTL on the CDN should be at most the segment length.

## 5. Caps are env-driven: set them from load-test results

| Var | Default | Meaning |
|-----|---------|---------|
| `LIVEKIT_MAX_VIEWERS_PER_ROOM` | 250 | WebRTC viewers per live room before HLS/room_full |
| `LIVEKIT_MAX_COUNCIL_PARTICIPANTS` | 200 | listeners per council |
| `LIVEKIT_MAX_PARTICIPANTS_PER_NODE` | 0 (off) | per-node ceiling; cluster cap = this x `LIVEKIT_NODE_COUNT` |
| `LIVEKIT_NODE_COUNT` | 1 | nodes in the cluster |
| `LIVE_HLS_AUTOSTART_VIEWERS` | 0 (off) | start HLS automatically at this WebRTC viewer count |

The defaults are conservative placeholders, **not measured**. Replace them with the output of
section 6 for your hardware. A viewer already in a room is never bounced by a cap.

## 6. Load test and deriving the limit

Run from a different machine/region than the node (needs `lk`). On the node first:

```bash
sh scripts/loadtest/node-metrics.sh 5 > metrics.csv     # CPU, load, NIC rx/tx Mbps, livekit RSS
```

Then from the test machine:

```bash
export LIVEKIT_URL=wss://rtc.getsarh.com LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...
sh scripts/loadtest/livekit-ramp.sh video "50 100 200 300 400" 90s 10   # 1 publisher + N viewers
sh scripts/loadtest/livekit-ramp.sh audio "50 100 200 300" 90s 10       # 12 speakers + N listeners
python3 scripts/loadtest/derive-limit.py results/<run>/steps.csv metrics.csv \
    --port-mbps 300 --max-cpu 70 --max-loss 1.0 --max-nic 70 --headroom 0.7
```

Record per step: subscribers, node CPU % (peak), NIC tx Mbps, packet loss %, received bitrate,
errors, and the app experience (join time, freezes) on a real phone. A step passes when errors=0,
loss <= 1 %, CPU <= 70 %, TX <= 70 % of the port. Safe cap = highest passing step x 0.7.
`lk load-test` subscribers are synthetic, same-LAN-ish clients; they under-represent mobile
networks, so keep the 0.7 factor and re-test with phones.

Rule of thumb for sanity only: viewers x stream bitrate <= 0.7 x port. At 300 Mbps and a 1.5 Mbps
stream that is about 140 viewers, far below "thousands": anything beyond belongs on HLS/CDN.

## 7. Node failure behaviour

- **[tested locally]** Two nodes + Redis, room hosted on node B. Killing B: clients (connected via
  A's signalling URL) detect the drop and full-reconnect into a fresh room on the surviving node in
  roughly 25 s. The old room state (participants' subscriptions, server-side recordings/egress
  attached to it) is gone.
- If the **entry node** dies, clients using that URL cannot connect at all (see DNS above).
- In-flight egress for a dead node's room ends with an error -> `hls_failed` -> viewers see the
  retry UI.
- The app shows the normal reconnecting state of livekit-client and then rejoins; if the host's
  token expired or the stream was ended, the viewer gets `ended`. A real-device test of the whole
  flow is **[untested]**.
- LiveKit does not move a room off a failing node; recovery is "new room, everyone reconnects".

## 8. Switching RTC provider (livekit <-> agora)

- Backend `RTC_PROVIDER` is read on each request. Every create/token/eligibility response carries
  `provider` plus that provider's credentials. The app uses the response (the build-time
  `EXPO_PUBLIC_RTC_PROVIDER` only matters before a response exists, e.g. camera preview).
- Both SDKs ship in the same build (Agora is loadable unless `EXPO_PUBLIC_AGORA_ENABLED=false`).
  **No app update is needed to switch**, provided the installed build already includes the
  LiveKit modules (first LiveKit release) and the Agora credentials are set on the backend.
- Switching affects **new sessions only**. Anyone already in a live or council keeps their current
  provider until they leave; nothing is migrated mid-call. A stream started on LiveKit and viewed
  after a flip to Agora has no Agora channel: end and restart the stream after a switch.
- Caps, HLS and webhook-based counts apply to LiveKit only.
- Covered by backend `rtc-provider.spec.ts`, `livestreams-viewer-admission.spec.ts` (provider flip
  on the same service instance) and app `live-viewer-mode.test.ts`.
