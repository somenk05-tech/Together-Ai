#!/bin/bash
# land-districts-name.sh — the district says its name (10 Aug 2026).
# On a phone each plate carried only its line. The hub's name now reads above
# it — plain and bold at the same size, the desktop foot's treatment brought
# to the phone. Names come from DISTRICT_COPY (Travel, Astrology, Nutrition,
# Matchmaking…), so no "Hub" suffix and nothing new to maintain.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The district says its name"
LOG=$(git log --oneline -60)
case "$LOG" in *"The districts wear glass"*) ;; *)
  echo "Run land-districts-glass.sh first."; exit 1;; esac
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

P = 'together-city-react/src/index.css'
patch(P, '  .district-run .district-plate .hub-plate-said h2 { display: none; }', "  /* The hub's name reads above its line, plain and bold at the same size —\n     the desktop foot's treatment, brought to the phone. Deliberately NOT a\n     headline: the billboard behind it already carries the name at\n     architectural scale, and a second big one would argue with the first. */\n  .district-run .district-plate .hub-plate-said h2 {\n    display: block; margin: 0 0 3px;\n    font-size: clamp(10.5px, 3vw, 12.5px); line-height: 1.25;\n    font-weight: 700; letter-spacing: -.012em; text-transform: none;\n    color: rgba(255,255,255,.99); text-shadow: 0 1px 8px rgba(0,0,0,.45);\n    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n  }")
patch(P, "  .district-run .district-plate .hub-plate-said {\n    /* basis 0, not auto: an auto basis is the sentence's max-content width,\n       which overflows the row and forces the wrap this layout must not do. */\n    display: block; flex: 1 1 0%; min-width: 0; padding-bottom: 0;\n  }", "  .district-run .district-plate .hub-plate-said {\n    /* column, not relief's column-reverse: the name reads above its line.\n       basis 0, not auto — an auto basis is the sentence's max-content width,\n       which overflows the row and forces a wrap this layout must not do. */\n    display: flex; flex-direction: column;\n    flex: 1 1 0%; min-width: 0; padding-bottom: 0;\n  }")

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

git add together-city-react/src/index.css
git commit -m "$MARK

The phone plate showed a sentence with no subject: 'Your world, planned your
way.' over a photograph, and the reader had to recognise the building to know
which room it was. The name reads above the line now — plain, bold, and at
the SAME size, which is the desktop foot's treatment brought to the phone.

Same size is the decision worth writing down. The billboard behind it already
carries the hub's name at architectural scale; setting ours as a headline
would put two names of different sizes on one card arguing about which is the
title. A label above its sentence is what this is.

The names come from DISTRICT_COPY — Travel, Astrology, Nutrition,
Matchmaking — so there is no second list to keep in step, and no 'Hub'
suffix repeating the sign. The said block also flips from relief's
column-reverse to column, because the name must read above the line and not
under it."
git push
echo "LANDED."
