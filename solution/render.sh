#!/usr/bin/env bash
# Render solution.html -> solution.pdf with a headless Chromium browser
# (Microsoft Edge or Google Chrome). Needs internet access once, for the
# Vazirmatn web font.
set -euo pipefail
cd "$(dirname "$0")"
python3 build.py

BROWSER=""
for cand in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v google-chrome || true)" "$(command -v chromium || true)"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then BROWSER="$cand"; break; fi
done
[ -n "$BROWSER" ] || { echo "No Chromium-based browser found" >&2; exit 1; }

PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
"$BROWSER" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --user-data-dir="$PROFILE" --virtual-time-budget=10000 \
  --run-all-compositor-stages-before-draw --no-pdf-header-footer \
  --print-to-pdf="$PWD/solution.pdf" "file://$PWD/solution.html" 2>/dev/null
echo "wrote $PWD/solution.pdf"
