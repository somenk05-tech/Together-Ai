#!/bin/bash
# land-the-list-says-who-it-feeds-2.sh  ·  run from the REPO ROOT
#
# ── WHY -2 ───────────────────────────────────────────────────────────────────
# The original assumed "The basket knows its plan" had NOT landed and carried
# its patch inside a three-part commit. It had landed — the owner ran it
# between sessions — so the original refused, correctly, rather than write a
# message claiming another commit's work. Files and hashes are IDENTICAL to
# the original; only the precondition and the commit message changed, both to
# match a tree where the model work is already in.
#
# TWO THINGS LEFT, ONE STORY — the grocery list says who it feeds:
#   1. HOW MANY PEOPLE. An individual list gains "Cooking for N" (1–12,
#      persisted server-side, clamped not trusted); every quantity scales, and
#      the sheet states who the menu is for. Family keeps its calorie-weighted
#      per-member scaling and states its household.
#   2. ON WHAT PAPER. The list prints as the owner's reference sheet — the
#      flat dusty-blue paper, tracked-caps masthead, aisle sections, dotted
#      leaders to right-aligned quantities. Navy ink, not the reference's
#      white: white is 1.95:1 against this sheet's lightest pixel. Ratios in
#      tokens.css, measured against the sheet's WORST pixel like every press
#      paper.
#
# Verified through the bridge: both tscs clean, day-lock.spec 21/21 (jest runs
# in the bridge — no prisma change), API eslint 127 = baseline, web
# lint-ceiling 0, nav/a11y/motion at their ceilings, no chromatic hex and no
# surface literal added to relief.css, tap-target pattern applied to the new
# checkbox. vitest and the two builds cannot run in the bridge; gates below.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] && [ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The list says who it feeds"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"The basket knows its plan"*) ;;
  *) echo "!! Run land-the-basket-knows-its-plan.sh first — this lands on top of it."; exit 1 ;;
esac

# ── the tree carries these twelve paths, and nothing else that matters ───────
ALLOWED='^((M |MM| M) (together-city-chat/src/nutrition/(nutrition\.service\.ts|nutrition\.controller\.ts|day-lock\.spec\.ts)|together-city-react/(src/features/nutrition/(composed\.api\.ts|api\.ts|hooks\.ts|pages/MealPlan\.tsx|components/ShoppingRange\.tsx|components/GroceryPlanner\.tsx)|src/styles/(tokens|relief)\.css))|\?\? together-city-react/public/assets/img/press-grocery\.jpg)$'
PKG='together-city-(chat|react)/'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! The packages carry changes this script did not expect:"
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi

TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  echo "!! Tracked files outside the packages have uncommitted changes:"
  echo "$TRACKED_ELSEWHERE"; exit 1
fi
echo "== the tree is what this script expects"

