#!/usr/bin/env bash
# land-the-band-is-the-rule.sh  ·  run from the REPO ROOT
#
# 95-105% BUDGET UTILISATION IS THE FIRST RULE - owner's call, 16 Aug,
# reversing the 15-Aug non-inferiority reconciliation. Engine pass 5d, six
# spec rewrites, and the web copy that follows the rule. No wire change,
# no migration.
#
# RUN AFTER "The dial stops at the shelf".
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The band is the rule' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The dial stops at the shelf' >/dev/null \
  || die "run land-the-dial-stops-at-the-shelf-2.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/features/beauty" "$A/src/beauty" \
  | grep -Ev '(features/beauty/pages/Routine\.tsx|features/beauty/components/BudgetPanel\.tsx|beauty/budget-routine\.ts|beauty/the-band-and-the-gate\.spec\.ts|beauty/budget-is-a-limit\.spec\.ts|beauty/budget-is-a-live-input\.spec\.ts|beauty/value-is-not-price\.spec\.ts|beauty/what-you-already-have\.spec\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$A/src/beauty/budget-routine.ts"
  "$A/src/beauty/the-band-and-the-gate.spec.ts"
  "$A/src/beauty/budget-is-a-limit.spec.ts"
  "$A/src/beauty/budget-is-a-live-input.spec.ts"
  "$A/src/beauty/value-is-not-price.spec.ts"
  "$A/src/beauty/what-you-already-have.spec.ts"
  "$W/src/features/beauty/pages/Routine.tsx"
  "$W/src/features/beauty/components/BudgetPanel.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/beauty/budget-routine.ts"                     7645714c193a8f9b48925c46a6f98e039ba211fa911c6f1d336066794cb5188f
check "$A/src/beauty/the-band-and-the-gate.spec.ts"         084c152b066a1dfe9fe60d53fe6c117a7b6baf543a97b1f1bbb79d86a29115de
check "$A/src/beauty/budget-is-a-limit.spec.ts"             2b344053ed62334bacbc47505416e709179173238bc786c141427a23f54291a7
check "$A/src/beauty/budget-is-a-live-input.spec.ts"        14914c8175e851344b2bb56919a733041801270807c83d6cdef0a7daf6327674
check "$A/src/beauty/value-is-not-price.spec.ts"            eba3966ccf8e8ce6c2189102be21501b7d1a6e39156b058529e99d4f5eff5aea
check "$A/src/beauty/what-you-already-have.spec.ts"         a9f9effcdd79d4d1ba28c344171953fb282b485a5ae1c45f08e4e7cf584eb75e
check "$W/src/features/beauty/pages/Routine.tsx"            35bd3f64b4351a9dc75ca5987b49814e56e9945d6281f985afabded6da557749
check "$W/src/features/beauty/components/BudgetPanel.tsx"   fa0cffda16a2d4b2f5cb91649dd890135cfdaf971a67648e3fe3f57161b27993

say "4 - api gates"
cd "$A" || die cd
npx tsc --noEmit          && ok "api tsc"           || die "api tsc"
npx jest src/beauty       && ok "beauty suite"      || die "beauty suite"
cd ..

say "5 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
cd ..

say "6 - commit"
git add "${FILES[@]}" land-the-band-is-the-rule.sh || die "git add"
git commit -F - <<'MSG' || die commit
The band is the rule

95-105% BUDGET UTILISATION IS THE FIRST RULE. Owner's call, 16 Aug,
reversing the 15-Aug position this codebase had been arguing for in three
spec files and a measurement doc: that once the non-inferior shelf ran
out, the honest answer was to stop at Rs 2,215 of an Rs 8,000 budget and
explain the difference. The owner read the three budget cards at 28%, 25%
and 47% and ranked the band above the score. This commit is that ranking
as code.

PASS 5d. After every existing pass has run out, a routine still under
B x 0.95 now climbs: swaps to the dearer products that remain, smallest
match-score loss first, the price that lands nearest the band breaking
ties. Measured on the live profile (oily, blackheads, dark spots,
hyperpigmentation, cleanser owned): face Rs 2,215 -> Rs 7,994 of Rs 8,000
(100%), coverage held 3/3 at every budget, and the routine's total match
score fell 337 -> 279 on the way - the measured price of the rule, taken
with eyes open, at the owner's word.

WHAT THE BAND STILL CANNOT BUY, because utilisation never outranked
safety or relevance: anything unmatched; anything answering none of this
person's needs (money is never parked in an anti-ageing serum for a
profile that never mentioned ageing); a second active the routine already
carries; a product past the half-the-budget share cap; a rupee past
B x 1.05. And no swap may un-cover a need the routine answers -
keepsCoverage holds, so the band spends FIT, never COVERAGE.

THE SENTENCES MOVED WITH THE ARITHMETIC, because a unit lives in the
strings and so does a rule:
- leanReason now fires only when the guarded shelf genuinely runs dry,
  and says that, instead of explaining thrift the engine no longer
  practises.
- The kept-step sentence loses "and we haven't moved the money onto
  something else either" - the band moves it, so the clause came off
  rather than stay and lie.
- The routine card's over-budget line stops crediting "a better match"
  for headroom the band pass now uses to land near the number.
- The shelf-tops-out paragraph and the dial cap retreat to the one case
  they are still true in: a shelf that cannot absorb even 95% of the
  range. Everywhere else the dial's full track is spendable now, which
  is the whole point.

SIX SPECS REWRITTEN, NOT DELETED. Each one that encoded stop-and-explain
now encodes band-or-explained, and each carries the date and the reason
the old assertion left: "does NOT spend the rest" -> "DOES spend, to the
band"; "never buys a worse-matched product" -> "never buys an irrelevant
one, never drops coverage"; "never lowers the routine total" -> "pays in
score, never in coverage"; the undercut rule is scoped to plans still
under their band floor, where price alone is still never a reason; the
freed-money rule inverts, the owned step still never re-bought; and the
remaining-money identity learns that a category may land 5% over. 177
beauty tests green.

Gates: api tsc and the beauty jest suite; web tsc, the whole vitest
suite, the four audits at their ceilings, and the web build.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push"
