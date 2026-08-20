#!/bin/bash
# land-install-block.sh — take the city with you (10 Aug 2026).
# Under "Enter your city": one install block that answers per device —
# Android downloads the APK from our own server (never Play, which does not
# list us), iPhone gets Add to Home Screen with the Safari sheet, a desk gets
# a QR. Anyone already inside the app sees nothing.
#
# REQUIRES on disk (already placed):
#   together-city-react/public/downloads/TogetherCity.apk
#   together-city-react/public/assets/img/install-qr.svg
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="Take the city with you"
LOG=$(git log --oneline -60)
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

for f in together-city-react/public/downloads/TogetherCity.apk \
         together-city-react/public/assets/img/install-qr.svg; do
  [ -f "$f" ] || { echo "missing: $f"; exit 1; }
done

python3 - <<'PATCHEOF'
import json, os

def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

W = 'together-city-react/'
R = W + 'src/'

# 1. the block itself
assert not os.path.exists(R + 'components/InstallCity.tsx'), 'InstallCity already exists'
open(R + 'components/InstallCity.tsx', 'w', encoding='utf-8').write('import { useEffect, useRef, useState } from \'react\';\n\n/**\n * TAKE THE CITY WITH YOU — the install block under "Enter your city".\n *\n * One block, three answers, because the honest instruction differs by device\n * and a menu of all three is a quiz nobody asked to sit:\n *\n *   ANDROID   the APK, from our own server. Not Play — the app is not listed\n *             there, and a button that says "Download" and opens a store page\n *             is a lie the moment it loads. It streams so the citizen sees\n *             bytes arriving, and the two things Android will ask them\n *             afterwards are said BEFORE they meet them.\n *   iOS       Add to Home Screen. There is no APK on iOS and no Play button;\n *             Apple\'s installer is the Share sheet, so the sheet is what we\n *             show — the three taps, in order, drawn rather than described.\n *   DESKTOP   a QR. A "download" button on a laptop hands a phone app to a\n *             machine that cannot run it; the code puts it on the device that\n *             can. The image is a static file, not a generated one: the URL\n *             never changes, so neither does the picture.\n *\n * A citizen who has already installed sees none of it — `display-mode:\n * standalone` means they are reading this INSIDE the app.\n */\n\ntype Device = \'android\' | \'ios\' | \'desktop\' | \'installed\';\n\nfunction detect(): Device {\n  if (typeof window === \'undefined\') return \'desktop\';\n  const ua = navigator.userAgent;\n  /* ALREADY INSIDE THE CITY — three different ways, because there are three\n     different apps and each says so differently.\n       · an installed PWA reports display-mode: standalone;\n       · iOS\'s older Safari reports navigator.standalone;\n       · the Android APK reports NEITHER. It is a WebView pointed at this\n         site, which is an ordinary browser as far as CSS is concerned — so\n         without this check the app would offer to download itself. The\n         wrapper appends TogetherCityApp/<version> to its user agent for\n         exactly this kind of question. */\n  const standalone = window.matchMedia(\'(display-mode: standalone)\').matches\n    || (window.navigator as unknown as { standalone?: boolean }).standalone === true\n    || /TogetherCityApp\\//.test(ua);\n  if (standalone) return \'installed\';\n  if (/Android/i.test(ua)) return \'android\';\n  // iPadOS 13+ reports itself as a Mac; the touch points give it away.\n  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return \'ios\';\n  return \'desktop\';\n}\n\nconst APK_URL = \'/downloads/TogetherCity.apk\';\n\nexport function InstallCity() {\n  const [device, setDevice] = useState<Device>(\'desktop\');\n  const [sheet, setSheet] = useState(false);\n  const [pct, setPct] = useState<number | null>(null);   // null = idle\n  const [done, setDone] = useState(false);\n  const [failed, setFailed] = useState(false);\n  /** Chrome\'s own install prompt, when the browser offers one. */\n  const prompt = useRef<{ prompt: () => void } | null>(null);\n  const [canPrompt, setCanPrompt] = useState(false);\n\n  useEffect(() => { setDevice(detect()); }, []);\n\n  /* AND THE HARDEST CASE: the app is installed, but they are reading this in\n     Chrome. Only the browser can answer that — getInstalledRelatedApps() does,\n     for a site whose manifest names the package and whose server vouches for\n     it in /.well-known/assetlinks.json. Where the browser cannot answer (every\n     other browser, and Chrome before the asset link is live) it returns\n     nothing and the block simply stays: a missing answer is not a yes. */\n  useEffect(() => {\n    const nav = navigator as unknown as { getInstalledRelatedApps?: () => Promise<unknown[]> };\n    if (!nav.getInstalledRelatedApps) return;\n    let live = true;\n    nav.getInstalledRelatedApps()\n      .then((apps) => { if (live && apps.length > 0) setDevice(\'installed\'); })\n      .catch(() => undefined);\n    return () => { live = false; };\n  }, []);\n\n  /* A citizen who took the APK on this device gets a quieter block next time\n     rather than the same key again. This REMEMBERS A DOWNLOAD, which is not\n     the same as an install and is never described as one. */\n  const [tookIt, setTookIt] = useState(false);\n  useEffect(() => {\n    try { setTookIt(localStorage.getItem(\'tc:apk-taken\') === \'1\'); } catch { /* storage off */ }\n  }, []);\n\n  useEffect(() => {\n    const onPrompt = (e: Event) => {\n      e.preventDefault();\n      prompt.current = e as unknown as { prompt: () => void };\n      setCanPrompt(true);\n    };\n    window.addEventListener(\'beforeinstallprompt\', onPrompt);\n    return () => window.removeEventListener(\'beforeinstallprompt\', onPrompt);\n  }, []);\n\n  if (device === \'installed\') return null;\n\n  /** Stream the APK so the citizen watches it arrive, then hand it to the\n   *  browser\'s downloader. A server that omits content-length gives no total,\n   *  and the bar says "working" rather than inventing a percentage. */\n  const download = async () => {\n    setFailed(false); setDone(false); setPct(0);\n    try {\n      const res = await fetch(APK_URL);\n      if (!res.ok || !res.body) throw new Error(String(res.status));\n      const total = Number(res.headers.get(\'content-length\') || 0);\n      const reader = res.body.getReader();\n      const chunks: BlobPart[] = [];\n      let got = 0;\n      for (;;) {\n        const { done: finished, value } = await reader.read();\n        if (finished) break;\n        if (value) { chunks.push(value); got += value.length; if (total) setPct(Math.round((got / total) * 100)); }\n      }\n      const url = URL.createObjectURL(new Blob(chunks, { type: \'application/vnd.android.package-archive\' }));\n      const a = document.createElement(\'a\');\n      a.href = url; a.download = \'TogetherCity.apk\';\n      document.body.appendChild(a); a.click(); a.remove();\n      setTimeout(() => URL.revokeObjectURL(url), 60_000);\n      setPct(100); setDone(true);\n      try { localStorage.setItem(\'tc:apk-taken\', \'1\'); } catch { /* storage off */ }\n    } catch {\n      // The browser can still fetch it the ordinary way; say so rather than\n      // leaving a dead button.\n      setFailed(true); setPct(null);\n    }\n  };\n\n  return (\n    <section className="instl" aria-label="Take Together City with you">\n      <p className="instl-eyebrow">Take the city with you</p>\n\n      {device === \'android\' && (\n        <>\n          <button type="button" className={`instl-cta${tookIt && pct === null ? \' is-quiet\' : \'\'}`}\n            onClick={() => { void download(); }} disabled={pct !== null && !done && !failed}>\n            {pct === null || failed ? (tookIt ? \'Download again\' : \'Download App for Android\')\n              : done ? \'Downloaded — open it to install\'\n              : `Downloading Together City… ${pct}%`}\n          </button>\n          {pct !== null && !done && !failed && (\n            <div className="instl-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>\n              <span style={{ width: `${pct}%` }} />\n            </div>\n          )}\n          {done && (\n            <p className="instl-note">\n              Open <b>TogetherCity.apk</b> from your notifications or Downloads. Android will ask\n              once whether to allow installs from your browser — say yes, then tap <b>Install</b>.\n            </p>\n          )}\n          {failed && (\n            <p className="instl-note">\n              The download didn’t start. <a href={APK_URL} download>Tap here to get the file directly</a>.\n            </p>\n          )}\n          {!done && !failed && pct === null && (\n            <p className="instl-note">\n              {tookIt\n                ? \'You downloaded this before — take it again only if you need the latest version.\'\n                : \'Installs straight from us — no store account, no waiting.\'}\n            </p>\n          )}\n        </>\n      )}\n\n      {device === \'ios\' && (\n        <>\n          <button type="button" className="instl-cta"\n            onClick={() => (canPrompt && prompt.current ? prompt.current.prompt() : setSheet(true))}>\n            Add to Home Screen\n          </button>\n          <p className="instl-note">Together City becomes an app on your phone — full screen, its own icon.</p>\n          {sheet && (\n            <div className="instl-sheet" role="dialog" aria-modal="true" aria-label="Add to Home Screen">\n              <button type="button" className="instl-scrim" aria-label="Close" onClick={() => setSheet(false)} />\n              <div className="instl-card">\n                <span className="instl-grab" aria-hidden />\n                <h3>Add Together City to your Home Screen</h3>\n                <ol>\n                  <li>\n                    <span className="instl-step" aria-hidden>\n                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">\n                        <path d="M12 16V4" /><path d="M8 8l4-4 4 4" /><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />\n                      </svg>\n                    </span>\n                    <span>Tap <b>Share</b> at the bottom of Safari</span>\n                  </li>\n                  <li>\n                    <span className="instl-step" aria-hidden>\n                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">\n                        <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8" /><path d="M8 12h8" />\n                      </svg>\n                    </span>\n                    <span>Choose <b>Add to Home Screen</b></span>\n                  </li>\n                  <li>\n                    <span className="instl-step" aria-hidden>\n                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">\n                        <path d="M20 6L9 17l-5-5" />\n                      </svg>\n                    </span>\n                    <span>Tap <b>Add</b> — that’s it</span>\n                  </li>\n                </ol>\n                <button type="button" className="instl-done" onClick={() => setSheet(false)}>Got it</button>\n              </div>\n            </div>\n          )}\n        </>\n      )}\n\n      {device === \'desktop\' && (\n        <div className="instl-qr">\n          <img src="/assets/img/install-qr.svg" alt="QR code linking to togethercity.app/install" width={132} height={132} />\n          <div>\n            <p className="instl-qrtitle">Point your phone at this</p>\n            <p className="instl-note">\n              The city is built for a phone. Scan to install it there — Android gets the app,\n              iPhone adds it to the Home Screen.\n            </p>\n          </div>\n        </div>\n      )}\n    </section>\n  );\n}\n')
print("created components/InstallCity.tsx")

