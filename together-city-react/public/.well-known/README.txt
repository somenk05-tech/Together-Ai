assetlinks.json makes https://togethercity.app/... links open the Android app
(the matching intent filter is in together-city-mobile/AndroidManifest.xml,
added 26 Aug). The fingerprint in it is the release signing certificate's
SHA-256 already — if the keystore ever changes, regenerate it with:
  keytool -list -v -keystore <release.keystore> | grep SHA256
iOS universal links would need apple-app-site-association plus an Associated
Domains entitlement; the togethercity:// scheme already covers push deep
links on both platforms.
