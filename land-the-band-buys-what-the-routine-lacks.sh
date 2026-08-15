#!/usr/bin/env bash
# land-the-band-buys-what-the-routine-lacks.sh  ·  run from the REPO ROOT
#
# The band pass compared BREADTH OF CLAIMS PER PRODUCT, so a cheap generalist
# permanently locked out a specialist and the citizen's ₹8,000 bought ₹2,215.
# Now the test is the ROUTINE's coverage, not the product's.
#
# RUN AFTER "A step goes where the product works" (6c454a9).
set -uo pipefail
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$A" ] && [ -d together-city-react ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The band buys what the routine lacks' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A step goes where the product works' >/dev/null \
  || die "run land-a-step-goes-where-the-product-works.sh first"
ok "the base is here, this is not"

say "2 - sha256"
FILES=(
  "$A/src/beauty/budget-routine.ts"
  "$A/src/beauty/the-band-and-the-gate.spec.ts"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/beauty/budget-routine.ts"              cfb4a2dab0841e7cfa33429e7b88e67881055867fd144204edad7999f5a6d08a
check "$A/src/beauty/the-band-and-the-gate.spec.ts"  b86d9cad150288d7539c2f5a19ae8241a963b75c6e066aa4b206271591dd7621

say "3 - api gates"
cd "$A" || die cd
npx tsc --noEmit 2>&1 | grep -v '^src/fitness/supplements/' | grep '^src/' \
  && die "api tsc: errors outside fitness/supplements" || ok "api tsc (beauty clean)"
npx jest src/beauty && ok "beauty suite (16 files, 177 tests)" || die "beauty suite"
npx eslint src/beauty/budget-routine.ts src/beauty/the-band-and-the-gate.spec.ts \
  && ok "eslint clean on both touched files" || die eslint
cd ..

# No web file changes in this commit. The wire shape is unchanged - usefulMaxInr
# is still a number - so the web gates have nothing here to read.

say "4 - commit"
git add "${FILES[@]}" land-the-band-buys-what-the-routine-lacks.sh || die "git add"
git commit -F - <<'MSG' || die commit
The band buys what the routine lacks

Reported from the live page: a ₹8,000 face budget bought ₹2,215 of product.
Not a rounding error - a quarter of the money, and the ±5% band that was
supposed to be a non-negotiable acceptance criterion silently not holding.

THE GATE WAS COUNTING THE WRONG THING. Pass 5c only accepted a dearer
product if `answers(cand) >= answers(pick.product)` - the number of the
citizen's findings THAT ONE PRODUCT claims. So a Re'equil sunscreen tagged
[acne, oil, pigmentation] set a bar of three, and Eucerin Thiamidol - an
actual pigmentation treatment, tagged [pigmentation] because that is what it
does - could never clear it. Measured: on an oily/pigmentation profile the
planner stopped at ₹4,245 of ₹8,000, and every rejected candidate was a
specialist rejected for being a specialist. Breadth of claims is a property
of the LABEL. Rewarding it is rewarding marketing copy.

WHAT REPLACES IT IS THE ROUTINE'S COVERAGE. A swap is allowed when every
need the routine covered before is still covered after (`keepsCoverage`,
counted across all picks with the candidate substituted in place), and the
candidate is at least as well matched as the product it displaces
(`routineNoWorse`). The unit of the promise is the routine, because the
routine is what the citizen wears. One product may narrow as long as the
whole does not.

BOTH RAILS ARE NEEDED AND THE FIRST CUT PROVED IT. Coverage alone let the
total match score FALL as the budget rose - dearer, broader-covering, worse.
`routineNoWorse` is the second rail, and the spec now pins the property
directly: the routine total never decreases on the way up.

MEASURED, AFTER: sensitive at ₹1,000/2,000/3,000/5,000/8,000 spends 101%,
101%, 100%, 96%, 97% of budget, routine score 169 -> 428. Dry/mature: 105%,
97%, 96%, 81%, 87%, score 235 -> 358.

AND THE CEILING CARD WAS LYING TOO. `usefulMaxInr` still summed the dearest
non-inferior product per role - the rule the band pass no longer uses - so
the page said "this shelf tops out at ₹7,144" over a routine the planner
stopped building at ₹4,444. It now asks the planner itself, run at
BUDGET_MAX with a `measuringCeiling` flag that stops the recursion. A
ceiling nobody can reach is a second wrong number next to the first. The old
per-role function is deleted rather than left to rot beside its replacement.

WHAT THIS STILL CANNOT DO, and the third assertion says so in place: a
specialist still cannot DISPLACE a generalist, only outbid one at equal
score, because `matchScore` itself has a coverage term - so breadth is
rewarded twice and this only removes one of them. On oily/pigmentation the
planner therefore still plateaus at ₹4,444 (56% of ₹8,000) rather than
reaching the band. Fixing that needs an efficacy field on the catalogue -
how well a product does the thing, separate from how many things it names -
which no column of the owner's sheet currently carries. Not claimed here.

Gates: api tsc clean across src/beauty, 16 suites / 177 tests, eslint clean
on both touched files. No web file changes; the wire shape is unchanged.
MSG
ok "committed"
say "done - now push"