# 2. under "Enter your city"
patch(R + 'pages/Home.tsx',
  """            )}
          </div>
        </div>

        <div className="rule" />""",
  """            )}
          </div>
          {/* The city is built for a phone; this is where it says so. */}
          <InstallCity />
        </div>

        <div className="rule" />""")

s = open(R + 'pages/Home.tsx', encoding='utf-8').read()
anchor = "import { Icon } from '@/components/ui/Icon';"
assert anchor in s, 'Icon import not found in Home.tsx'
open(R + 'pages/Home.tsx', 'w', encoding='utf-8').write(
    s.replace(anchor, anchor + "\nimport { InstallCity } from '@/components/InstallCity';", 1))
print("imported InstallCity")

# 3. its material
css_path = R + 'index.css'
css_now = open(css_path, encoding='utf-8').read()
assert '.instl' not in css_now, 'install block css already present'
open(css_path, 'w', encoding='utf-8').write(css_now + "\n" + "/* ---- Take the city with you: the install block (10 Aug) ----\n   One black key, one line of help, and — on a desk — a code for the device\n   that can actually run it. Built from the same parts as everything else:\n   the button is .btn's shape, the sheet is the drawer's material, the QR is\n   ink on paper. No colour is introduced; nothing here is a new depth. */\n.instl { margin: 26px auto 0; max-width: 44ch; }\n.instl-eyebrow {\n  margin: 0 0 12px; font-size: 10.5px; font-weight: 700; letter-spacing: .22em;\n  text-transform: uppercase; color: var(--muted);\n}\n.instl-cta {\n  display: inline-flex; align-items: center; justify-content: center; gap: 10px;\n  min-height: 52px; padding: 0 28px; border: 0; border-radius: var(--r-full);\n  font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer;\n  color: var(--card); background: var(--ink); box-shadow: var(--e2);\n}\n.instl-cta:disabled { cursor: default; opacity: .92; }\n/* Somebody who already took the file gets an outline, not the black key: the\n   loudest thing on a screen should be the thing you have not done yet. */\n.instl-cta.is-quiet { color: var(--ink); background: var(--card); box-shadow: var(--e1); }\n.instl-cta:active:not(:disabled) { transform: translateY(1px); box-shadow: var(--e1); }\n.instl-bar {\n  margin: 12px auto 0; width: min(320px, 100%); height: 6px; border-radius: var(--r-full);\n  background: var(--well); box-shadow: var(--carve); overflow: hidden;\n}\n.instl-bar > span { display: block; height: 100%; background: var(--ink); transition: width .18s ease-out; }\n.instl-note { margin: 12px auto 0; max-width: 40ch; font-size: 13px; line-height: 1.55; color: var(--ink-soft); }\n.instl-note a { text-decoration: underline; }\n\n/* the desk's answer: a picture of the address */\n.instl-qr { display: flex; align-items: center; gap: 20px; text-align: left; }\n.instl-qr img { flex: 0 0 auto; border-radius: var(--r-2); background: var(--card); padding: 10px; box-shadow: var(--e1); }\n.instl-qrtitle { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }\n.instl-qr .instl-note { margin-top: 6px; }\n\n/* iOS: the three taps, drawn */\n.instl-sheet { position: fixed; inset: 0; z-index: 300; display: flex; align-items: flex-end; }\n.instl-scrim { position: absolute; inset: 0; border: 0; padding: 0; background: rgba(0,0,0,.42); cursor: pointer; }\n.instl-card {\n  position: relative; width: 100%; margin: 0 auto; max-width: 520px;\n  padding: 10px 22px calc(22px + var(--safe-bottom));\n  border-radius: var(--r-4) var(--r-4) 0 0; background: var(--card); box-shadow: var(--e3);\n  text-align: left;\n}\n.instl-grab { display: block; width: 40px; height: 4px; margin: 0 auto 16px; border-radius: var(--r-full); background: var(--line); }\n.instl-card h3 { margin: 0 0 16px; font-size: 19px; letter-spacing: -.01em; }\n.instl-card ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 14px; }\n.instl-card li { display: flex; align-items: center; gap: 14px; font-size: 15px; line-height: 1.4; color: var(--ink); }\n.instl-step {\n  flex: 0 0 auto; display: grid; place-items: center; width: 40px; height: 40px;\n  border-radius: var(--r-2); color: var(--ink); background: var(--face-2); box-shadow: var(--e1);\n}\n.instl-done {\n  width: 100%; min-height: 48px; margin-top: 20px; border: 0; border-radius: var(--r-full);\n  font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer;\n  color: var(--card); background: var(--ink); box-shadow: var(--e1);\n}\n@media (max-width: 560px) {\n  .instl-qr { flex-direction: column; text-align: center; }\n}\n")
print("patched index.css (install block)")

