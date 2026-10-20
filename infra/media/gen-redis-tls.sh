#!/bin/sh
# Private CA + server/client certificates for Redis over the public internet (mutual TLS).
#   sh infra/media/gen-redis-tls.sh server <redis-hostname-or-ip> [outdir]   # once, on the Redis host
#   sh infra/media/gen-redis-tls.sh client <node-name>            [outdir]   # once per LiveKit/Egress node
# Output (default infra/media/secrets/redis-tls, git-ignored):
#   ca.crt  ca.key  redis.crt redis.key  <node>.crt <node>.key
# Copy ca.crt + <node>.crt + <node>.key to that node as ca.crt / client.crt / client.key.
# ca.key must stay on the machine that signs certificates (never copy it to nodes).
set -eu
mode="${1:?usage: gen-redis-tls.sh server <host-or-ip> | client <node-name> [outdir]}"
name="${2:?missing name}"
out="${3:-$(dirname "$0")/secrets/redis-tls}"
mkdir -p "$out"
umask 077
if [ ! -f "$out/ca.key" ]; then
  openssl req -x509 -newkey rsa:4096 -nodes -keyout "$out/ca.key" -out "$out/ca.crt" \
    -subj "/CN=sarh-media-redis-ca" -days 3650 >/dev/null 2>&1
fi
case "$mode" in
  server)
    case "$name" in
      *[!0-9.]*) san="DNS:$name" ;;
      *) san="IP:$name" ;;
    esac
    openssl req -newkey rsa:2048 -nodes -keyout "$out/redis.key" -out "$out/redis.csr" \
      -subj "/CN=$name" >/dev/null 2>&1
    printf 'subjectAltName=%s\nextendedKeyUsage=serverAuth\n' "$san" > "$out/redis.ext"
    openssl x509 -req -in "$out/redis.csr" -CA "$out/ca.crt" -CAkey "$out/ca.key" -CAcreateserial \
      -out "$out/redis.crt" -days 825 -extfile "$out/redis.ext" >/dev/null 2>&1
    rm -f "$out/redis.csr" "$out/redis.ext"
    ;;
  client)
    openssl req -newkey rsa:2048 -nodes -keyout "$out/$name.key" -out "$out/$name.csr" \
      -subj "/CN=$name" >/dev/null 2>&1
    printf 'extendedKeyUsage=clientAuth\n' > "$out/$name.ext"
    openssl x509 -req -in "$out/$name.csr" -CA "$out/ca.crt" -CAkey "$out/ca.key" -CAcreateserial \
      -out "$out/$name.crt" -days 825 -extfile "$out/$name.ext" >/dev/null 2>&1
    rm -f "$out/$name.csr" "$out/$name.ext"
    ;;
  *) echo "unknown mode $mode" >&2; exit 1 ;;
esac
echo "written to $out"; ls "$out"
