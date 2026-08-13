#!/bin/bash
# land-the-month-writes-the-menu.sh  ·  run from the REPO ROOT
#
# The plan stops being a rolling 21-day block and becomes THE CALENDAR MONTH:
# day 0 is the 1st, the plan runs to the month's last day, and on the 1st of
# the next month a new plan is generated under the same principles — fresh
# seed, same profile, same gates, nothing pressed. The planner's day rail
# scrolls the month by date, today first.
#
# Old anchors are MIGRATED, not reset: every day-keyed thing the citizen owns
# (locks and their models, skips, pins, bumps, hand-built days) shifts by the
# calendar distance between anchors, so a locked Friday goes on meaning that
# Friday. Verified through the bridge: both tscs clean, day-lock.spec 23/23,
# eslint clean on every touched file, web ratchets at their ceilings. The full
# jest run, vitest and the two builds are gates below.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] && [ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The month writes the menu"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"The week starts today"*) ;;
  *) echo "!! Run land-the-week-starts-today.sh first — this lands on top of it."; exit 1 ;;
esac

# ── the tree carries these three files, and nothing else that matters ────────
ALLOWED='^(M |MM| M) (together-city-chat/src/nutrition/(nutrition\.service\.ts|day-lock\.spec\.ts)|together-city-react/src/features/nutrition/pages/MealPlan\.tsx)$'
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
verify 53ddb4524dbe41644c16a6d782f1ebb845a76efe3daaf5f76f696903c9f4fe1f together-city-chat/src/nutrition/nutrition.service.ts
verify d9941ba29aa07940bf339ea70facd4bbf1d7b5a10c0f341e73f0e4a00f2c6347 together-city-chat/src/nutrition/day-lock.spec.ts
verify 995709a49f50ce43c910ed08d36736483c3f01abc2e820ffa20d9629b6848858 together-city-react/src/features/nutrition/pages/MealPlan.tsx
echo "== all three files verified"

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
        together-city-chat/src/nutrition/day-lock.spec.ts \
        together-city-react/src/features/nutrition/pages/MealPlan.tsx \
        land-the-month-writes-the-menu.sh

git commit -F - <<'MSG'
The month writes the menu

The plan was a rolling 21-day block anchored to whenever the citizen first
opened the planner, renewed by hand. It is now the CALENDAR MONTH: day 0 is
the 1st, the plan runs to the month's last day, and on the 1st of the next
month a new plan is generated under the same principles — a fresh seed (the
month is folded into it, so September cannot repeat August without anybody
pressing anything), the same profile, the same clinical gates. The review
date is simply the 1st of next month.

THE ANCHOR MOVES, THE DAYS KEEP THEIR DATES. Day indexes are relative to
planStartDate, so moving the anchor silently renames every day an index
points at. reanchorDayKeyedState migrates instead of resetting: locks, their
plan models, skips, pins, bumps, hand-built days and their locks all shift by
the calendar distance between the old anchor and the month's 1st, and
whatever lands outside the month is dropped — on a rollover that is exactly
the days that have already passed. A citizen who locked 13 and 14 August
under the old 25-July anchor still has 13 and 14 August locked under the
1-August one; the spec pins this with the same dates.

The migration runs wherever the anchor is read — composedPlan, ownPlan,
addToOwnPlan — so the first touch of any plan after a rollover moves the
citizen's state before anything composes against it. Renew keeps the month's
anchor (day 0 stays the 1st) and reseeds.

THE RAIL SCROLLS THE MONTH. Today first — that stays from "The week starts
today" — through the month's last day, one scroll by date. The week/two-week
window went with the rolling block: a month plan's horizon is the calendar's,
not a chosen span. The plan window copy names the month and says when the
next plan begins, and the renew button stops promising three weeks.

day-lock.spec grew from 21 to 23: the migration shifts every day-keyed thing
by the calendar distance and drops what has passed, and a first-ever anchor
shifts nothing.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The month writes the menu
 Push — Vercel rebuilds the web app, Railway the API.
 The planner will re-anchor each citizen the first time their
 plan is read; locked days keep their dates.
===============================================================

DONE
