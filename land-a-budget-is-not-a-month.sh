#!/usr/bin/env bash
# land-a-budget-is-not-a-month.sh  ·  run from the REPO ROOT
#
# The purchase-price change landed in the arithmetic on 15 Aug and never
# finished landing in the COPY. Fourteen strings still told the citizen their
# ₹8,000 was a monthly limit. Web only - no engine change.
#
# RUN AFTER "The store opens" (688ee21).
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d together-city-chat ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'A budget is not a month' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The store opens' >/dev/null \
  || die "run land-the-store-opens-2.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/features/beauty" "$W/src/app/budget-is-on-the-page.test.ts" \
  | grep -Ev '(features/beauty/pages/(Routine|Profile)\.tsx|features/beauty/components/BudgetPanel\.tsx|features/beauty/api\.ts|app/budget-is-on-the-page\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$W/src/features/beauty/pages/Routine.tsx"
  "$W/src/features/beauty/components/BudgetPanel.tsx"
  "$W/src/features/beauty/pages/Profile.tsx"
  "$W/src/features/beauty/api.ts"
  "$W/src/app/budget-is-on-the-page.test.ts"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/beauty/pages/Routine.tsx"             c2b97759478481b169602d3b227e08fafc9d9a0aac7d1a5e5f664214f51baa65
check "$W/src/features/beauty/components/BudgetPanel.tsx"    42f3489a9e5861e1ff9bea5a8ffade4059d75ab3c4f0b139756fb253426bc257
check "$W/src/features/beauty/pages/Profile.tsx"             9b4fd8f4217081836c96ac896c06923f0e2910c3613281104a5a9a9bdb679685
check "$W/src/features/beauty/api.ts"                        270639ba5be7928899075712e1d29858d0510f0197d55ab8f6892b43a415a1c1
check "$W/src/app/budget-is-on-the-page.test.ts"             0466fe4b925d2c7577415981d8060f99b7da53f7938a26f2641c917aeb2d97d3

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
cd ..

# No API file changes: the wire is unchanged and the engine already works in
# purchase price. This commit is entirely what the page SAYS about it.

say "5 - commit"
git add "${FILES[@]}" land-a-budget-is-not-a-month.sh || die "git add"
git commit -F - <<'MSG' || die commit
A budget is not a month

Read off the live page, which is the third time this week that is the
sentence. "The budget is the shopping trip" moved the planner onto purchase
prices on 15 Aug. "One unit on the page" then fixed the two strings I could
see on a screenshot. FOURTEEN MORE WERE STILL SAYING "A MONTH", and one of
them was the label directly above the number:

    MONTHLY BUDGET   ₹8,000
    ROUTINE COST     ₹2,215 to buy

Both figures true, the label between them false, and the citizen left to
work out which unit the ₹8,000 was in. Also live: "your ₹24,000/month
budget" in the lede, "/ month" beside the budget dial and beside its total,
"Set your monthly beauty budget first", "Your budget is a monthly limit",
"Set what you're comfortable spending each month", two screen-reader labels,
the Profile blurb, and the "the essentials come to about ₹X/month" sentence
— which was quoting `minimumInr`, a purchase price, in months.

THE WORD CAME OFF RATHER THAN BEING CORRECTED. "Purchase budget" is a
bookkeeping term for a thing nobody experiences as one: a budget on this
page is what you hand over at the counter, and the monthly figure is already
sitting right underneath every price saying what the upkeep is. Two
qualifiers in one line would make the reader do the reconciliation the copy
is there to save them.

/month BESIDE A PRICE STAYS, and this is the distinction the new test
enforces rather than a blanket ban: "₹424 ≈ ₹306/month to keep" is the
honest sentence this hub was built for. Only the word next to "budget" is
refused — `monthly budget`, `monthly limit`, `spending each month`, and
"a month" within forty characters of "budget", in Routine.tsx and
BudgetPanel.tsx.

WHY A RATCHET RATHER THAN A FIX. A unit lives in the strings as much as in
the arithmetic, and I have now shipped this same class of defect three
times: change the number, miss the sentence beside it. The assertion that
used to require the literal 'Monthly budget' is the one that let it through
— it pinned the wrong word and passed all week. It now requires 'Budget',
with the reason recorded in place.

Gates: web tsc, the whole vitest suite, the four audits at their ceilings,
and the web build. No API file touched — the wire and the engine are
unchanged; this is entirely what the page says about them.
MSG
ok "committed"
say "done - now push"
