#!/usr/bin/env bash
# WireGuard tunnel between the APP server and the DATA server (use when the
# provider has no private network). PostgreSQL/Redis are then bound ONLY to the
# data server's tunnel IP (DATA_SERVER_PRIVATE_IP) — never 0.0.0.0/public.
#
# Two steps on EACH server (root):
#   1) ROLE=data ./scripts/wireguard/setup-wireguard.sh keygen     # prints this server's public key
#      ROLE=app  ./scripts/wireguard/setup-wireguard.sh keygen
#   2) exchange public keys, then:
#      ROLE=data PEER_PUBLIC_KEY=<app pubkey> \
#        DATA_SERVER_PRIVATE_IP=<tunnel ip> APP_SERVER_PRIVATE_IP=<tunnel ip> \
#        ./scripts/wireguard/setup-wireguard.sh configure
#      ROLE=app  PEER_PUBLIC_KEY=<data pubkey> DATA_SERVER_PUBLIC_IP=<data public ip> \
#        DATA_SERVER_PRIVATE_IP=<tunnel ip> APP_SERVER_PRIVATE_IP=<tunnel ip> \
#        ./scripts/wireguard/setup-wireguard.sh configure
# Example tunnel subnet (pick any unused RFC1918 /24): data=10.88.0.1, app=10.88.0.2
#
# Private keys stay in /etc/wireguard/<iface>.key (0600) and are loaded via
# PostUp — never written into the .conf or printed. DRY_RUN=1 prints the config only.
# Data-server firewall for UDP: scripts/data-server/setup-firewall.sh with
# APP_SERVER_PUBLIC_IP set (allows WG_PORT/udp only from the app server).
set -euo pipefail

ACTION="${1:-}"
ROLE="${ROLE:-}"
IFACE="${WG_IFACE:-wg0}"
WG_PORT="${WG_PORT:-51820}"
WG_PREFIX="${WG_PREFIX:-24}"
KEY_FILE="/etc/wireguard/${IFACE}.key"
CONF_FILE="/etc/wireguard/${IFACE}.conf"
DRY_RUN="${DRY_RUN:-0}"

die() { echo "ERROR: $*" >&2; exit 1; }
is_ipv4() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }

[[ "$ROLE" == data || "$ROLE" == app ]] || die "set ROLE=data or ROLE=app"
[[ "$ACTION" == keygen || "$ACTION" == configure ]] || die "usage: ROLE=data|app $0 keygen|configure"
if [[ "$DRY_RUN" != 1 ]]; then
  [[ "$(id -u)" == 0 ]] || die "run as root"
fi

ensure_tools() {
  command -v wg >/dev/null 2>&1 && return 0
  [[ "$DRY_RUN" == 1 ]] && { echo "(dry run) would install wireguard-tools"; return 0; }
  apt-get update -qq && apt-get install -y -qq wireguard-tools
}

if [[ "$ACTION" == keygen ]]; then
  ensure_tools
  install -d -m 700 /etc/wireguard
  if [[ ! -f "$KEY_FILE" ]]; then
    (umask 077 && wg genkey > "$KEY_FILE")
    echo "Generated $KEY_FILE"
  else
    echo "Keeping existing $KEY_FILE"
  fi
  echo "PUBLIC KEY (${ROLE}): $(wg pubkey < "$KEY_FILE")"
  exit 0
fi

: "${PEER_PUBLIC_KEY:?set PEER_PUBLIC_KEY (the other server public key)}"
: "${DATA_SERVER_PRIVATE_IP:?set DATA_SERVER_PRIVATE_IP (data tunnel IP)}"
: "${APP_SERVER_PRIVATE_IP:?set APP_SERVER_PRIVATE_IP (app tunnel IP)}"
{ is_ipv4 "$DATA_SERVER_PRIVATE_IP" && is_ipv4 "$APP_SERVER_PRIVATE_IP"; } || die "tunnel IPs must be IPv4"
[[ "$PEER_PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{42,43}=$ ]] || die "PEER_PUBLIC_KEY does not look like a WireGuard key"

if [[ "$ROLE" == data ]]; then
  CONF="[Interface]
# Data server tunnel IP — PostgreSQL/Redis publish on this address only.
Address = ${DATA_SERVER_PRIVATE_IP}/${WG_PREFIX}
ListenPort = ${WG_PORT}
PostUp = wg set %i private-key ${KEY_FILE}

[Peer]
# App server
PublicKey = ${PEER_PUBLIC_KEY}
AllowedIPs = ${APP_SERVER_PRIVATE_IP}/32"
else
  : "${DATA_SERVER_PUBLIC_IP:?set DATA_SERVER_PUBLIC_IP (data server public IP for Endpoint)}"
  is_ipv4 "$DATA_SERVER_PUBLIC_IP" || die "DATA_SERVER_PUBLIC_IP must be IPv4"
  CONF="[Interface]
Address = ${APP_SERVER_PRIVATE_IP}/${WG_PREFIX}
PostUp = wg set %i private-key ${KEY_FILE}

[Peer]
# Data server
PublicKey = ${PEER_PUBLIC_KEY}
Endpoint = ${DATA_SERVER_PUBLIC_IP}:${WG_PORT}
AllowedIPs = ${DATA_SERVER_PRIVATE_IP}/32
PersistentKeepalive = 25"
fi

echo "=== ${CONF_FILE} ==="
echo "$CONF"
if [[ "$DRY_RUN" == 1 ]]; then
  echo "(dry run — nothing written)"
  exit 0
fi

ensure_tools
[[ -f "$KEY_FILE" ]] || die "missing $KEY_FILE — run keygen first"
if [[ -f "$CONF_FILE" ]]; then
  cp -a "$CONF_FILE" "${CONF_FILE}.bak.$(date +%Y%m%d%H%M%S)"
fi
(umask 077 && printf '%s\n' "$CONF" > "$CONF_FILE")

systemctl enable "wg-quick@${IFACE}" >/dev/null
if systemctl is-active --quiet "wg-quick@${IFACE}"; then
  systemctl restart "wg-quick@${IFACE}"
else
  systemctl start "wg-quick@${IFACE}"
fi

if [[ "$ROLE" == data ]]; then
  # Docker must start after wg0 exists, otherwise binding 5432/6379 to the
  # tunnel IP fails at boot ("cannot assign requested address").
  install -d /etc/systemd/system/docker.service.d
  cat > /etc/systemd/system/docker.service.d/10-sarh-wireguard.conf <<EOT
[Unit]
After=wg-quick@${IFACE}.service
Wants=wg-quick@${IFACE}.service
EOT
  systemctl daemon-reload   # takes effect on next boot; running containers untouched
  echo "Installed docker.service drop-in (After=wg-quick@${IFACE})."
fi

wg show "$IFACE"
echo ""
echo "Test: ping -c3 $([[ "$ROLE" == data ]] && echo "$APP_SERVER_PRIVATE_IP" || echo "$DATA_SERVER_PRIVATE_IP")"
