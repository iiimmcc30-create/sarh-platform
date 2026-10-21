#!/bin/sh
# Keeps LiveKit's TURN/TLS certificate in sync with the one Caddy obtains and renews.
# LiveKit only reads the certificate at startup, so after a renewal this restarts it.
# Runs forever (restart: unless-stopped), so it also recovers after a reboot.
set -u
: "${TURN_DOMAIN:?}"
SRC="/caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$TURN_DOMAIN"
DST=/certs
LIVEKIT_CONTAINER="${LIVEKIT_CONTAINER:-sarh-livekit}"
INTERVAL="${CERT_SYNC_INTERVAL:-3600}"

sync_once() {
  [ -f "$SRC/$TURN_DOMAIN.crt" ] && [ -f "$SRC/$TURN_DOMAIN.key" ] || return 2
  if [ -f "$DST/turn.crt" ] && cmp -s "$SRC/$TURN_DOMAIN.crt" "$DST/turn.crt"; then
    return 0
  fi
  cp "$SRC/$TURN_DOMAIN.crt" "$DST/turn.crt.new" && cp "$SRC/$TURN_DOMAIN.key" "$DST/turn.key.new"
  mv "$DST/turn.crt.new" "$DST/turn.crt" && mv "$DST/turn.key.new" "$DST/turn.key"
  return 1
}

first=1
while true; do
  sync_once
  rc=$?
  if [ "$rc" = 1 ]; then
    echo "TURN certificate updated for $TURN_DOMAIN"
    if [ "$first" = 0 ]; then
      docker restart "$LIVEKIT_CONTAINER" >/dev/null 2>&1 \
        && echo "restarted $LIVEKIT_CONTAINER" || echo "could not restart $LIVEKIT_CONTAINER"
    fi
  elif [ "$rc" = 2 ]; then
    echo "waiting for Caddy to issue the certificate for $TURN_DOMAIN"
    sleep 5
    continue
  fi
  first=0
  sleep "$INTERVAL"
done
