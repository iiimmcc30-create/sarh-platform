#!/bin/sh
# Progressive load test with `lk load-test`. Run from a DIFFERENT machine/region than the node.
#   LIVEKIT_URL=wss://rtc.getsarh.com LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
#     sh scripts/loadtest/livekit-ramp.sh video "50 100 200 300" [step_duration=90s] [ramp_per_sec=10]
#   ... sh scripts/loadtest/livekit-ramp.sh audio "50 100 200"   # 12 speakers + N listeners
# Writes results/<timestamp>/{steps.csv,*.log}. Start node-metrics.sh on the node first
# (and note the wall-clock of each step: steps.csv has start/end timestamps).
set -eu
MODE="${1:?video|audio}"
STEPS="${2:?e.g. \"50 100 200\"}"
DUR="${3:-90s}"
RATE="${4:-10}"
: "${LIVEKIT_URL:?}" "${LIVEKIT_API_KEY:?}" "${LIVEKIT_API_SECRET:?}"
LK="${LK:-lk}"
OUT="${OUT_DIR:-results/$(date -u +%Y%m%dT%H%M%SZ)-$MODE}"
mkdir -p "$OUT"
echo "mode,subscribers,start,end,tracks,bitrate,packet_loss_pct,errors,exit" > "$OUT/steps.csv"

for N in $STEPS; do
  ROOM="loadtest-$MODE-$N-$(date +%s)"
  LOG="$OUT/$MODE-$N.log"
  START=$(date -u +%FT%TZ)
  if [ "$MODE" = video ]; then
    PUB="--video-publishers 1"
  else
    PUB="--audio-publishers 12"
  fi
  set +e
  "$LK" load-test --url "$LIVEKIT_URL" --api-key "$LIVEKIT_API_KEY" --api-secret "$LIVEKIT_API_SECRET" \
    --room "$ROOM" $PUB --subscribers "$N" --num-per-second "$RATE" --duration "$DUR" > "$LOG" 2>&1
  RC=$?
  set -e
  END=$(date -u +%FT%TZ)
  # Subscriber summary "Total" row: | Total | tracks | bitrate | loss (pct) | errors |
  ROW=$(awk -F'│' '/Subscriber summaries/{f=1} f && $2 ~ /Total/ {print; exit}' "$LOG" || true)
  TRACKS=$(echo "$ROW" | awk -F'│' '{gsub(/ /,"",$3); print $3}')
  BR=$(echo "$ROW" | awk -F'│' '{gsub(/^ +| +$/,"",$4); print $4}')
  LOSS=$(echo "$ROW" | awk -F'│' '{print $5}' | sed -n 's/.*(\([0-9.]*\)%).*/\1/p')
  ERR=$(echo "$ROW" | awk -F'│' '{gsub(/ /,"",$6); print $6}')
  echo "$MODE,$N,$START,$END,\"$TRACKS\",\"$BR\",${LOSS:-},${ERR:-},$RC" | tee -a "$OUT/steps.csv"
done
echo "results in $OUT"
