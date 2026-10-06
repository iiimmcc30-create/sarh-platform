#!/usr/bin/env bash
# Data-server firewall: PostgreSQL 5432 / Redis 6379 reachable ONLY from the app
# server's private (or WireGuard) IP; SSH from ADMIN_SSH_IP if given; everything
# else inbound denied. Idempotent; does NOT reset or delete existing rules.
#
# Why two layers:
#   - ufw rules filter the INPUT chain (host services, SSH, WireGuard).
#   - Docker-published ports are DNAT'ed and traverse FORWARD, which BYPASSES ufw.
#     docker-compose.data.yml therefore binds 5432/6379 to DATA_SERVER_PRIVATE_IP
#     only, and this script adds DOCKER-USER rules (persisted in
#     /etc/ufw/after.rules) that drop 5432/6379 from any source except the app server.
#     The DROP rules match only connections ORIGINALLY addressed to
#     DATA_SERVER_PRIVATE_IP:5432/6379, so container egress (e.g. another stack
#     talking to a remote DB on 5432) and container-to-container traffic on the
#     same bridge are NOT affected.
#   - Traffic from local Docker bridges (docker0, br-*) to the host stays allowed,
#     so other stacks on this host (e.g. sarh-butcher on 127.0.0.1 / its bridge
#     gateway) keep working exactly as with ufw inactive.
#   - The block declares DOCKER-USER, so ufw reload rewrites that chain: rules other
#     tools put in DOCKER-USER must be added to this block instead.
#
# Usage (root):
#   DRY_RUN=1 ./scripts/data-server/setup-firewall.sh      # print plan only (default)
#   DRY_RUN=0 ./scripts/data-server/setup-firewall.sh      # apply
# Inputs (.env.data or env): APP_SERVER_PRIVATE_IP, DATA_SERVER_PRIVATE_IP
# Optional env: ADMIN_SSH_IP (else SSH stays open to all, rate-limited), SSH_PORT (22),
#   WG_PORT (51820) + APP_SERVER_PUBLIC_IP (when using WireGuard),
#   EXTRA_ALLOW_TCP="80,443" (keep these public, e.g. if this host still serves web),
#   EXTRA_APP_SERVER_IPS="10.x.x.3,10.x.x.4" (additional app servers behind a load balancer)
set -euo pipefail
# shellcheck source=scripts/data-server/_common.sh
source "$(dirname "$0")/_common.sh"

DRY_RUN="${DRY_RUN:-1}"
APP_IP="$(env_get APP_SERVER_PRIVATE_IP)"
DATA_IP="$(env_get DATA_SERVER_PRIVATE_IP)"
ADMIN_SSH_IP="${ADMIN_SSH_IP:-}"
SSH_PORT="${SSH_PORT:-22}"
WG_PORT="${WG_PORT:-51820}"
APP_PUBLIC_IP="${APP_SERVER_PUBLIC_IP:-}"
EXTRA_ALLOW_TCP="${EXTRA_ALLOW_TCP:-}"
EXTRA_APP_SERVER_IPS="${EXTRA_APP_SERVER_IPS:-}"
PG_PORT="$(env_get POSTGRES_PUBLISH_PORT 5432)"
REDIS_PORT="$(env_get REDIS_PUBLISH_PORT 6379)"
AFTER_RULES=/etc/ufw/after.rules
BEGIN_MARK='# BEGIN SARH-DATA-SERVER (managed by scripts/data-server/setup-firewall.sh)'
END_MARK='# END SARH-DATA-SERVER'

die() { echo "ERROR: $*" >&2; exit 1; }
for v in APP_IP DATA_IP; do
  is_placeholder "${!v}" && die "$v not set (APP_SERVER_PRIVATE_IP / DATA_SERVER_PRIVATE_IP in $ENV_FILE)"
  is_ipv4 "${!v}" || die "$v must be IPv4"
