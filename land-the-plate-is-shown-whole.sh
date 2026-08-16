#!/usr/bin/env bash
# land-the-plate-is-shown-whole.sh  ·  run from the REPO ROOT
#
# Owner, 17 Aug: "The food image... make sure we see the full image instead of
# a crop image of the food"
#
# THIS SCRIPT REPLACES AN EARLIER ONE OF THE SAME NAME. That version also
# carried a fix for the Individual/Family tabs clipping inside the collapsed
# rail. The owner has since asked for that rail to go entirely, so the fix has
# nothing left to fix: it now lives in land-the-sidebar-does-not-move.sh, which
# removes the rail and everything that was propping it up. This script is the
# photograph and nothing else.
#
# MEASURED ON THE LIVE PAGE BEFORE ANYTHING CHANGED:
#     the box .............. 1180 x 420   ratio 2.81
#     the photograph ......... 640 x 360   ratio 1.778
#     on screen ............ 63% of it
# Ten photographs were sampled across the whole range - recipe 3 to recipe
# 11500 - and every one of them is 640 x 360. Not "mostly": all ten, exactly.
# So the box takes the picture's own ratio and there is nothing left to crop.
#
# IT COSTS NO SHARPNESS, and that is worth saying because "show the whole
# image" usually trades something. `cover` scales by the WIDTH in both versions
# - 1180/640 = 1.844x either way - so this shows MORE OF THE SAME PIXELS rather
# than fewer, larger ones. The hero is 664px tall at a 1180px column instead of
# 420, and every one of those pixels was already being drawn.
#
# `aspect-ratio`, NOT A TALLER CLAMP. A pixel height is a second place to keep
# 16/9 true, and the day these photographs are regenerated at another shape a
# ratio is one number to change and a clamp is a crop nobody notices for a
# month. The hero also switches to `object-fit: contain`: pixel-identical today
# because the ratios match, and the thing that keeps the promise if an odd
# picture ever arrives - letterboxed on the paper, never silently cut. The small
# square plates keep `cover`, because a 1:1 card cannot show a 16/9 photograph
# whole and a grid of letterboxed thumbnails is worse than a crop at that size.
#
# Frontend only. One stylesheet and one new guard.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
git log --oneline -40 | grep 'The plate is shown whole' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
R="$W/src/styles/relief.css"
G="$W/src/app/the-plate-is-shown-whole.test.ts"
for f in "$R" "$G"; do [ -f "$f" ] || die "missing $f"; done
grep -q '.press-r-photo { width: 100%; aspect-ratio: 16 / 9;' "$R" || die "the hero still has a fixed height"
grep -q '.press-r-photo img { object-fit: contain; }' "$R"         || die "the hero can still crop"
# The ABSENCE check - no `height: clamp` left on the hero - lives in the vitest
# guard, which strips comments before it looks. A shell grep cannot, and that
# string appears in the paragraph above explaining it.
ok "relief.css carries it"

STRAY="$(git status --porcelain -uall | grep -Ev '(styles/relief\.css|the-plate-is-shown-whole\.test\.ts|land-the-plate-is-shown-whole\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  note "(layout.css, Sidebar.tsx and ui.store.ts belong to land-the-sidebar-does-not-move.sh;"
  note " social.css, main.tsx and relief.spec.ts to land-social-life-has-its-stylesheet-back.sh)"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - gates"
cd "$W"
npx tsc --noEmit || die "tsc"
ok "tsc clean"
npx vitest run src/app/the-plate-is-shown-whole.test.ts || die "the plate guard"
# relief.spec owns this stylesheet and asserts every image is cased; the recipe
# surfaces read the press paper these rules sit on.
npx vitest run src/app/relief.spec.ts src/app/recipe-card-typesetting.test.ts \
               src/app/one-recipes-page.test.ts src/app/one-layout-system.test.ts \
               src/app/citizen-facing-copy.test.ts \
  || die "the material / recipe guards"
ok "the plate guard and its five neighbours pass"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
DEAD="$(node scripts/dead-export-audit.mjs --list 2>&1 | grep -E '^\s+features/' | awk '{print $2}' | sort | tr '\n' ' ')"
[ "$DEAD" = "MedicalAdvisories PlanGuidanceBanner useGemCommission " ] || die "dead exports changed: $DEAD"
ok "lint, nav, a11y, motion, dead-export all at ceiling"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "4 - commit"
git add "$R" "$G" land-the-plate-is-shown-whole.sh
git commit -q -m "The plate is shown whole

Owner: 'the food image - make sure we see the full image instead of a crop image
of the food.'

Measured on the live page before anything changed: the box was 1180x420 and
every recipe photograph is 640x360 - ten sampled from recipe 3 to recipe 11500,
all ten identical. cover scaled to the width and threw the rest away, so 63% of
the dish was on screen and the missing 37% was, on a taco, the taco.

The box now takes the photograph's own ratio and there is nothing left to crop.
IT COSTS NO SHARPNESS: cover scales by the width in both versions, 1180/640 =
1.844x either way, so this shows more of the same pixels rather than fewer
larger ones. aspect-ratio and not a taller clamp, because a pixel height is a
second place to keep 16/9 true and the day these are regenerated at another
shape a ratio is one number to change. The hero also takes object-fit: contain -
pixel-identical today, and what keeps the promise if an odd picture ever
arrives. The square plates keep cover; a 1:1 card cannot show 16/9 whole." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
