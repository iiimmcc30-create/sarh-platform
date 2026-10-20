#!/bin/sh
# Black-box checks of a deployed media node (run from any machine).
#   sh scripts/media/verify-node.sh <node-public-ip> [rtc-domain] [turn-domain]
# Verifies: TLS+SNI routing on 443 (rtc -> Caddy cert, turn -> LiveKit TURN cert), wss signalling,
# TURN/TLS on 5349, and that Redis is NOT reachable from here (6379).
set -u
IP="${1:?node public IP}"
RTC="${2:-rtc.getsarh.com}"
TURN="${3:-turn.getsarh.com}"
fail=0
ok() { echo "PASS  $*"; }
bad() { echo "FAIL  $*"; fail=1; }

subject() { echo | timeout 8 openssl s_client -connect "$IP:$1" -servername "$2" 2>/dev/null | openssl x509 -noout -subject -issuer 2>/dev/null | tr '\n' ' '; }

for pair in "443 $RTC" "443 $TURN" "5349 $TURN"; do
  set -- $pair
  s=$(subject "$1" "$2")
  if [ -n "$s" ]; then ok "TLS $IP:$1 SNI=$2 -> $s"; else bad "TLS $IP:$1 SNI=$2 gave no certificate"; fi
done

a=$(subject 443 "$RTC"); b=$(subject 443 "$TURN"); c=$(subject 5349 "$TURN")
[ -n "$b" ] && [ "$b" = "$c" ] && ok "443/$TURN serves the same certificate as 5349 (SNI passthrough to TURN/TLS)" || bad "443/$TURN does NOT match the TURN/TLS listener on 5349"
[ -n "$a" ] && [ "$a" != "$b" ] && ok "443/$RTC serves a different certificate (Caddy) than the TURN host" || echo "WARN  rtc and turn certificates look identical (expected when both are Let's Encrypt for different names: compare subjects above)"

code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' --resolve "$RTC:443:$IP" "https://$RTC/" 2>/dev/null || echo 000)
[ "$code" = 200 ] && ok "https://$RTC/ -> 200 (LiveKit health via Caddy)" || bad "https://$RTC/ -> $code"

code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' --resolve "$RTC:443:$IP" "https://$RTC/rtc/validate" 2>/dev/null || echo 000)
[ "$code" = 401 ] && ok "https://$RTC/rtc/validate -> 401 (LiveKit signalling reachable, token required)" || bad "https://$RTC/rtc/validate -> $code (expected 401)"

if timeout 4 sh -c "exec 3<>/dev/tcp/$IP/6379" 2>/dev/null; then bad "Redis port 6379 is reachable from the internet"; else ok "Redis 6379 not reachable from here"; fi
exit $fail
