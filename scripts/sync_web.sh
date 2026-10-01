#!/usr/bin/env bash
# Rebuild the splat stage bundle and copy it, plus PINOC characters/motions, into the app.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/web"
[ -d node_modules ] || npm install
node build.mjs
OUT="$ROOT/App/Veplika/Web"
rm -rf "$OUT" && mkdir -p "$OUT"
cp dist/stage.html dist/stage.bundle.js "$OUT/"
cp -R "$ROOT/Resources/characters" "$ROOT/Resources/motions" "$OUT/"
echo "synced -> $OUT"
