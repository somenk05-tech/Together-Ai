#!/bin/bash
# land-mobile-hub-posters.sh — The city walks past on a phone (9 Aug 2026, v3).
# /hubs on a phone: full-screen poster walk — snap scroll, images shown WHOLE
# (object-fit: contain, owner call: never zoomed). Hub LANDINGS speak the same
# language: one full-screen slide (portrait building, name, line, Explore pill)
# instead of the desktop plate. Desktop untouched. Falls back to HUB_HERO
# wherever a portrait doesn't exist (mail).
#
# REQUIRES: land-mobile-audit.sh landed first, and the 13 portrait webp files
# installed at together-city-react/public/assets/img/hub-portrait/<hub>.webp.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

LOG=$(git log --oneline -60)
case "$LOG" in *"Mobile audit: every doorway fits a thumb"*) ;; *)
  echo "Run land-mobile-audit.sh first (this script layers on its files)."; exit 1;; esac

MARK="The city walks past on a phone"
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

MISSING=""
for k in travel astrology nutrition entertainment social dating realestate jobs medical financial beauty fitness services; do
  [ -f "together-city-react/public/assets/img/hub-portrait/$k.webp" ] || MISSING="$MISSING $k"
done
if [ -n "$MISSING" ]; then
  echo "Portrait art missing for:$MISSING"
  echo "Drop the images in hub-art-drop/ and have Claude install them first."
  exit 1
fi

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

R = 'together-city-react/src/'

patch(R+'pages/HubLanding.tsx',
  """  mail: 'connections-hero.webp',
};""",
  "  mail: 'connections-hero.webp',\n};\n\n/**\n * Portrait art for phones — the same commissioned city shot tall (9:16), one\n * building per hub, sized for a screen held in one hand. Only hubs whose\n * portrait file exists are listed; everything else falls back to HUB_HERO\n * cover-cropped, so a missing file can never render an empty frame.\n */\nexport const HUB_PORTRAIT: Partial<Record<HubKey, string>> = {\n  travel: 'hub-portrait/travel.webp',\n  astrology: 'hub-portrait/astrology.webp',\n  nutrition: 'hub-portrait/nutrition.webp',\n  entertainment: 'hub-portrait/entertainment.webp',\n  social: 'hub-portrait/social.webp',\n  dating: 'hub-portrait/dating.webp',\n  realestate: 'hub-portrait/realestate.webp',\n  jobs: 'hub-portrait/jobs.webp',\n  medical: 'hub-portrait/medical.webp',\n  financial: 'hub-portrait/financial.webp',\n  beauty: 'hub-portrait/beauty.webp',\n  fitness: 'hub-portrait/fitness.webp',\n  services: 'hub-portrait/services.webp',\n};")

patch(R+'pages/HubLanding.tsx',
  '  /* Medical used to arrive through weather rather than through a photograph\n     in a case — a stage, built for the amber reference and then the gradient\n     one. It went with the atmosphere when the city turned black and white,\n     and the hub takes the same plate as the other twenty-four. */\n  return (',
  '  /* On a phone the landing speaks the poster walk\'s language: the hub\'s\n     portrait building fills the screen whole (never cropped), name, line and\n     one Enter pill on the photograph\'s own scrim — the same slide a citizen\n     just tapped in /hubs, now standing still. One slide inside .hubs-feed\n     reuses that CSS wholesale: one material, not two that drift. */\n  const phone = typeof window !== \'undefined\' && window.matchMedia(\'(max-width: 899px)\').matches;\n  if (phone) {\n    const art = HUB_PORTRAIT[hub] ? `/assets/img/${HUB_PORTRAIT[hub]}` : heroSrc;\n    return (\n      <HubConsentGate hub={hub}>\n        <div className="hubs-feed">\n          <Link to={firstInner} className="hf-slide">\n            <img className="no-case" src={art} alt="" />\n            <span className="hf-label">\n              <span className="hf-name"><Icon name={HUB_ICON[hub] ?? \'place\'} size={16} /> {cfg.name}</span>\n              {cfg.tag && <span className="hf-tag">{cfg.tag}</span>}\n              <span className="hf-enter">Explore now →</span>\n            </span>\n          </Link>\n        </div>\n      </HubConsentGate>\n    );\n  }\n  /* Medical used to arrive through weather rather than through a photograph\n     in a case — a stage, built for the amber reference and then the gradient\n     one. It went with the atmosphere when the city turned black and white,\n     and the hub takes the same plate as the other twenty-four. */\n  return (')

