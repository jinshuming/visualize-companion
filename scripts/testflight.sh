#!/usr/bin/env bash
# Archive and upload a TestFlight build.
#
# Requirements (TestFlight is not available on a free Apple ID):
#   * a paid Apple Developer Program team
#   * an App Store Connect app record whose bundle id matches BUNDLE_ID
#   * Xcode signed in to that Apple ID, or an App Store Connect API key
#
#   TEAM_ID=ABCDE12345 BUNDLE_ID=com.you.visualizecompanion ./scripts/testflight.sh
set -euo pipefail
: "${TEAM_ID:?set TEAM_ID to your paid Apple Developer team id}"
: "${BUNDLE_ID:?set BUNDLE_ID to the bundle id registered in App Store Connect}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%y%m%d%H%M)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/App/build-archive"

"$ROOT/scripts/sync_web.sh"
cd "$ROOT/App" && xcodegen generate

xcodebuild -project Veplika.xcodeproj -scheme Veplika -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/Veplika.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM_ID" PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates archive

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
PLIST

xcodebuild -exportArchive -archivePath "$OUT/Veplika.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -allowProvisioningUpdates
echo "Uploaded build $BUILD_NUMBER. It appears in TestFlight after App Store Connect finishes processing."