done
[[ -z "$ADMIN_SSH_IP" ]] || is_ipv4 "$ADMIN_SSH_IP" || [[ "$ADMIN_SSH_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] \
  || die "ADMIN_SSH_IP must be IPv4 or IPv4/CIDR"
[[ -z "$APP_PUBLIC_IP" ]] || is_ipv4 "$APP_PUBLIC_IP" || die "APP_SERVER_PUBLIC_IP must be IPv4"
APP_IPS=("$APP_IP")
if [[ -n "$EXTRA_APP_SERVER_IPS" ]]; then
  IFS=',' read -r -a extra_ips <<< "$EXTRA_APP_SERVER_IPS"
  for ip in "${extra_ips[@]}"; do
    is_ipv4 "$ip" || die "EXTRA_APP_SERVER_IPS entry '$ip' must be IPv4"
    APP_IPS+=("$ip")
  done
fi

run() {
  echo "+ $*"
  if [[ "$DRY_RUN" == "0" ]]; then "$@"; fi
}

if [[ "$DRY_RUN" == "0" ]]; then
  [[ "$(id -u)" == 0 ]] || die "run as root"
  command -v ufw >/dev/null || die "ufw not installed (apt-get install ufw)"
fi

echo "=== Plan (DRY_RUN=${DRY_RUN}) ==="
echo "app server(s) ${APP_IPS[*]} -> ${DATA_IP}:${PG_PORT}/${REDIS_PORT} ; all other sources dropped"
echo ""
echo "Non-loopback listeners on this host (anything not allowed below becomes unreachable"
echo "from outside once ufw is enabled; Docker-published ports are governed by Docker/DOCKER-USER):"
(ss -H -lntu 2>/dev/null | awk '{print $1, $5}' | grep -vE ' (127\.[0-9.]+|\[::1\]):' | sort -u | sed 's/^/  /') || true
echo ""

# --- ufw (INPUT) --- allow rules first, default policy last (no SSH lockout window)
if [[ -n "$ADMIN_SSH_IP" ]]; then
  run ufw allow proto tcp from "$ADMIN_SSH_IP" to any port "$SSH_PORT" comment 'sarh: admin ssh'
else
  echo "WARN: ADMIN_SSH_IP not set — SSH stays reachable from anywhere (rate-limited)."
  run ufw limit "${SSH_PORT}/tcp" comment 'sarh: ssh (set ADMIN_SSH_IP to restrict)'
fi
if [[ -n "$APP_PUBLIC_IP" ]]; then
  run ufw allow proto udp from "$APP_PUBLIC_IP" to any port "$WG_PORT" comment 'sarh: wireguard from app server'
fi
# Effective only for host-level listeners; Docker traffic is handled in DOCKER-USER below.
for ip in "${APP_IPS[@]}"; do
  run ufw allow proto tcp from "$ip" to "$DATA_IP" port "$PG_PORT" comment 'sarh: postgres from app server'
  run ufw allow proto tcp from "$ip" to "$DATA_IP" port "$REDIS_PORT" comment 'sarh: redis from app server'
done
if [[ -n "$EXTRA_ALLOW_TCP" ]]; then
  IFS=',' read -r -a extra <<< "$EXTRA_ALLOW_TCP"
  for p in "${extra[@]}"; do run ufw allow "${p}/tcp" comment 'sarh: extra allow'; done
fi
run ufw default allow outgoing
run ufw default deny incoming

# --- DOCKER-USER (FORWARD, persisted via ufw after.rules) ---
ALLOW_LINES=""
for ip in "${APP_IPS[@]}"; do
  ALLOW_LINES+="-A DOCKER-USER -p tcp -m conntrack --ctorigdstport ${PG_PORT} --ctdir ORIGINAL -s ${ip}/32 -j RETURN"$'\n'
  ALLOW_LINES+="-A DOCKER-USER -p tcp -m conntrack --ctorigdstport ${REDIS_PORT} --ctdir ORIGINAL -s ${ip}/32 -j RETURN"$'\n'
done
BLOCK="$(cat <<EOT
${BEGIN_MARK}
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
${ALLOW_LINES%$'\n'}
-A DOCKER-USER -p tcp -m conntrack --ctorigdst ${DATA_IP} --ctorigdstport ${PG_PORT} --ctdir ORIGINAL -j DROP
-A DOCKER-USER -p tcp -m conntrack --ctorigdst ${DATA_IP} --ctorigdstport ${REDIS_PORT} --ctdir ORIGINAL -j DROP
-A DOCKER-USER -j RETURN
-A ufw-after-input -i docker0 -j ACCEPT
-A ufw-after-input -i br-+ -j ACCEPT
COMMIT
${END_MARK}
EOT
)"
echo ""
echo "Managed block for ${AFTER_RULES}:"
while IFS= read -r l; do echo "  $l"; done <<< "$BLOCK"

if [[ "$DRY_RUN" != "0" ]]; then
  echo ""
  echo "Dry run only. Re-run with DRY_RUN=0 to apply."
  exit 0
fi

[[ -f "$AFTER_RULES" ]] || die "$AFTER_RULES not found"
cp -a "$AFTER_RULES" "${AFTER_RULES}.bak.$(date +%Y%m%d%H%M%S)"
tmp="$(mktemp)"
awk -v b="$BEGIN_MARK" -v e="$END_MARK" '$0==b{skip=1} !skip{print} $0==e{skip=0}' "$AFTER_RULES" > "$tmp"
printf '\n%s\n' "$BLOCK" >> "$tmp"
install -m 640 "$tmp" "$AFTER_RULES"
rm -f "$tmp"

if ufw status | grep -q 'Status: active'; then
  run ufw reload
else
  run ufw --force enable
fi

echo ""
ufw status verbose
echo ""
echo "DOCKER-USER:"
iptables -S DOCKER-USER
echo ""
echo "Verify from OUTSIDE (a machine that is not the app server):"
echo "  nc -vz -w3 <DATA_SERVER_PUBLIC_IP> 5432   -> must fail"
echo "  nc -vz -w3 <DATA_SERVER_PUBLIC_IP> 6379   -> must fail"
echo "From the app server: nc -vz -w3 ${DATA_IP} 5432 / 6379 -> must succeed"
echo "Note: existing ufw rules (e.g. an old 'allow 22' or '80/443') are left as-is — review: ufw status numbered"
