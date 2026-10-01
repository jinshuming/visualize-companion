#!/usr/bin/env bash
# Capture a transparent picker thumbnail for a character via the iOS simulator (debug build).
#   ./scripts/capture_thumb.sh <id> [dist] [ty]
# Renders the character on white and on black with the animation frozen, then recovers alpha
# from the two frames and writes Resources/characters/<id>.webp.
set -euo pipefail
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
ID="$1"; DIST="${2:-4.9}"; TY="${3:-0.95}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIM="${SIM:-16793A41-C7D1-42B0-A51F-463BC2E0D3CD}"
BID=ai.veplika.app
TMP="$(mktemp -d)"

xcrun simctl terminate "$SIM" $BID 2>/dev/null || true
xcrun simctl install "$SIM" "$ROOT/App/build/Build/Products/Debug-iphonesimulator/Veplika.app"
DATA="$(xcrun simctl get_app_container "$SIM" $BID data)"
rm -f "$DATA/Documents/thumb-state.txt"
xcrun simctl launch "$SIM" $BID -thumbCapture -companion "$ID" -thumbDist "$DIST" -thumbTy "$TY" >/dev/null

got_white=0; got_black=0
for _ in $(seq 1 240); do
  sleep 0.25
  st="$(cat "$DATA/Documents/thumb-state.txt" 2>/dev/null || true)"
  if [ "$st" = white ] && [ $got_white = 0 ]; then xcrun simctl io "$SIM" screenshot "$TMP/white.png" >/dev/null 2>&1; got_white=1; fi
  if [ "$st" = black ] && [ $got_black = 0 ]; then xcrun simctl io "$SIM" screenshot "$TMP/black.png" >/dev/null 2>&1; got_black=1; fi
  [ "$st" = done ] && break
done
[ $got_white = 1 ] && [ $got_black = 1 ] || { echo "capture failed" >&2; exit 1; }
cp "$TMP/white.png" "/tmp/thumb-$ID-white.png" 2>/dev/null || true

PYTHONPATH="${PYLIB:-}" python3 - "$TMP/white.png" "$TMP/black.png" "$ROOT/Resources/characters/$ID.webp" <<'PY'
import sys
from PIL import Image
import numpy as np
w = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
b = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(np.float32)
# pixel = C*a + bg*(1-a)  =>  white-black = 255*(1-a)
alpha = np.clip(1 - (w - b).mean(axis=2) / 255.0, 0, 1)
color = np.where(alpha[..., None] > 0.02, b / np.maximum(alpha[..., None], 1e-3), 0)
# Mask the Dynamic Island / status bar band and the home-indicator band, which are always black.
alpha[:int(0.075 * alpha.shape[0])] = 0
alpha[int(0.985 * alpha.shape[0]):] = 0
rgba = np.dstack([np.clip(color, 0, 255), alpha * 255]).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA')
bbox = img.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
x0, y0, x1, y1 = bbox
pad = int(0.04 * max(x1 - x0, y1 - y0))
img = img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))
img.thumbnail((640, 640))
img.save(sys.argv[3], 'WEBP', quality=88)
print('saved', sys.argv[3], img.size)
PY
