#!/bin/bash
# land-hub-poster-landing.sh — the hub landing is the screen (9 Aug 2026).
#
# TWO THINGS, ONE COMMIT. The bug: below 720px relief.css still says
# `.hub-plate-cta { flex: 1 1 100% }`, written when the foot was a row UNDER
# the picture. The billboard made that foot an absolutely-positioned COLUMN,
# and a column stretches its children along HEIGHT — so on a phone the Explore
# pill became a white oval covering half of every hub landing.
#
# And the design: on a phone a hub landing is now the picture, full screen,
# with the hub's line set editorially at its foot and one solid button.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The hub landing is the screen"
LOG=$(git log --oneline -60)
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

R = 'together-city-react/src/'
P = R + 'pages/HubLanding.tsx'

patch(P,
  "/**\n * One component that renders every hub's landing page from config",
  "/**\n * THE CITY'S STREET-LEVEL LINES (owner's master list).\n *\n * One sentence per hub, the one its billboard says. It lives beside the art\n * maps because the landing and the home districts must speak the SAME line —\n * two copies of a sentence is how a hub ends up promising two things.\n */\nexport const HUB_LINE: Partial<Record<HubKey, string>> = {\n  travel: 'Your world, planned your way.',\n  nutrition: 'Your food, personalized to you.',\n  dating: 'Your connection, intelligently matched.',\n  entertainment: 'Your world of things you love.',\n  jobs: 'Your career, your next move.',\n  medical: 'Your health, all in one place.',\n  financial: 'Your money, working toward your goals.',\n  realestate: 'Your perfect space, found for you.',\n  fitness: 'Your body. Your goals. Your journey.',\n  beauty: 'Your look, your way.',\n  social: 'Your people. Your communities. Your world.',\n  astrology: 'Your stars. Your journey. Your timing.',\n};\n\n/**\n * SET ONE SENTENCE THE WAY A POSTER WOULD (owner's reference, 9 Aug).\n *\n * The reference is an editorial poster: a few small words, one enormous light\n * word carrying the meaning, a quieter tail. The rule here is deterministic\n * rather than hand-written per hub — the LONGEST word of the hub's line is the\n * one the eye should land on, which for these lines is always the word that\n * means something ('career', 'personalized', 'communities'). No copy is\n * invented and no hub needs its own layout.\n *\n * The reference tints its hero word. This city cannot: every accent it owns is\n * near-black, because the ground is white everywhere else. So the emphasis is\n * carried by weight and size instead — which is the same sentence Relief\n * speaks on every other screen.\n */\nexport function setLine(line: string): { before: string[]; hero: string; after: string[] } {\n  const words = line.trim().split(/\\s+/).filter(Boolean);\n  if (words.length < 3) return { before: [], hero: words.join(' '), after: [] };\n  const bare = (w: string) => w.replace(/[^A-Za-z]/g, '');\n  let heroAt = 0;\n  words.forEach((w, i) => { if (bare(w).length > bare(words[heroAt]).length) heroAt = i; });\n  return { before: words.slice(0, heroAt), hero: words[heroAt], after: words.slice(heroAt + 1) };\n}\n\n/**\n * PORTRAIT ART — one poster per hub, shaped like a phone (9:19.5), with the\n * hub's own name and line painted into the picture by the sign-painter.\n *\n * A hub landing on a phone is a threshold you arrive at, and these are built\n * to BE that screen rather than to sit inside it. Only hubs whose poster\n * exists are listed; anything unlisted falls back to the landscape hero, so a\n * missing file is a plainer landing, never an empty frame.\n */\nexport const HUB_PORTRAIT: Partial<Record<HubKey, string>> = {\n  // Empty until the 9:19.5 posters are on disk. A hub is added here the day\n  // its file arrives — the relief guard checks every entry against\n  // public/assets/img, so this map cannot promise a picture that isn't there.\n};\n\n" + "/**\n * One component that renders every hub's landing page from config")

