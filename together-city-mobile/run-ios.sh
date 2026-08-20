#!/bin/bash
# Together City — build & run the iPhone app.
# Usage: ./run-ios.sh   (then press Run in Xcode with your iPhone plugged in)
set -e
cd "$(dirname "$0")"

if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods missing — installing (may ask for your password)..."
  if command -v brew >/dev/null 2>&1; then brew install cocoapods
  else sudo gem install cocoapods; fi
fi

echo "1/3 npm install..."
npm install
echo "2/3 syncing native project (runs pod install)..."
npx cap sync ios
echo "3/3 opening Xcode..."
open ios/App/App.xcworkspace

cat <<'DONE'

In Xcode:
  1. Click "App" in the left sidebar -> Signing & Capabilities
     -> tick "Automatically manage signing" -> choose your Team.
     (No team? Xcode menu -> Settings -> Accounts -> + -> sign in
      with your Apple ID -- the free one works for your own phone.)
  2. Plug in your iPhone with a cable, pick it in the device menu
     at the top, press the Run (>) button.
  3. On the iPhone, first run only:
     Settings -> Privacy & Security -> Developer Mode -> On (phone restarts)
     Settings -> General -> VPN & Device Management -> trust your certificate.

Free Apple ID installs expire after 7 days -- just press Run again to renew.
TestFlight / App Store ($99/yr developer account) removes that limit.
DONE