# 4. the manifest names the app, and the server vouches for it — together
#    these let Chrome answer getInstalledRelatedApps(), and they are also what
#    makes a togethercity.app link open in the app rather than a tab.
mp = W + 'public/manifest.webmanifest'
m = json.load(open(mp, encoding='utf-8'))
assert 'related_applications' not in m, 'manifest already declares the app'
m['related_applications'] = [{
    "platform": "play",
    "id": "app.togethercity.mobile",
    "url": "https://togethercity.app/downloads/TogetherCity.apk",
}]
m['prefer_related_applications'] = False
json.dump(m, open(mp, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print("patched manifest.webmanifest")

os.makedirs(W + 'public/.well-known', exist_ok=True)
open(W + 'public/.well-known/assetlinks.json', 'w', encoding='utf-8').write('[\n  {\n    "relation": ["delegate_permission/common.handle_all_urls"],\n    "target": {\n      "namespace": "android_app",\n      "package_name": "app.togethercity.mobile",\n      "sha256_cert_fingerprints": [\n        "69:71:19:56:2D:56:0A:62:F9:F2:6B:B1:19:36:A7:17:C8:03:76:38:EA:92:B1:A9:44:C6:FC:37:2E:6E:47:A5"\n      ]\n    }\n  }\n]\n')
print("created public/.well-known/assetlinks.json")

PATCHEOF

cd together-city-react
echo "== gates =="
npx tsc --noEmit
npx vitest run
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/lint-ceiling.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
cd ..

git add together-city-react/src/components/InstallCity.tsx \
        together-city-react/src/pages/Home.tsx \
        together-city-react/src/index.css \
        together-city-react/public/manifest.webmanifest \
        together-city-react/public/.well-known/assetlinks.json \
        together-city-react/public/assets/img/install-qr.svg \
        together-city-react/public/downloads/TogetherCity.apk
git commit -m "$MARK

The app existed and the site never mentioned it. Under 'Enter your city'
there is now one block that gives each device the only instruction that is
true for it, rather than a menu of three and a guess:

ANDROID downloads TogetherCity.apk from our own server. Not Play — we are
not listed there, and a button that says Download and opens a store page is
a lie by the time it loads. It streams, so bytes arriving are visible, and
the two things Android asks afterwards are said before they are met.

iPHONE gets Add to Home Screen: the browser's own prompt where one exists,
and on Safari a sheet drawing the three taps. No APK, no Play button.

A DESK gets a QR, because a download button on a laptop hands a phone app to
a machine that cannot run it. The code is a static SVG — the address never
changes, so neither does the picture, and no library is shipped to draw it.

NOBODY WHO IS ALREADY INSIDE SEES ANY OF IT. That is three checks, because
there are three apps: an installed PWA reports display-mode standalone, iOS
Safari reports navigator.standalone, and the Android APK reports NEITHER —
it is a WebView, an ordinary browser as far as CSS goes, so without the
TogetherCityApp/<version> marker in its user agent the app would have
offered to download itself. For the fourth case — app installed, reading in
Chrome — only the browser can answer, so the manifest names the package and
assetlinks.json vouches for it with the APK's signing fingerprint; where a
browser cannot answer, the block stays, because a missing answer is not a
yes. Those same asset links are what make a togethercity.app link open in
the app instead of a tab.

A return visit after downloading gets a quiet outline key reading 'Download
again'. It remembers a DOWNLOAD, which is not an install, and never claims
otherwise."
git push
echo "LANDED."
