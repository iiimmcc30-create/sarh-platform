# LiveKit (self-hosted RTC)

Video live streams and «المجالس» voice rooms run on a self-hosted LiveKit server.
`RTC_PROVIDER=livekit|agora` (default `livekit`) switches the backend; the app follows the
`provider` field of each API response (and `EXPO_PUBLIC_RTC_PROVIDER` for pre-join previews).

## Architecture

- Backend (`backend-nest/src/shared/rtc/livekit.ts`) mints JWTs and calls the LiveKit server API.
- Rooms: live = stream id without hyphens, council = `council_<hex id>`. Identity = userId.
- Video: host publishes camera + mic, viewers subscribe only.
- Councils: listeners subscribe only, speakers publish microphone only. Seat/role/mute/kick/ban
  changes are applied instantly on the server (update permission, mute track, remove participant).
- Webhook `POST /api/livekit/webhook` (signature verified, raw body): participant joined/left set
  the viewer count, `room_finished` ends the stream.

## Media server (dedicated VPS — not the DB server)

Recommended: small VPS in Europe (OVH/Hetzner), 1 Gbps, 4 vCPU / 8 GB to start. Files:
`docker-compose.media.yml`, `livekit.yaml`, `infra/media/Caddyfile`, `.env.media.example`.

### DNS
| Record | Type | Value |
|--------|------|-------|
| `rtc.getsarh.com` | A | media VPS public IP (DNS only, no proxy/CDN) |
| `turn.getsarh.com` | A | same IP (DNS only) |

### Firewall (allow inbound)
| Port | Proto | Purpose |
|------|-------|---------|
| 80, 443 | TCP | Caddy: ACME + `wss://rtc.getsarh.com` signalling |
| 7881 | TCP | WebRTC over TCP fallback |
| 50000-60000 | UDP | WebRTC media |
| 3478 | UDP | TURN/UDP |
| 5349 | TCP | TURN/TLS |

Port 7880 stays internal (Caddy proxies to it). If you cannot open the full UDP range, shrink
`rtc.port_range_*` in `livekit.yaml` and the firewall together (about 2 ports per participant).

### Steps
1. `git clone` the repo on the VPS (or copy the 4 files), install Docker.
2. `cp .env.media.example .env.media`; set `LIVEKIT_API_SECRET=$(openssl rand -hex 32)`. Keep
   `LIVEKIT_API_KEY=sarh` (the webhook block in `livekit.yaml` references that key name).
3. Edit domains in `livekit.yaml` / `Caddyfile` if you do not use `getsarh.com`.
4. `docker compose -f docker-compose.media.yml --env-file .env.media up -d`
5. Check: `curl -I https://rtc.getsarh.com` (Caddy answers once the cert is issued) and
   `docker compose -f docker-compose.media.yml logs livekit`.
6. TURN certs are copied once at startup. Caddy renews every ~60 days; add a monthly cron:
   `docker compose -f docker-compose.media.yml --env-file .env.media up turn-certs && docker compose -f docker-compose.media.yml restart livekit`.

Logs, `LIVEKIT_KEYS` and the secret never go into git (`.env.*` is ignored except the examples).

## Backend / app configuration

Backend (`.env`, see `backend-nest/.env.example`):

```
RTC_PROVIDER=livekit
LIVEKIT_URL=wss://rtc.getsarh.com
LIVEKIT_API_KEY=sarh
LIVEKIT_API_SECRET=<same secret as .env.media>
```

Production boot fails if these are missing (or `LIVEKIT_URL` is not `wss://`). The media server
must reach `https://getsarh.com/api/livekit/webhook` (set in `livekit.yaml`); the endpoint is
public but rejects unsigned/invalid requests with 401.

App: `EXPO_PUBLIC_RTC_PROVIDER=livekit`, `EXPO_PUBLIC_LIVE_ENABLED=true` (already in `eas.json`;
`false` hides live broadcasting). The native modules (`@livekit/react-native`,
`@livekit/react-native-webrtc`, config plugins) require a **new EAS development/production build**;
OTA updates are not enough.

Rollback to Agora: set `RTC_PROVIDER=agora` + the `AGORA_*` vars on the backend and
`EXPO_PUBLIC_RTC_PROVIDER=agora` in the app build.

## Load testing

Install the CLI (`brew install livekit-cli` or `curl -sSL https://get.livekit.io/cli | bash`), then:

```bash
export LIVEKIT_URL=wss://rtc.getsarh.com LIVEKIT_API_KEY=sarh LIVEKIT_API_SECRET=...
# 1 video publisher, 200 viewers
lk load-test --room loadtest-live --video-publishers 1 --subscribers 200 --duration 2m
# council: 12 speakers, 300 listeners
lk load-test --room loadtest-council --audio-publishers 12 --subscribers 300 --duration 2m
```

Run it from a different machine/region and watch CPU, bandwidth and packet loss on the VPS.
A 1 Gbps link carries roughly 1000+ viewers of a 1 Mbps stream; scale out with more nodes +
Redis if needed.
