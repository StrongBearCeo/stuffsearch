#!/usr/bin/env bash
# StuffSearch — build & run on macOS without a paid Apple Developer account.
#
#   ./scripts/mac-ios-build.sh sim      → Release build in the iOS Simulator.
#                                         No signing, NEVER expires.
#   ./scripts/mac-ios-build.sh device   → Release build on a USB-connected
#                                         iPhone, signed with your free Apple
#                                         ID. Apple expires this after 7 DAYS;
#                                         re-run to renew (app data is kept).
#
# Both embed the JS bundle, so the app runs with no Metro / Expo server.
set -euo pipefail

cd "$(dirname "$0")/.."
MODE="${1:-sim}"

command -v xcodebuild >/dev/null 2>&1 || {
  echo "error: Xcode not found. Install Xcode from the App Store, then run:"
  echo "       sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 1
}

[ -f .env ] || {
  echo "error: .env is missing (it is gitignored). Copy it from the Windows"
  echo "       machine, or fill in .env.example — the app needs the"
  echo "       EXPO_PUBLIC_SUPABASE_* values baked into the build."
  exit 1
}

echo "==> Installing JS dependencies"
npm ci

echo "==> Generating the native iOS project (ios/ is gitignored)"
npx expo prebuild --platform ios

case "$MODE" in
  sim)
    echo "==> Building Release for the Simulator"
    npx expo run:ios --configuration Release
    echo
    echo "Done. The app is installed in the Simulator and runs standalone."
    echo "It does not expire. Relaunch it any time from the Simulator home screen."
    ;;
  device)
    echo "==> Opening Xcode. Do this once, by hand:"
    echo "    1. Xcode → Settings → Accounts → '+' → sign in with your Apple ID"
    echo "       (a free account is fine — do NOT enrol in the paid program)."
    echo "    2. Select the 'StuffSearch' target → Signing & Capabilities →"
    echo "       tick 'Automatically manage signing' → pick your Personal Team."
    echo "    3. If it complains the bundle ID is taken, change it to something"
    echo "       unique, e.g. com.stuffsearch.app.<yourname>, and mirror that"
    echo "       into ios.bundleIdentifier in app.config.ts."
    echo "    4. On the iPhone: Settings → General → VPN & Device Management →"
    echo "       trust your developer certificate."
    echo
    echo "    Then come back and press Enter to build onto the device."
    open ios/*.xcworkspace
    read -r -p "Press Enter once signing is configured... " _
    npx expo run:ios --device --configuration Release
    echo
    echo "Done. NOTE: free-Apple-ID signing expires after 7 days — the app will"
    echo "refuse to launch until you re-run: ./scripts/mac-ios-build.sh device"
    ;;
  *)
    echo "usage: $0 [sim|device]" >&2
    exit 2
    ;;
esac
