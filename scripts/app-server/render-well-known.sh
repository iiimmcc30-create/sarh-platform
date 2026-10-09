#!/usr/bin/env bash
# Render the App Links / Universal Links files served by nginx at /.well-known/
# (nginx/web-location.conf → ./nginx/well-known, mounted read-only).
#
#   APPLE_TEAM_ID=ABCDE12345 \
#   ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:...:FF[,11:22:...] \
#   scripts/app-server/render-well-known.sh [OUT_DIR]
#
# Values come from the environment, else from $ENV_FILE (.env.app). Both are
# PUBLIC identifiers (not secrets). Without a value the REPLACE_WITH_* placeholder
# is kept and the script exits 2 so CI / deploy can flag it. nginx serves the new
# files immediately (bind mount) — no reload or restart needed.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SARH_ROOT="${SARH_ROOT:-$REPO_ROOT}"
# shellcheck source=_common.sh
source "$SCRIPT_DIR/_common.sh"

OUT_DIR="${1:-$REPO_ROOT/nginx/well-known}"
PACKAGE_NAME="${ANDROID_PACKAGE_NAME:-com.sarh.app}"
BUNDLE_ID="${IOS_BUNDLE_ID:-com.sarh.app}"
TEAM_ID="${APPLE_TEAM_ID:-$(env_get APPLE_TEAM_ID)}"
FINGERPRINTS="${ANDROID_SHA256_CERT_FINGERPRINTS:-$(env_get ANDROID_SHA256_CERT_FINGERPRINTS)}"
missing=0

if [[ -z "$TEAM_ID" ]]; then
  echo "WARN: APPLE_TEAM_ID not set — keeping placeholder" >&2
  TEAM_ID="REPLACE_WITH_APPLE_TEAM_ID"; missing=2
elif [[ ! "$TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "ERROR: APPLE_TEAM_ID must be 10 upper-case letters/digits" >&2; exit 1
fi

fp_json=""
if [[ -z "$FINGERPRINTS" ]]; then
  echo "WARN: ANDROID_SHA256_CERT_FINGERPRINTS not set — keeping placeholder" >&2
  fp_json='"REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT"'; missing=2
else
  IFS=',' read -r -a fps <<<"$FINGERPRINTS"
  for fp in "${fps[@]}"; do
    fp="$(echo "$fp" | tr -d '[:space:]' | tr 'a-f' 'A-F')"
    [[ "$fp" =~ ^([0-9A-F]{2}:){31}[0-9A-F]{2}$ ]] || {
      echo "ERROR: bad SHA-256 fingerprint (want 32 colon-separated hex bytes)" >&2; exit 1; }
    fp_json+="${fp_json:+, }\"$fp\""
  done
fi

mkdir -p "$OUT_DIR"
cat >"$OUT_DIR/assetlinks.json.tmp" <<JSON
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "$PACKAGE_NAME",
      "sha256_cert_fingerprints": [$fp_json]
    }
  }
]
JSON
cat >"$OUT_DIR/apple-app-site-association.tmp" <<JSON
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["$TEAM_ID.$BUNDLE_ID"],
        "components": [
          { "/": "/l/*" },
          { "/": "/post/*" },
          { "/": "/u/*" },
          { "/": "/councils/join/*" }
        ]
      }
    ]
  }
}
JSON
mv "$OUT_DIR/assetlinks.json.tmp" "$OUT_DIR/assetlinks.json"
mv "$OUT_DIR/apple-app-site-association.tmp" "$OUT_DIR/apple-app-site-association"
chmod 644 "$OUT_DIR/assetlinks.json" "$OUT_DIR/apple-app-site-association"
echo "Wrote $OUT_DIR/{assetlinks.json,apple-app-site-association}"
exit $missing