patch(P,
  '  return (\n    <HubConsentGate hub={hub}>\n      <div className="hub-stage">',
  '  /* ON A PHONE THE LANDING IS THE POSTER.\n     The desktop plate plays a photograph inside a cased card with a foot\n     beneath it — right for a desk, and on a phone it left a 9:19.5 poster\n     boxed in the middle of the screen with furniture around it. These images\n     are the shape of the screen and carry the hub\'s name and line themselves,\n     so here they ARE the screen: full bleed, and the only thing we add is the\n     line and the door. Decided at mount, like every other phone branch. */\n  const phone = typeof window !== \'undefined\' && window.matchMedia(\'(max-width: 899px)\').matches;\n  if (phone) {\n    const poster = HUB_PORTRAIT[hub];\n    return (\n      <HubConsentGate hub={hub}>\n        <div className={`hposter${poster ? \'\' : \' is-wide\'}`}>\n          <img className="no-case" src={poster ? `/assets/img/${poster}` : heroSrc} alt="" />\n          <div className="hposter-foot">\n            <span className="hp-mark">Together<br />City</span>\n            {(() => {\n              const { before, hero, after } = setLine(HUB_LINE[hub] ?? cfg.tag);\n              // The longest word of the small opening run is set in the serif\n              // italic — the reference\'s one flourish, and this app\'s only\n              // second typeface.\n              let flourishAt = -1;\n              before.forEach((w, i) => {\n                if (flourishAt < 0 || w.length > before[flourishAt].length) flourishAt = i;\n              });\n              return (\n                <p className="hp-line">\n                  {before.length > 0 && (\n                    <span className="hp-before">\n                      {before.map((w, i) => (\n                        <span key={i} className={i === flourishAt ? \'hp-flourish\' : undefined}>{w} </span>\n                      ))}\n                    </span>\n                  )}\n                  <span className="hp-hero">{hero}</span>\n                  {after.length > 0 && (\n                    <span className="hp-after">\n                      <b>{after[0]}</b>{after.length > 1 ? ` ${after.slice(1).join(\' \')}` : \'\'}\n                    </span>\n                  )}\n                </p>\n              );\n            })()}\n            <Link to={firstInner} className="hposter-cta">Explore<span aria-hidden> →</span></Link>\n          </div>\n        </div>\n      </HubConsentGate>\n    );\n  }\n' + '  return (\n    <HubConsentGate hub={hub}>\n      <div className="hub-stage">')

patch(R + 'app/relief.spec.ts', "    const map = Object.fromEntries(\n      [...page.matchAll(/^\\s*([a-z]+):\\s*'([^']+\\.webp)'/gm)].map((m) => [m[1], m[2]]),\n    );\n    const missing = routed\n      .map((h) => [h, map[h] ?? `${h}.webp`] as const)\n      .filter(([, file]) => !existsSync(join(APP, 'public/assets/img', file)))\n      .map(([h, file]) => `${h} → ${file}`);\n    expect(missing).toEqual([]);", "    // TWO MAPS LIVE IN THIS FILE NOW — the landscape hero every landing falls\n    // back to, and the phone poster a hub may also have. Read as one blob they\n    // merge, the later entry silently winning, so this guard would check the\n    // wrong file for every hub that has both. Each map is read on its own, and\n    // BOTH are checked: a hero for every routed hub, and a poster for every hub\n    // that claims one.\n    const mapNamed = (name: string): Record<string, string> => {\n      const at = page.indexOf(`export const ${name}`);\n      if (at < 0) return {};\n      const body = page.slice(at, page.indexOf('};', at));\n      return Object.fromEntries(\n        [...body.matchAll(/^\\s*([a-z]+):\\s*'([^']+\\.webp)'/gm)].map((m) => [m[1], m[2]]),\n      );\n    };\n    const heroes = mapNamed('HUB_HERO');\n    const posters = mapNamed('HUB_PORTRAIT');\n    const onDisk = (file: string) => existsSync(join(APP, 'public/assets/img', file));\n    const missing = [\n      ...routed\n        .map((h) => [h, heroes[h] ?? `${h}.webp`] as const)\n        .filter(([, file]) => !onDisk(file))\n        .map(([h, file]) => `hero ${h} → ${file}`),\n      ...Object.entries(posters)\n        .filter(([, file]) => !onDisk(file))\n        .map(([h, file]) => `poster ${h} → ${file}`),\n    ];\n    expect(missing).toEqual([]);")

