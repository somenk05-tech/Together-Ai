#!/usr/bin/env bash
# land-the-family-prints-its-day.sh  ·  run from the REPO ROOT
#
# The commit "One sheet, two planners" promised: the printed day moved out of
# MealPlan.tsx into PressDay "because the FAMILY planner has to look the
# same", and its slots were documented with exactly what a household passes —
# then the wiring was deferred to "the next commit", which was never made.
# This is that commit. The family Weekly Planner prints its day on the same
# press sheets as the individual planner.
#
# What rides the slots, as PressDay's own header prescribes:
#   · summary — the five figures WITHOUT target percentages: a household has
#     no single target, and "100% of target" over a family's day would be a
#     number that looks authoritative and means nothing.
#   · action  — the citizen's day locks; the household's builds a list. The
#     grocery button is the sheet's one control.
#   · under   — the per-member portions, printed bare on the sheet (the
#     food-paper lesson: a white card on paper has no edge), because "cooked
#     once, plated to each" is what a family day IS.
# Snacks are one per member, so the sheet prints the SHARED courses and the
# snacks follow it. The old card grid, the sticky side column and its Family
# card fold into the sheet's plates.
#
# Verified through the bridge: tsc clean, lint 0, nav/a11y/motion green, the
# planner-scope household call untouched, no data-press added to any page (the
# wearer guard's list is unchanged — the sheet carries its own grant).
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
printf '%s\n' "$LOG" | grep 'The family prints its day' >/dev/null; [ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Two doors close' >/dev/null; [ $? -eq 0 ] || die "run land-two-doors-close.sh first - this lands on top of it"
ok "the doors are closed, this is not in"

say "2 - scope: strict inside the packages, scratch tolerated outside"
PKG='together-city-(chat|react)/'
ALLOWED_IN='^(M |MM| M) together-city-react/src/features/family/(pages/Weekly\.tsx|components/FamilyPortions\.tsx)$'
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
verify(){
  local want="$1" path="$2" got
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || die "$path is not the file this script was written against (want $want got $got)"
  ok "$(basename "$path") verified"
}
verify fd7eb9d09d0aae8eae50924c828c4270ba6488b59e4f67808f4fe5b6c0ea3ad9 "$W/src/features/family/pages/Weekly.tsx"
verify 68747fe678175fc3dc0dbb8d020b6db673e78956d30270e3ace19fd366b32ece "$W/src/features/family/components/FamilyPortions.tsx"

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
node scripts/paper.mjs || true
cd ..

say "6 - commit"
git add $W/src/features/family/pages/Weekly.tsx \
        $W/src/features/family/components/FamilyPortions.tsx \
        land-the-family-prints-its-day.sh

git commit -F - <<'MSG'
The family prints its day

"One sheet, two planners" moved the printed day into PressDay because the
family planner has to look the same, documented the four slots a household
would pass, and deferred the wiring to "the next commit". Nobody made it.
The family Weekly Planner rendered a white card grid beside the individual
planner's press sheets for six days, and every design change to the sheet
widened the gap.

This is that commit. The family day prints on the same recto every citizen's
does, and what differs rides the slots PressDay prescribed for it:

THE SUMMARY CARRIES NO PERCENTAGES. A citizen has a target and reads the
five figures against it; a household does not have one, and "100% of target"
over a family's day would be a number that looks authoritative and means
nothing. The figures print plain.

THE ACTION BUILDS A LIST. The citizen's day locks; the household's day
shops. The grocery button is the sheet's one control, exactly where the
individual sheet carries its lock.

UNDER THE MENU, THE PLATES. The per-member portions print bare on the sheet
- FamilyPortions gains the same `bare` shell DayShoppingPanel uses, because
a white card on a press paper is the food-paper lesson: its lightest pixel
is white, and the card has no edge. "Cooked once, plated to each" is what a
family day IS, so it prints where the citizen's macro ring does.

Snacks are one per member, tuned to their health need - not the shared
sheet's courses - so the sheet prints the shared courses and the snacks
follow it. The old card grid, the sticky side column and its Family card
fold into the sheet's plates: the household roster and headcount are the
recto's right-hand plate now, opposite About This Menu.

No data-press was added to any page - the sheet carries its own grant, so
the wearer guard's list is exactly as long as it was.
MSG

ok committed
say "review, then:  git push"
