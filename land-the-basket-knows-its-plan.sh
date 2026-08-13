#!/bin/bash
# land-the-basket-knows-its-plan.sh  ·  run from the REPO ROOT
#
# Every day has TWO real menus — My Preferences and Optimal Health — and the
# grocery basket only knew how to shop one of them. Locks were stored as bare
# day numbers, and groceryPlan composed with 'preferred' HARDCODED, so a
# citizen who read the Optimal Friday and pressed "Lock menu & add to grocery
# list" bought the Preferences Friday's food — ingredients for dishes they
# never accepted.
#
# Owner's call, 13 Aug: each lock remembers the model that was showing, and the
# basket shops each locked day in exactly that model.
#
# Verified through the bridge before this script was written: tsc clean on BOTH
# packages, day-lock.spec 17/17 (jest runs in the bridge — no prisma change),
# API eslint 127 = baseline, web ratchets all at their ceilings, and the two
# text guards that read MealPlan.tsx as source still match. vitest and the two
# builds cannot run in the bridge (darwin node_modules); they are gates below.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] && [ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The basket knows its plan"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"paper reaches its page"*) ;;
  *) echo "!! Run land-the-paper-reaches-its-page-2.sh first."; exit 1 ;;
esac

# ── the tree carries these six files, and nothing else that matters ──────────
ALLOWED='^(M |MM| M) (together-city-chat/src/nutrition/(nutrition\.service\.ts|nutrition\.controller\.ts|day-lock\.spec\.ts)|together-city-react/src/features/nutrition/(composed\.api\.ts|pages/MealPlan\.tsx|components/ShoppingRange\.tsx))$'
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
verify dda134a23ae9f815b451dac6ead213387112566c23fe1dd6cd9e33eee1b3f6df together-city-chat/src/nutrition/nutrition.service.ts
verify a0d0d464d7b7dded3c6fa3ec773a02cf39ec95fdb85fd724cf0bbc71fd493611 together-city-chat/src/nutrition/nutrition.controller.ts
verify 430eec543f7d47f5029a8b52d9d0ed78a05c4d671dc6896f96ab3bb94bc33779 together-city-chat/src/nutrition/day-lock.spec.ts
verify 39535bb957ac29971acfa7eda5b22f2c3a4485c1dc43bd718608160ee327ddd1 together-city-react/src/features/nutrition/composed.api.ts
verify e6be36151c173e4ae3c134b66edf5cade1ff6bcf881101632448ad26d973afb8 together-city-react/src/features/nutrition/pages/MealPlan.tsx
verify 2e919c9ea8860575eae304bb00c89a9d47808f3e99d4169e20e8a06000b742e9 together-city-react/src/features/nutrition/components/ShoppingRange.tsx
echo "== all six files verified"

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
        together-city-react/src/features/nutrition/pages/MealPlan.tsx \
        together-city-react/src/features/nutrition/components/ShoppingRange.tsx \
        land-the-basket-knows-its-plan.sh

git commit -F - <<'MSG'
The basket knows its plan

Every day has two real menus — My Preferences and Optimal Health — and the
grocery basket only knew how to shop one of them. Locks were bare day numbers,
and groceryPlan composed with 'preferred' hardcoded, so a citizen who read the
Optimal Friday and pressed "Lock menu & add to grocery list" bought the
Preferences Friday's food: ingredients for dishes they never accepted. Nothing
looked broken, which is what made it worth a guard.

THE LOCK REMEMBERS WHICH MENU WAS READ. (Owner's call, 13 Aug — each lock
keeps the model it was made under, per day, rather than one followed plan for
the whole basket: locking Friday from Optimal must not silently re-shop a
Tuesday that was accepted under Preferences.) The web sends the tab that was
showing; extras carry composedLockModes (day → model) beside composedLocks; a
day absent from the map is 'preferred', because every lock predating the field
was made when the basket only shopped that plan.

THE BASKET SHOPS EACH LOCKED DAY IN ITS OWN MODEL. groceryPlan splits the
locked days by recorded model, composes each set in its plan, and merges the
meals into one basket. Days locked from one tab cost exactly one composition,
same as before. The map is user-editable JSON, so it is sanitised like
lockedDays, with a test to hold it there.

THE PANEL SAYS SO, IN WORDS. The Shopping-for chips carry the model of each
locked menu ("· locked · Optimal"), the aria-labels name the plan in full, and
the paragraph under them states the source — every menu from My Preferences,
every menu from Optimal Health, or the split when it is mixed. A locked day
read from the OTHER tab on the planner now says which menu the lock means and
that the basket follows it, because the summary was silently showing food the
citizen did not accept.

day-lock.spec grew from 12 to 17 assertions: the default lock records
'preferred', an optimal lock is remembered, unlocking forgets the entry, the
model map survives rubbish in the blob, and three cases pin the split — mixed
locks compose once per model, an unrecorded model shops My Preferences, and
all-optimal locks never compose the preferences plan.

Verified through the bridge: both tscs, jest 17/17, API lint 127 = baseline,
web ratchets at their ceilings, and the two text guards that read MealPlan.tsx
as source. vitest and both builds ran as gates in this script.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The basket knows its plan
 Push — Vercel rebuilds the web app, Railway the API.
 Then: lock a day from the Optimal Health tab and open
 Grocery — the chip should read "locked · Optimal" and the
 panel should name the plan.
===============================================================

DONE
