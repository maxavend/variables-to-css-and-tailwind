#!/usr/bin/env bash
# Renders the Figma Community images (1920×1080) from the HTML pages in this folder.
# Needs: npm run build (code.js + dist/ui.html), node export-demo.js, and Google Chrome.
# Pages are served from the repo root because the harness drives the real plugin UI (same origin).
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT=8765
PROFILE=$(mktemp -d)

node export-demo.js
python3 -m http.server $PORT --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER; rm -rf "$PROFILE"' EXIT
sleep 1

# carousel order; slide 1 is also the cover, the last one closes
PAGES=(cover selection modes aliases names values tailwind native end)
mkdir -p out/slides
for i in "${!PAGES[@]}"; do
  page=${PAGES[$i]}
  name=$(printf "%02d-%s" $((i + 1)) "$page")
  # render at 2× and scale down for cleaner antialiasing
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" --force-device-scale-factor=2 \
    --window-size=1920,1080 --virtual-time-budget=10000 --screenshot="out/$name@2x.png" \
    "http://127.0.0.1:$PORT/design/marketing/$page.html" >/dev/null 2>&1
  sips -z 1080 1920 "out/$name@2x.png" --out "out/slides/$name.png" >/dev/null
  rm "out/$name@2x.png"
  echo "out/slides/$name.png"
done
