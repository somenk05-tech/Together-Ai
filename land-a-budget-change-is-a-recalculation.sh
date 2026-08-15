#!/usr/bin/env bash
# land-a-budget-change-is-a-recalculation.sh  ·  run from the REPO ROOT
#
# One spec file, no behaviour. The owner's rule — a budget change re-runs the
# recommendation, holding the profile constant — was true of the engine as
# landed in 'The engine tells the truth' and was nowhere written down as a
# requirement. It is now, in seven assertions, so that the day somebody
# optimises the planner it fails rather than drifts.
set -uo pipefail
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'A budget change is a recalculation' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The engine tells the truth' >/dev/null \
  || die "base commit 'The engine tells the truth' is not here - this spec pins its behaviour"
ok "the base is here, this is not"

say "2 - sha256"
F="$A/src/beauty/budget-is-a-live-input.spec.ts"
[ -f "$F" ] || die "missing: $F"
got="$(shasum -a 256 "$F" | awk '{print $1}')"
[ "$got" = ccf821d09c3d90628ec8ec6b87a5ee0fa7c6b76a720c46aa905277cfe8cbea17 ] \
  && ok "$F" || die "$F is not the reviewed file (sha256 $got)"

say "3 - gates"
cd "$A" || die cd
# A spec-only commit, so the gate that means anything is the spec — and the
# whole beauty suite beside it, since a new file that passes alone and breaks
# its neighbours is the same defect as a failing one.
npx jest src/beauty && ok "beauty suite (14 files, 156 tests)" || die "beauty suite"
npx eslint src/beauty/budget-is-a-live-input.spec.ts && ok "eslint clean" || die eslint
# tsc over the package still fails in fitness/supplements — somebody else's
# uncommitted feature against a client that needs `npx prisma generate`. Read
# rather than obeyed, exactly as the previous commit's script does.
npx tsc --noEmit 2>&1 | grep -v '^src/fitness/supplements/' | grep '^src/' \
  && die "api tsc: errors outside fitness/supplements" || ok "api tsc (beauty clean)"
cd ..

say "4 - commit"
git add "$F" land-a-budget-change-is-a-recalculation.sh || die "git add"
git commit -F - <<'MSG' || die commit
A budget change is a recalculation

Seven assertions, no behaviour. The engine already did this; nothing said it
had to, and an unwritten property is one refactor from being a former one.

THE RULE, in the owner's words: when the citizen changes their budget, the
engine rebuilds the recommended products for that budget while holding
their skin, hair, concerns, goals, preferences, existing products and safety
constraints constant. Three things it must therefore not be — budget → find
products costing that much; recommend → add up → say whether it fits; or a
bigger budget → the same routine with more bolted on.

WHAT EACH ASSERTION IS FOR, because a spec whose reasons live in a commit
message is a spec nobody trusts in a year:

  · The pool is identical at every budget. This is the precondition for the
    rest — if the eligible set moved with the money, "the routine changed"
    would prove nothing, because the profile would have changed underneath
    it. The day somebody passes the budget into recommendProducts to help it
    rank, every other test here starts passing for the wrong reason.
  · A bigger budget REPLACES a step, not only adds one. Measured on the
    mature profile: ₹1,000 buys a Nivea sunscreen, a Kama Ayurveda cleanser
    and Minimalist Retinol 0.3%; ₹2,000 replaces two of those three; ₹4,000
    replaces the retinoid with the Vichy specialist serum, which answers
    more of that person's findings than the one it displaces. A routine that
    can only grow is a shopping list with a budget printed on it.
  · A smaller budget strips in CLINICAL order, not declaration order. ₹300
    keeps cleanse, moisturise, protect and a treatment and loses the toner;
    sunscreen survives every reduction, because it is the one face step with
    no substitute.
  · More money is not an instruction to spend it, asserted across the whole
    top of the range rather than at one pair — "it stops eventually" is not
    the property, "it stops at the right routine and stays there" is.
  · It says why it stopped. The remainder is a sentence on the page, not an
    absence on it.
  · The monthly figure is the routine's, summed after the fact, and the
    ceiling is never crossed to reach anything.
  · Safety holds at every budget. A citizen who raises their budget has not
    consented to two retinoids; one who lowers it has not lost the right to
    a routine that does not fight itself. A budget pass is exactly where a
    guard gets skipped.

WHAT THIS SPEC DOES NOT YET COVER, and it is the honest half of the rule.
The engine can decline to spend more. It cannot yet say what spending more
would BUY — "the extra ₹3,300 is worthwhile because…" needs a benefit model,
and there is no efficacy or evidence field on BeautyProduct to build one
from. Nor does it read the citizen's existing products, so "keep the
cleanser you already have" is not yet something it can say. Both are in the
audit as P1s and neither is asserted here, because a spec that asserts what
the code cannot do is a failing test with a comment on it.

Gates: 14 suites / 156 tests, eslint clean, api tsc clean across src/beauty.
MSG
ok "committed"
say "done - now push"