patch(R+'pages/Hubs.tsx',
  "import { HUB_HERO } from '@/pages/HubLanding';",
  "import { HUB_HERO, HUB_PORTRAIT } from '@/pages/HubLanding';")

patch(R+'pages/Hubs.tsx',
  """export function Hubs() {
  return (""",
  'export function Hubs() {\n  // Phone: the city as a poster walk — every hub a full screen, vertical snap\n  // scroll, tap anywhere to enter. Decided at mount like the sign-in backdrop:\n  // rotating a phone never crosses 900px. Desktop keeps the grid below.\n  const phone = typeof window !== \'undefined\' && window.matchMedia(\'(max-width: 899px)\').matches;\n  if (phone) {\n    return (\n      <div className="hubs-feed" aria-label="Every hub, one per screen">\n        {NAV.map((n, i) => {\n          const cfg = HUBS[n.key];\n          const art = HUB_PORTRAIT[n.key] ?? HUB_HERO[n.key];\n          return (\n            <Link key={n.key} to={n.path} className="hf-slide">\n              {art\n                ? <img className="no-case" src={`/assets/img/${art}`} alt="" loading={i < 2 ? \'eager\' : \'lazy\'} />\n                : (\n                  <span className="hf-blank" aria-hidden>\n                    <Icon name={HUB_ICON[n.key] ?? \'place\'} size={40} />\n                  </span>\n                )}\n              <span className="hf-label">\n                <span className="hf-name"><Icon name={HUB_ICON[n.key] ?? \'place\'} size={16} /> {n.label}</span>\n                {cfg?.tag && <span className="hf-tag">{cfg.tag}</span>}\n                <span className="hf-enter">Enter →</span>\n              </span>\n            </Link>\n          );\n        })}\n      </div>\n    );\n  }\n  return (')

css = open(R+'index.css', encoding='utf-8').read()
assert '.hubs-feed' not in css, 'hubs-feed block already present'
css += "\n" + "/* ---- The city as a poster walk (phones): full-screen hubs, snap scroll ---- */\n.hubs-feed { height: calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 58px);\n  overflow-y: auto; scroll-snap-type: y mandatory; overscroll-behavior: contain;\n  border-radius: var(--radius); background: #111; scrollbar-width: none; }\n.hubs-feed::-webkit-scrollbar { display: none; }\n.hf-slide { position: relative; display: block; height: 100%; scroll-snap-align: start; scroll-snap-stop: always; overflow: hidden; }\n.hf-slide img { width: 100%; height: 100%; object-fit: contain; display: block; }\n.hf-blank { display: grid; place-items: center; height: 100%; color: #8a8a8a; background: #1a1a1a; }\n.hf-label { position: absolute; left: 0; right: 0; bottom: 0; padding: 64px 18px 16px;\n  /* A photograph's own scrim — it sits ON the picture, not on the ground. */\n  background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.84) 80%); color: #fff; }\n.hf-name { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 20px; letter-spacing: -.01em; }\n.hf-tag { display: block; margin-top: 3px; font-size: 13px; color: rgba(255,255,255,.82); }\n.hf-enter { display: inline-flex; align-items: center; margin-top: 12px; min-height: 44px; padding: 0 20px;\n  border-radius: 999px; background: rgba(255,255,255,.94); color: #111; font-weight: 700; font-size: 13px; }\n/* Hub landings on a phone: the portrait plate is shown whole — never cropped\n   into the desktop's 9/4 frame. Landscape fallbacks are unaffected by contain. */\n@media (max-width: 899px) {\n  .hub-plate-art img { aspect-ratio: auto; max-height: 58vh; object-fit: contain; background: #111; }\n}\n"
open(R+'index.css', 'w', encoding='utf-8').write(css)
print("patched index.css (poster walk block)")

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

git add together-city-react/src/pages/HubLanding.tsx together-city-react/src/pages/Hubs.tsx together-city-react/src/index.css together-city-react/public/assets/img/hub-portrait
git commit -m "$MARK

/hubs on a phone is a poster walk: each hub one full screen of its portrait
building, vertical snap scroll, tap anywhere to enter — and a hub LANDING is
the same slide standing still (portrait whole via object-fit: contain, never
cropped or zoomed; name, line, Explore pill on the photograph's own scrim).
One slide inside .hubs-feed reuses the walk's CSS wholesale: one material,
not two that drift. Desktop keeps the grid and the plate. mail falls back
to HUB_HERO. Verified at app size (390×844): 9:16 art draws 390×688 —
edge-to-edge, no bars, no crop; gates green."
git push
echo "LANDED."