css_path = R + 'index.css'
css_now = open(css_path, encoding='utf-8').read()
assert 'hub landing is the poster' not in css_now, 'block already present'
open(css_path, 'w', encoding='utf-8').write(css_now + "\n" + "/* ---- On a phone the hub landing is the poster (9 Aug) ----\n   The art is the shape of the screen (9:19.5) and already carries the hub's\n   name and line, painted into the picture. So the picture IS the screen: full\n   bleed between the header and the floating dock, nothing boxed, nothing\n   cropped worth speaking of. All we add is the hub's line and the door, on a\n   blur that rises from the foot and fades to nothing — the same weather the\n   districts wear, so the city speaks one language. */\n@media (max-width: 899px) {\n  .hposter {\n    position: relative; overflow: hidden; background: rgba(0,0,0,1);\n    border-radius: 0;\n    /* The poster runs to the bottom EDGE and the floating dock rides over it —\n       the way a phone shows a poster. Stopping above the dock cost 92px of a\n       9:19.5 picture, which is a sixth of it, cropped for furniture. */\n    height: calc(100dvh - var(--header-h) - var(--safe-top));\n  }\n  .hposter img { width: 100%; height: 100%; object-fit: cover; display: block; }\n  /* A hub still waiting on its portrait poster: its landscape building is\n     shown full-bleed and centred rather than letterboxed into a strip. These\n     are centred elevations, so a tall crop still reads as the building. */\n  .hposter.is-wide img { object-fit: cover; object-position: center; }\n  .hposter::after {\n    content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 46%;\n    pointer-events: none;\n    -webkit-backdrop-filter: blur(18px) saturate(1.1);\n    backdrop-filter: blur(18px) saturate(1.1);\n    background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.34) 50%, rgba(0,0,0,.68) 100%);\n    -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 55%);\n    mask-image: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 55%);\n  }\n  .hposter-foot {\n    position: absolute; left: 0; right: 0; bottom: 0; z-index: 2;\n    display: flex; flex-direction: column; align-items: flex-start; gap: 14px;\n    /* clear of the floating dock, which is 58px + its own 10px inset */\n    padding: 0 20px calc(var(--safe-bottom) + 96px);\n  }\n  /* THE POSTER SETS ONE SENTENCE (owner's editorial reference).\n     Small opening run, one enormous light word, a quieter tail — the emphasis\n     carried by weight and scale, because this city's accents are near-black\n     and a photograph is the only dark ground it has. */\n  .hp-mark {\n    font-size: 10px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase;\n    line-height: 1.35; color: rgba(255,255,255,.66); margin-bottom: 4px;\n  }\n  .hp-line { margin: 0; text-shadow: 0 1px 14px rgba(0,0,0,.5); }\n  .hp-before {\n    display: block; font-size: 19px; font-weight: 500; letter-spacing: -.01em;\n    color: rgba(255,255,255,.94);\n  }\n  .hp-flourish { font-family: var(--serif); font-style: italic; font-weight: 400; }\n  .hp-hero {\n    display: block; margin: -2px 0 -4px -3px;\n    font-size: clamp(52px, 15vw, 68px); line-height: .94;\n    font-weight: 300; letter-spacing: -.035em;\n    color: rgba(255,255,255,.99);\n  }\n  .hp-after {\n    display: block; font-size: 19px; font-weight: 400; letter-spacing: -.01em;\n    color: rgba(255,255,255,.62);\n  }\n  .hp-after b { font-weight: 700; color: rgba(255,255,255,.96); }\n  .hposter-cta {\n    display: inline-flex; align-items: center; gap: 8px;\n    height: 48px; padding: 0 24px; border-radius: 14px;\n    font-size: 14px; font-weight: 600; text-decoration: none;\n    color: rgba(255,255,255,.98); background: rgba(18,18,20,.9);\n    border: 1px solid rgba(255,255,255,.12);\n    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);\n    box-shadow: inset 0 1px 0 rgba(255,255,255,.1);\n  }\n  .hposter-cta:active { transform: scale(.985); }\n}\n")
print("patched index.css (poster landing)")

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

git add together-city-react/src/pages/HubLanding.tsx together-city-react/src/index.css together-city-react/src/app/relief.spec.ts
git commit -m "$MARK

THE BUG. Below 720px relief.css still carries .hub-plate-cta flex: 1 1 100%
— written when the foot was a row beneath the picture. The billboard turned
that foot into an absolutely-positioned column, and a column stretches its
children along HEIGHT: the Explore pill became a white oval covering half of
every hub landing on a phone. It never showed on a desk, because the desk
foot is a row.

THE DESIGN. A hub landing on a phone is now the picture itself — full screen
from under the header to the bottom edge, the floating dock riding over it
the way a phone shows a poster. At its foot the hub's line is set the way a
poster sets one: a small opening run, one enormous light word, a quieter
tail, and beneath them one solid button. The hero word is chosen by rule —
the longest word of the line — so no hub needs its own layout and no copy is
invented. The reference tints its hero word; this city cannot, every accent
it owns being near-black for a white ground, so weight and scale carry it.

HUB_LINE holds those sentences in one place, beside the art maps, so a hub's
landing and its home-page billboard cannot promise two different things.
HUB_PORTRAIT ships EMPTY: not one 9:19.5 poster is on disk yet, and a hub
shows its landscape building full-bleed until its own arrives. A hub joins
that map the day its file does.

The guard that checks a landing's picture exists now reads the hero map and
the poster map SEPARATELY and checks both. Read as one blob they merged and
the later entry won, so it was silently checking the wrong file for any hub
that had both — and it would have passed a poster that was never there."
git push
echo "LANDED."
