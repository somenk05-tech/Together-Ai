#!/usr/bin/env bash
# land-one-unit-on-the-page.sh  ·  run from the REPO ROOT
#
# Two strings that were still speaking the old unit, found by reading the live
# page after 'The budget is the shopping trip' deployed. No logic.
set -uo pipefail
A=together-city-chat; W=together-city-react
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }
[ -d "$A" ] && [ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
LOG="$(git log --oneline -20)"
printf '%s\n' "$LOG" | grep 'One unit on the page' >/dev/null && die "already landed"
printf '%s\n' "$LOG" | grep 'The budget is the shopping trip' >/dev/null \
  || die "base commit 'The budget is the shopping trip' is not here"
ok "the base is here, this is not"

say "2 - sha256"
check(){ got="$(shasum -a 256 "$1" | awk '{print $1}')"; [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"; }
check "$A/src/beauty/budget-routine.ts"           b19a544b341f82d91391685c1f1933f2fb105620dd89be60cc5bb11bba4809c1
check "$W/src/features/beauty/pages/Routine.tsx"  b66e46d261d6fa5d48f5cecb63ce360f982cdd9a90d21ba902d7b5471c775464

say "3 - gates"
cd "$A" || die cd
npx tsc --noEmit 2>&1 | grep -v '^src/fitness/supplements/' | grep '^src/' \
  && die "api tsc: errors outside fitness/supplements" || ok "api tsc (beauty clean)"
npx jest src/beauty && ok "beauty suite (16 files, 171 tests)" || die "beauty suite"
npx eslint src/beauty/budget-routine.ts && ok "eslint clean" || die eslint
cd ../"$W" || die cd
npx tsc --noEmit && ok "web tsc" || die "web tsc"
npx vitest run src/app/budget-is-on-the-page.test.ts src/app/one-routine.test.ts \
  && ok "the web tests that read this page" || die "web vitest"
npm run build && ok "web build" || die "web build"
cd ..

say "4 - commit"
git add "$A/src/beauty/budget-routine.ts" "$W/src/features/beauty/pages/Routine.tsx" land-one-unit-on-the-page.sh || die "git add"
git commit -F - <<'MSG' || die commit
One unit on the page

Two strings that were still speaking the old unit, found by reading the
live routine after the last commit deployed. No logic changed; both were
saying something untrue about a number beside them.

"YOUR FACE ROUTINE COMES TO ₹2,215/MONTH AGAINST A ₹5,000 BUDGET." It comes
to ₹2,215 to BUY. The lean sentence was written when the planner worked in
amortised monthly cost and kept its "/month" through the change of unit, so
it was printing a purchase price and calling it a monthly one — directly
under a card that had correctly relabelled the same figure "to buy".

AND THE HEADER WAS COMPARING TWO DIFFERENT THINGS. "₹3,535 of ₹21,000 a
month" put the routine's UPKEEP against a budget set in purchase prices, so
a routine that had spent ₹7,165 of ₹21,000 read as having spent ₹3,535 —
seventeen per cent where the three cards beneath it said forty-four,
eighteen and forty-three. It shows what was spent, with the upkeep beside
it rather than in place of it.

Both were mine, both were one commit old, and both were visible on the
first screen of the live page. The unit changed in one place by design —
`cost` in the planner — and these are the two readers that were not
following it.

Gates: api tsc clean across src/beauty, 16 suites / 171 tests, eslint, web
tsc, the two web tests that read this page, and the web build.
MSG
ok "committed"
say "done - now push"
