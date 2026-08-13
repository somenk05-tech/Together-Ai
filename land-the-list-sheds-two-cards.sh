#!/usr/bin/env bash
# land-the-list-sheds-two-cards.sh  ·  run from the REPO ROOT
#
# The grocery page loses two cards, one owner's call (13 Aug):
#
#   · DELIVERY SCHEDULE. Ordering is not live — the page's own banner says so —
#     and a schedule of drops nobody can order is a promise the app cannot
#     keep. When ordering ships, the schedule comes back as part of it.
#   · SHOPPING SUMMARY (family). Its one fact worth keeping — portions are
#     scaled to each member, not headcount — is said on the printed sheet now,
#     where the list actually is; the tile row restated the plan's own numbers.
#
# The server keeps computing both (deliverySchedule and summary still ride the
# response; summary still powers "This menu is for N people"). This removes
# the CARDS, not the arithmetic.
#
# Verified through the bridge: tsc clean, lint 0, nav/a11y/motion at their
# ceilings.
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
printf '%s\n' "$LOG" | grep 'The list sheds two cards' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The family prints its day' >/dev/null; [ $? -eq 0 ] || die "run land-the-family-prints-its-day.sh first - this lands on top of it"
ok "the sheet is in, this is not"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/features/nutrition/components/GroceryPlanner\.tsx$'
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
ok "packages carry only this change"

say "3 - sha256"
want=c320f68d730880d4516d0e2f2da05169fb48fed308f27437958e72c563d419b2
got="$(shasum -a 256 "$W/src/features/nutrition/components/GroceryPlanner.tsx" | awk '{print $1}')"
[ "$got" = "$want" ] || die "GroceryPlanner.tsx is not the file this script was written against (want $want got $got)"
ok "GroceryPlanner.tsx verified"

say "4 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok tsc            || die tsc
npx vitest run                  && ok vitest         || die vitest
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npm run build                   && ok build          || die build

say "5 - reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "6 - commit"
git add $W/src/features/nutrition/components/GroceryPlanner.tsx land-the-list-sheds-two-cards.sh
git commit -F - <<'MSG'
The list sheds two cards

The grocery page loses its delivery-schedule and shopping-summary cards, and
the reasons differ.

THE DELIVERY SCHEDULE WAS A PROMISE. Ordering is not live - the page's own
coming-soon banner says so, two cards up - and a timetable of drops nobody
can order describes a service that does not exist yet. The scheduling
arithmetic stays in the response (fresh items still know the day they are
cooked); when ordering ships, the schedule returns as part of a thing that
can keep it.

THE SHOPPING SUMMARY RESTATED THE PAGE. Six tiles of numbers the plan and
the sheet already carry, plus the one fact worth keeping - portions scale to
each member, not headcount - which the printed sheet now says where the list
actually is. The family scaling itself is untouched; this removes a card,
not arithmetic.

The sheet moves up the page as a result: range panel, then the list.
MSG

ok committed
say "review, then:  git push"
