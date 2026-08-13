#!/usr/bin/env bash
# land-one-rail-two-kitchens.sh  ·  run from the REPO ROOT
#
# The family Weekly Planner takes the individual planner's design: the same
# day rail — today first, real dates, TODAY named, one scrollable row with
# chevrons, the month as its horizon. Its old DayTabs said "Sat" thirty-one
# times, wrapped into three rows, and never showed a date; it defaulted to
# day 0, which under the month plan is the 1st — a morning nobody can cook
# again by the second week.
#
# DayTabs.tsx loses its last consumer and is DELETED here (this script runs
# on the Mac; the bridge cannot unlink). The bottom pager stops at today and
# says the date instead of "Day 14 of 31".
#
# Verified through the bridge: tsc clean, lint 0, a11y and motion at their
# ceilings, and planner-scope's guarded `useComposedPlan(mode, 'household')`
# call is untouched.
set -uo pipefail
W=together-city-react

[ -f .git/index.lock ] && [ ! -s .git/index.lock ] && rm -f .git/index.lock && echo "  cleared empty index.lock"
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root (no $W/ here)"

say "1 - precondition"
git fetch -q origin main 2>/dev/null || true
N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
[ "$N" = "0" ] || die "$N local commit(s) not pushed - push or review them before landing on top"
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'One rail, two kitchens' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The door opens on the members' >/dev/null; [ $? -eq 0 ] || die "run land-the-door-opens-on-the-members.sh first - this lands on top of it"
ok "the door is in, this is not"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^((M |MM| M) together-city-react/src/features/family/pages/Weekly\.tsx|(D |DD| D) together-city-react/src/features/nutrition/components/DayTabs\.tsx)$'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED_IN" || true)"
if [ -n "$IN_SCOPE" ]; then
  printf '   \033[31mx\033[0m The packages carry changes this script did not expect:\n'
  echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."
  exit 1
fi

TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  printf '   \033[31mx\033[0m Tracked files outside the packages have uncommitted changes:\n'
  echo "$TRACKED_ELSEWHERE"
  exit 1
fi
ok "packages clean; untracked scratch at root left alone"

say "3 - sha256"
want=2296967bdc497c0d9a42680b9c6b765911a2bedd29e1be2778f5b6c245f7bb49
got="$(shasum -a 256 "$W/src/features/family/pages/Weekly.tsx" | awk '{print $1}')"
[ "$got" = "$want" ] || die "Weekly.tsx is not the file this script was written against (want $want got $got)"
ok "Weekly.tsx verified"

say "4 - DayTabs loses its last consumer, so it goes"
if grep -rln "DayTabs" "$W/src" --include='*.tsx' | grep -v components/DayTabs >/dev/null; then
  die "something still imports DayTabs - it must not be deleted"
fi
if [ -f "$W/src/features/nutrition/components/DayTabs.tsx" ]; then
  git rm -q "$W/src/features/nutrition/components/DayTabs.tsx" || die "git rm failed"
  ok "DayTabs.tsx deleted (staged)"
else
  ok "DayTabs.tsx already gone"
fi

say "5 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "6 - reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "7 - commit"
git add $W/src/features/family/pages/Weekly.tsx land-one-rail-two-kitchens.sh
git commit -F - <<'MSG'
One rail, two kitchens

The family Weekly Planner takes the individual planner's rail: today first,
real dates under real weekday names, TODAY named as such, one scrollable row
with chevrons, the month as its horizon. What it had was DayTabs - weekday
names only, wrapping into three rows, thirty-one chips under a month plan
with "Sat" printed five times and never a date. A calendar with no calendar
in it, and it defaulted to day 0: the 1st of the month, a morning nobody can
cook again by the second week.

The selection defaults to today and cannot reach a past day; the bottom
pager stops at today and says the date rather than "Day 14 of 31", because
an index into the month is a number nobody's kitchen runs on. The rail is
the same markup as the individual planner's on purpose - two planners that
run the same month plan should read as the same calendar. (It is duplicated
rather than extracted because MealPlan.tsx sits hashed in the pending month
landing; extraction is a follow-up once both are in.)

DayTabs.tsx loses its last consumer and is deleted rather than orphaned -
the script refuses to delete it if anything still imports it, and
dead-export-audit would otherwise have carried it forever.

planner-scope's guarded household call is untouched: the page still asks for
the plan the citizens chose, composed under every member's constraints.
MSG

ok committed
say "review, then:  git push"
