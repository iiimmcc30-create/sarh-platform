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

## Media server (dedicated VPS - not the DB server)

Recommended: VPS in Europe (OVH/Hetzner/Contabo), 1 Gbps ideal, 4+ vCPU / 8 GB to start.
Files: `docker-compose.media.yml`, `infra/media/*`, `.env.media.example`. `livekit.yaml` and
`nginx.conf` are **rendered at start** from `.env.media` by the one-shot `config` service into a
volume, so no secret lives in git. Multi-node, Redis, HLS and cross-provider setups are in
`docs/livekit-scaling.md`.

### Services
| Service | Role |
|---------|------|
| `config` | renders `livekit.yaml` / `egress.yaml` / `nginx.conf` from env |
| `sni-proxy` (nginx stream) | owns 443; `turn.*` SNI -> LiveKit 5349 (TLS passthrough), everything else -> Caddy on 8443 |
| `caddy` | certificates (HTTP-01 on 80) and `wss://rtc.*` reverse proxy |
| `cert-sync` | copies Caddy's TURN cert for LiveKit and restarts LiveKit when it renews (checks hourly) |
| `livekit` | the SFU; `restart: unless-stopped`, starts only after config + first cert sync |
| `redis`, `egress` | optional profiles (`--profile redis`, `--profile egress`) |

Why SNI on 443: LiveKit 1.9.12 always advertises `turns:<turn domain>:443`, so TURN/TLS must be
reachable on 443 while Caddy also needs it for `rtc.*`. **[tested with real nginx; deployed node
verified with `scripts/media/verify-node.sh`]**

### DNS
| Record | Type | Value |
|--------|------|-------|
| `rtc.getsarh.com` | A | media VPS public IP (DNS only, no proxy/CDN) |
| `turn.getsarh.com` | A | same IP (DNS only) |

### Firewall (allow inbound)
| Port | Proto | Purpose |
|------|-------|---------|
| 80 | TCP | ACME HTTP-01 |
| 443 | TCP | SNI-routed: `rtc.*` signalling (wss), `turn.*` TURN/TLS |
| 5349 | TCP | TURN/TLS direct |
| 7881 | TCP | WebRTC over TCP fallback |
| 3478 | UDP | TURN/UDP |
| 50000-60000 | UDP | WebRTC media |
| 30000-40000 | UDP | TURN relay range (`turn.relay_range_start/end`) |

7880 and 8443 are loopback only. If you shrink `rtc.port_range_*`, shrink the firewall to match
(about 2 ports per participant).

### Steps
1. `git clone` the repo on the VPS, install Docker.
2. `cp .env.media.example .env.media`; set `LIVEKIT_API_SECRET=$(openssl rand -hex 32)`; set
   `RTC_DOMAIN`, `TURN_DOMAIN`, `WEBHOOK_URL` if they differ from `getsarh.com`.
3. `docker compose -f docker-compose.media.yml --env-file .env.media up -d`
4. `sh scripts/media/verify-node.sh <public-ip>`
5. `docker compose -f docker-compose.media.yml logs livekit cert-sync`

### Reboots and certificate renewal
Everything restarts by itself (`restart: unless-stopped`; LiveKit waits for config and the first
cert). `cert-sync` replaces the old manual `turn-certs` job: LiveKit reads the TURN cert only at
startup, so it restarts the `sarh-livekit` container when Caddy renews (the restart briefly drops
active calls; renewals happen about every 60 days). It needs the Docker socket - this is the one
privileged piece; the container does nothing else.

### Migrating a node that was set up by hand (turn-certs + systemd unit + cron)
```bash
sudo systemctl disable --now <your-livekit-systemd-unit> ; sudo rm /etc/cron.d/<monthly-cert-renew>
# stop whatever binds 443 outside compose (the manual SNI proxy), then:
git pull && cp .env.media .env.media.bak   # keep key/secret/domains; add NODE_IP if needed
docker compose -f docker-compose.media.yml --env-file .env.media down
docker compose -f docker-compose.media.yml --env-file .env.media up -d
sh scripts/media/verify-node.sh <public-ip>
```
The root `livekit.yaml` was removed (rendered now). The API key name is whatever
`LIVEKIT_API_KEY` is; the webhook block follows it, there is no longer a hard `sarh` coupling.

Logs, secrets and `.env.media` never go into git.

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

Rollback to Agora: set `RTC_PROVIDER=agora` + the `AGORA_*` vars on the backend. The app follows
the provider returned by each API response, so **no app update is needed** (both SDKs ship in the
same build). Only **new** sessions switch; ongoing streams/councils are not migrated.
Details and caps: `docs/livekit-scaling.md`.

## Load testing

See `docs/livekit-scaling.md` section 6 (`scripts/loadtest/`: ramp, node metrics, safe-limit
derivation). Viewer caps (`LIVEKIT_MAX_*`) are placeholders until set from your own results.
