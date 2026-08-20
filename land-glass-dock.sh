#!/bin/bash
# land-glass-dock.sh — the lower buttons become liquid glass (9 Aug 2026).
# Phone bottom nav floats as a frosted blur-backed capsule with a prismatic
# rim thread; the active tab is a recessed white pill speaking var(--carve).
# Material named --glass-dock in tokens.css and taught to the depth guard,
# per the --atmos-lip precedent. Desktop untouched.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

LOG=$(git log --oneline -60)
case "$LOG" in *"Mobile audit: every doorway fits a thumb"*) ;; *)
  echo "Run land-mobile-audit.sh first."; exit 1;; esac

MARK="The dock turns to glass"
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

R = 'together-city-react/src/'

# 1. The material, named, where materials live (tokens.css is the exempt file)
patch(R+'styles/tokens.css',
  ':root {',
  """:root {
  /* The phone dock's glass — a frosted capsule floating clear of the edge.
     A MATERIAL like --glass, not a sixth elevation: outer fall, contact
     shadow, lit top hairline, frosted inner glow. */
  --glass-dock: 0 14px 34px rgba(0,0,0,.16), 0 2px 6px rgba(0,0,0,.08),
    inset 0 1px 0 rgba(255,255,255,.92), inset 0 -10px 22px rgba(255,255,255,.35);""")

# 2. The guard learns the name (the --atmos-lip precedent)
patch(R+'app/relief.spec.ts',
  "|glass|glass-key|glass-in|glass-tray-shadow|glass-bubble-shadow|prism",
  "|glass|glass-key|glass-in|glass-dock|glass-tray-shadow|glass-bubble-shadow|prism")
patch(R+'app/relief.spec.ts',
  "    // --atmos-lip joins for the medical atmosphere:",
  """    // --glass-dock joins for the phone dock (9 Aug): the frosted capsule the
    // bottom bar floats in. A material like --glass — outer fall + contact +
    // lit hairline + frosted glow is what the glass IS, not how high it sits.
    // --atmos-lip joins for the medical atmosphere:""")

# 3. The dock itself (index.css append; rgba only — the colour guard bans
#    chromatic hexes; the active pill speaks var(--carve) like every nav key)
css = open(R+'index.css', encoding='utf-8').read()
assert 'Liquid-glass dock' not in css, 'dock block already present'
css += "\n" + '/* ---- Liquid-glass dock (phones): the lower buttons wear frosted capsule\n   glass — blur-backed, floating clear of the edge, active tab a recessed\n   inner pill, one whisper of prismatic rim light. Painted entirely with\n   rgba light, no pigment: the colour guard bans chromatic hexes and it is\n   right to — glass has no colour of its own. ---- */\n@media (max-width: 899px) {\n  nav.tc-bottomnav {\n    left: 10px; right: 10px; bottom: calc(var(--safe-bottom) + 10px);\n    border-radius: 999px; padding: 8px; gap: 4px; border-top: 0;\n    background: rgba(255,255,255,.58);\n    -webkit-backdrop-filter: blur(18px) saturate(1.5);\n    backdrop-filter: blur(18px) saturate(1.5);\n    border: 1px solid rgba(255,255,255,.78);\n    box-shadow: var(--glass-dock);\n  }\n  /* the prismatic thread around the rim */\n  nav.tc-bottomnav::before {\n    content: ""; position: absolute; inset: -1px; border-radius: inherit;\n    padding: 1.5px; pointer-events: none;\n    background: linear-gradient(115deg,\n      rgba(140,190,255,.5), rgba(255,255,255,0) 28%,\n      rgba(255,170,225,.38) 52%, rgba(255,255,255,0) 74%,\n      rgba(160,225,255,.45));\n    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);\n    -webkit-mask-composite: xor;\n    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);\n    mask-composite: exclude;\n  }\n  nav.tc-bottomnav a, nav.tc-bottomnav button {\n    border-radius: 999px; background: transparent; box-shadow: none;\n    color: rgba(0,0,0,.52); min-height: 52px;\n  }\n  nav.tc-bottomnav a:active, nav.tc-bottomnav button:active {\n    background: rgba(255,255,255,.55); box-shadow: none;\n  }\n  nav.tc-bottomnav a.on, nav.tc-bottomnav .on {\n    background: rgba(255,255,255,.94); color: rgba(0,0,0,.92); font-weight: 700;\n    box-shadow: var(--carve);\n  }\n  body:has(.tc-bottomnav) { padding-bottom: calc(var(--safe-bottom) + 84px); }\n  /* the poster walk breathes with the floating dock (element+class so this\n     wins whichever script lands first) */\n  div.hubs-feed { height: calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 88px); }\n}\n'
open(R+'index.css', 'w', encoding='utf-8').write(css)
print("patched index.css (glass dock)")

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

git add together-city-react/src/styles/tokens.css together-city-react/src/index.css together-city-react/src/app/relief.spec.ts
git commit -m "$MARK

The phone's lower buttons wear the frosted capsule look (owner reference,
9 Aug): the bottom nav floats clear of the edge as blur-backed glass with
one prismatic thread around the rim; the tab you are on is a recessed
white pill. Painted entirely with rgba light — the colour guard bans
chromatic hexes and glass has no pigment. The active pill speaks
var(--carve), the same word every nav key already says; the capsule
itself is a NEW named material, --glass-dock, defined in tokens.css and
added to the depth guard's list the way --atmos-lip joined: outer fall +
contact + lit hairline + frosted glow is what the glass is made of, not
how high it sits. The poster walk's height breathes with the floating
dock (element+class selector so it wins regardless of landing order)."
git push
echo "LANDED."
