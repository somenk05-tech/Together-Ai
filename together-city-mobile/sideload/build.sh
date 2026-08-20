#!/usr/bin/env bash
# Rebuild the Together City sideload APK with no Google tooling.
# Needs: aapt, dalvik-exchange (dx), zipalign, apksigner, JDK 11+ javac,
# and android-34.jar (e.g. from github.com/Reginer/aosp-android-jar).
set -euo pipefail
cd "$(dirname "$0")"

AJ="${ANDROID_JAR:-$HOME/android-jar/android-34.jar}"
[ -f "$AJ" ] || { echo "android.jar not found at $AJ (set ANDROID_JAR)"; exit 1; }

VERSION=$(grep -o 'versionName="[^"]*"' AndroidManifest.xml | cut -d'"' -f2)
OUT="TogetherCity-$VERSION.apk"

rm -rf gen obj dist classes.dex
mkdir -p gen obj dist

aapt package -f -m -M AndroidManifest.xml -S res -I "$AJ" -J gen
javac --release 8 -classpath "$AJ" -d obj $(find src gen -name '*.java')
dalvik-exchange --dex --min-sdk-version=24 --output=classes.dex obj

aapt package -f -M AndroidManifest.xml -S res -A assets -I "$AJ" -F dist/app-unsigned.apk
(cd dist && cp ../classes.dex . && aapt add app-unsigned.apk classes.dex >/dev/null)
zipalign -f 4 dist/app-unsigned.apk dist/app-aligned.apk
apksigner sign --ks tc-release.keystore --ks-key-alias togethercity \
  --ks-pass pass:togethercity2026 --key-pass pass:togethercity2026 \
  --out "dist/$OUT" dist/app-aligned.apk
apksigner verify "dist/$OUT"
echo "Built dist/$OUT"