verify() {
  local want="$1" path="$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || {
    echo "!! $path is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify 42ff253c90950e142cf10cea8394e68b3c62ba7a8892406494640730ca3fa149 together-city-chat/src/nutrition/nutrition.service.ts
verify f1d12acd19ca5fb66e40841db28a09e5855ce812457945fa29f89771f0536659 together-city-chat/src/nutrition/nutrition.controller.ts
verify 8503d5ea4b75a00ab316156a8113cbe848929b3bb80742f1a0111a128409ca44 together-city-chat/src/nutrition/day-lock.spec.ts
verify 39535bb957ac29971acfa7eda5b22f2c3a4485c1dc43bd718608160ee327ddd1 together-city-react/src/features/nutrition/composed.api.ts
verify e6be36151c173e4ae3c134b66edf5cade1ff6bcf881101632448ad26d973afb8 together-city-react/src/features/nutrition/pages/MealPlan.tsx
verify 2e919c9ea8860575eae304bb00c89a9d47808f3e99d4169e20e8a06000b742e9 together-city-react/src/features/nutrition/components/ShoppingRange.tsx
verify c6cf4897ef989e107a74ab39b487c461b934f3a661327391a51566f5afeb3857 together-city-react/src/features/nutrition/components/GroceryPlanner.tsx
verify 3a88b87e9a07b4cd3a1ca8b4cced3fa554d76442d939b533b8edcf9b182bfdb7 together-city-react/src/features/nutrition/api.ts
verify 41bcfc216f96e9ab703e7191e7f54f4bf618ac06f2fc55e8605b374ec9359c79 together-city-react/src/features/nutrition/hooks.ts
verify 5506559272f6cc5ae2ddadcdf01dbf8881fca925de5249b8c614ac0abdb9ce86 together-city-react/src/styles/tokens.css
verify 666791fd42b941f8580a5415ae08c737aad28e4cdde66fc90d192b46c3b6305e together-city-react/src/styles/relief.css
verify fbc87c30ff618dd1775b8fe099a829b98cd2aa4ce30037a651379603c87e49d4 together-city-react/public/assets/img/press-grocery.jpg
echo "== all twelve files verified"

echo "== gates: the API"
cd together-city-chat
npx tsc --noEmit
npx jest src/nutrition src/shared --silent
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || { echo "!! ESLint produced no readable report."; exit 1; }
if [ "$API_LINT" -gt "$API_BASELINE" ]; then
  echo "!! API lint went UP: $API_LINT, main is at $API_BASELINE:"
  npx eslint 'src/nutrition/**/*.ts' || true
  exit 1
fi
echo "   API lint errors: $API_LINT (main: $API_BASELINE). Nothing added."
npm run build
cd ..

echo "== gates: the web app"
cd together-city-react
npx tsc --noEmit
npx vitest run
node scripts/lint-ceiling.mjs
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
echo "== reported, not gated"
node scripts/dead-export-audit.mjs || true
node scripts/paper.mjs || true
cd ..

git add together-city-chat/src/nutrition/nutrition.service.ts \
        together-city-chat/src/nutrition/nutrition.controller.ts \
        together-city-chat/src/nutrition/day-lock.spec.ts \
        together-city-react/src/features/nutrition/composed.api.ts \
        together-city-react/src/features/nutrition/api.ts \
        together-city-react/src/features/nutrition/hooks.ts \
        together-city-react/src/features/nutrition/pages/MealPlan.tsx \
        together-city-react/src/features/nutrition/components/ShoppingRange.tsx \
        together-city-react/src/features/nutrition/components/GroceryPlanner.tsx \
        together-city-react/src/styles/tokens.css \
        together-city-react/src/styles/relief.css \
        together-city-react/public/assets/img/press-grocery.jpg \
        land-the-list-says-who-it-feeds-2.sh

git commit -F - <<'MSG'
The list says who it feeds

Two answers the grocery list still owed, on top of yesterday's "which menu"
(The basket knows its plan): how many PEOPLE it is buying for, and — the
owner's reference art — what it looks like as a thing you would actually
carry into a shop.

── HOW MANY PEOPLE ────────────────────────────────────────────────────────────

An individual plan's grams are one person's portion, and the list said
nothing about it. "Cooking for N" (1–12) now multiplies what is BOUGHT —
never what the planner says one person eats — persists server-side in extras
(clamped, not trusted: it is user-editable JSON like its neighbours), and the
sheet states "This menu is for N people". Family mode ignores the count and
says so: its scale is each member's real calorie-weighted portion, which a
flat headcount would overwrite.

── ON WHAT PAPER ──────────────────────────────────────────────────────────────

The list prints as the owner's blue sheet: flat dusty-blue paper, tracked-caps
masthead, aisle sections in caps, checkbox rows with dotted leaders running to
right-aligned quantities, the small footer. One page taking one paper — the
.food-paper grant shape, no [data-hub] block, the guard's grounded set
untouched.

THE INK FLIPS DARK, AND THAT IS THE ONE DEPARTURE from the reference, which
prints white on this paper: white is 1.95:1 against the sheet's lightest pixel,
and no veil can rescue ink lighter than its ground. Navy, measured against the
sheet's WORST (darkest) pixel — the press papers' own method, worst case for
dark ink being the opposite end: ink 6.47:1, ink-2 4.97:1, ink-3 3.90:1 labels
and metadata only. Colour lives in tokens.css; relief.css gained no hex.

The checkbox paints 17px — the reference's box — and presses 44px, via the
same transparent centred pseudo the tap-target block uses for .btn-sm. The
check-off, the "used in" split, the pantry have/buy note and the manual lines
all survive the redesign; the functional cards above the sheet keep the city's
white.

day-lock.spec grew from 17 to 21: the people count scales, persists, reads
back, clamps, and is ignored by family on purpose.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The list says who it feeds
 Push — Vercel rebuilds the web app, Railway the API.
 Then open Nutrition → Grocery Lists: the blue sheet, with
 "Cooking for N" printed on it.
===============================================================

DONE
