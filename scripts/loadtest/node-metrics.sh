#!/bin/sh
# Run ON the media node while a load test runs. Samples CPU, load, NIC throughput and
# livekit-server RSS to CSV (no dependencies beyond /proc).
#   sh node-metrics.sh [interval_sec=5] [iface=auto] > metrics.csv
set -eu
INTERVAL="${1:-5}"
IFACE="${2:-$(ip route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')}"
[ -n "$IFACE" ] || { echo "cannot detect interface; pass it as 2nd arg" >&2; exit 1; }

cpu_line() { awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++) total+=$i; print idle, total}' /proc/stat; }
net_line() { awk -v i="$IFACE:" '$1==i{print $2, $10}' /proc/net/dev; }
rss_mb() { ps -C livekit-server -o rss= 2>/dev/null | awk '{s+=$1} END{printf "%.0f", s/1024}'; }

echo "ts,cpu_pct,load1,rx_mbps,tx_mbps,livekit_rss_mb"
set -- $(cpu_line); idle0=$1; tot0=$2
set -- $(net_line); rx0=$1; tx0=$2
while true; do
  sleep "$INTERVAL"
  set -- $(cpu_line); idle1=$1; tot1=$2
  set -- $(net_line); rx1=$1; tx1=$2
  cpu=$(awk -v i0="$idle0" -v i1="$idle1" -v t0="$tot0" -v t1="$tot1" 'BEGIN{d=t1-t0; if(d<=0){print 0}else{printf "%.1f", (1-(i1-i0)/d)*100}}')
  rx=$(awk -v a="$rx0" -v b="$rx1" -v s="$INTERVAL" 'BEGIN{printf "%.2f", (b-a)*8/s/1e6}')
  tx=$(awk -v a="$tx0" -v b="$tx1" -v s="$INTERVAL" 'BEGIN{printf "%.2f", (b-a)*8/s/1e6}')
  load=$(cut -d' ' -f1 /proc/loadavg)
  echo "$(date -u +%FT%TZ),$cpu,$load,$rx,$tx,$(rss_mb)"
  idle0=$idle1; tot0=$tot1; rx0=$rx1; tx0=$tx1
done
