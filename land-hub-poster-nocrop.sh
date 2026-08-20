#!/bin/bash
# land-hub-poster-nocrop.sh — the city does not cut its buildings (9 Aug 2026).
# The phone hub landing fills the screen with the hub's picture. Until a hub
# has its 9:19.5 poster, that picture is its LANDSCAPE building, and filling a
# tall screen with a wide photograph cropped it to the middle third — the
# Astrology sign read "ASTRO ZO". The fallback now shows the building whole at
# the top of the screen with the type in the dark beneath it.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The city does not cut its buildings"
LOG=$(git log --oneline -60)
case "$LOG" in *"The hub landing is the screen"*) ;; *)
  echo "Run land-hub-poster-landing.sh first."; exit 1;; esac
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

patch('together-city-react/src/index.css', '  /* A hub still waiting on its portrait poster: its landscape building is\n     shown full-bleed and centred rather than letterboxed into a strip. These\n     are centred elevations, so a tall crop still reads as the building. */\n  .hposter.is-wide img { object-fit: cover; object-position: center; }', '  /* A hub still waiting on its 9:19.5 poster shows its landscape building\n     WHOLE, at the top of the screen, with the type in the dark below it. A\n     tall crop of a wide picture cut the hub\'s own sign in half ("ASTRO ZO"),\n     and this city does not cut its buildings. The day a poster lands, that\n     hub joins HUB_PORTRAIT and fills the screen instead. */\n  .hposter.is-wide { background: rgba(10,10,11,1); }\n  .hposter.is-wide img { object-fit: contain; object-position: center top; }\n  .hposter.is-wide::after { height: 34%; }')

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

A hub landing on a phone is the picture, full screen — and until a hub has
its own 9:19.5 poster that picture is its landscape building, which filling a
0.49 screen cropped to the middle third: the Astrology Zone sign read
'ASTRO ZO' and the Fitness Hub's read 'ESS HUB' (owner, twice).

The fallback shows the building WHOLE now, at the top of the screen, with the
line and the button in the dark below it. Less picture, all of it — which is
the rule this city has kept everywhere else. Nothing changes for a hub that
has a poster: it still fills the screen edge to edge, because a poster is the
shape of the screen. This is the state of things until the thirteen posters
are on disk, not the design they were made for."
git push
echo "LANDED."
