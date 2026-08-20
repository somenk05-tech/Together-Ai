# Together City Mobile

Native iOS and Android shells for https://togethercity.app (Capacitor 6, live-URL
mode — the app loads the deployed site, so **every push-to-deploy updates the app
instantly**; no store re-release needed for web changes).

Two independent halves:

| folder | what it is | built where |
|---|---|---|
| `android/`, `ios/` | Capacitor native projects (store path, P6 of Mobile-App-Plan) | Mac: Xcode / Android Studio |
| `sideload/` | Self-contained Android WebView wrapper, buildable with zero Google tooling | anywhere with aapt/dx/apksigner (already built once in the cloud) |

The sideload APK (`sideload/TogetherCity-1.0.0.apk`) is installable on any
Android phone today. The Capacitor projects are the path to the App Store /
Play Store.

## One-time setup on the Mac

```sh
cd together-city-mobile
npm install
npx cap sync        # copies www + config into both platforms, runs pod install
```

## iPhone (needs Xcode; free Apple ID works for your own phone)

```sh
npx cap open ios    # opens ios/App/App.xcworkspace in Xcode
```

In Xcode: select the `App` target → Signing & Capabilities → choose your Team
(personal Apple ID is fine for a device you own; App Store needs the $99/yr
developer account). Plug in the iPhone, pick it as the run destination, press
Run. With a free Apple ID the install expires after 7 days — re-run to renew;
TestFlight/App Store removes that limit.

If `pod install` fails during `cap sync`, run it manually:
`cd ios/App && pod install` (needs CocoaPods: `brew install cocoapods`).

## Android via Android Studio (store-grade build)

```sh
npx cap open android
```

Build → Generate Signed App Bundle for the Play Store, or Run on a connected
device. First open downloads the SDK automatically.

## Android sideload APK (no Android Studio needed)

`sideload/` is a plain WebView wrapper (no Gradle, no AndroidX) with:
back-button navigation, file uploads, downloads, geolocation prompts,
fullscreen video, target=_blank handling, external links → browser, offline
fallback page, TC icon + splash. `sideload/build.sh` rebuilds it with
`aapt`, `dx`, `zipalign`, `apksigner` (Ubuntu: `apt install aapt dalvik-exchange
zipalign apksigner`; android-34.jar from the Reginer/aosp-android-jar mirror).

**Keystore**: `sideload/tc-release.keystore`, alias `togethercity`, pass
`togethercity2026`. Updates must be signed with the same keystore or phones
will refuse to install over the old version. This keystore is for sideload
builds only — Play Store builds get their own signing via Android Studio /
Play App Signing. Change the password before any public distribution.

## Install the APK on a phone

Send `TogetherCity-1.0.0.apk` to the phone (AirDrop-equivalent, Drive, USB,
chat with yourself). Open it → Android asks to allow installs from that app →
allow → install. First launch shows the TC splash, then the live site.

## What the store path adds later (P6)

- Native push via FCM/APNs (Capacitor push plugin + the #41 credential)
- App Store / Play Store listings, screenshots, privacy declarations
- `https://togethercity.app/.well-known/assetlinks.json` +
  `apple-app-site-association` so links open the app (deep links are already
  declared in both shells)

## Known limits of live-URL mode

- No offline app (the offline page says so plainly; P5 of the plan covers caching)
- Google/Apple OAuth inside embedded webviews is blocked by Google — fine today
  since auth is email/password
- Web push doesn't fire inside iOS/Android webviews — native push is the P6 answer
