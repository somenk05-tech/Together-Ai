#!/usr/bin/env bash
# land-the-dial-stops-at-the-shelf-2.sh  ·  run from the REPO ROOT
#
# Two defects read off the live page on 16 Aug, one measurement doc each:
# "Budget vs what is shown" and "The reorder card". Three fixes, web + one
# engine sentence - no wire change, no migration.
#
# -2 BECAUSE THE FIRST RAN AND DIED AT ITS OWN SCOPE CHECK, correctly and
# too broadly: it swept the WHOLE of both src trees, so another session's
# half-finished chat work (src/messages, src/api, features/chat) aborted a
# beauty change that never goes near those files. This one checks only the
# surfaces it touches - the same scoping every earlier land script uses.
# The chat work is not touched, not added, not judged.
#
# RUN AFTER "A budget is not a month".
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
printf '%s\n' "$LOG" | grep 'The dial stops at the shelf' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A budget is not a month' >/dev/null \
  || die "run land-a-budget-is-not-a-month.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/features/beauty" "$W/src/app/a-routine-counts-down-to-its-next-order.test.ts" "$A/src/beauty" \
  | grep -Ev '(features/beauty/components/(BudgetPanel|NextOrder)\.tsx|features/beauty/pages/Routine\.tsx|app/a-routine-counts-down-to-its-next-order\.test\.ts|beauty/budget-routine\.ts|beauty/the-band-and-the-gate\.spec\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$W/src/features/beauty/components/BudgetPanel.tsx"
  "$W/src/features/beauty/components/NextOrder.tsx"
  "$W/src/features/beauty/pages/Routine.tsx"
  "$W/src/app/a-routine-counts-down-to-its-next-order.test.ts"
  "$A/src/beauty/budget-routine.ts"
  "$A/src/beauty/the-band-and-the-gate.spec.ts"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/beauty/components/BudgetPanel.tsx"            77b8a7e942314560164e2573731119d6b29645aef78c6327f6faf46111355dd3
check "$W/src/features/beauty/components/NextOrder.tsx"              83546228b277f8b69ad60e711463707f0b2c2a75ff414ad4c1442fb399c7eada
check "$W/src/features/beauty/pages/Routine.tsx"                     2e785d6c8e6154a40e86dcac86b6ca77d4374d30ccdedab1584c14996eb3b0f9
check "$W/src/app/a-routine-counts-down-to-its-next-order.test.ts"   e547822a617d51818b5f58bdaea197fbaf221b10c6cd539cf338a79db59a44dd
check "$A/src/beauty/budget-routine.ts"                              612509faa2adedb80893b376572e7842a17e6995f149b65b9c6733851b55906e
check "$A/src/beauty/the-band-and-the-gate.spec.ts"                  0f55a7f899367c0993e4d2b3854016031af9e8979a079ed3a65dc3bb809395bd

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
git add "${FILES[@]}" land-the-dial-stops-at-the-shelf.sh land-the-dial-stops-at-the-shelf-2.sh || die "git add"
git commit -F - <<'MSG' || die commit
The dial stops at the shelf

Two defects read off the live page on 16 Aug, and the same shape both
times: two things individually true, set beside each other by a layout
implying a relationship neither claims. Three fixes.

1. THE DIAL STOPS AT usefulMaxInr. The budget dial ran to Rs 8,000 for a
face whose shelf tops out at Rs 2,215, and said nothing until the money
was already set and a sentence under the routine explained why most of it
was inert. The per-profile ceiling was computed server-side all along -
`usefulMaxInr`, one existing wire field - and it now caps the slider on
the profile's budget panel, with the ceiling said on the track before the
choice rather than under it after. Chips above the cap go; the cap itself
becomes the top chip. A budget ALREADY SAVED above the cap is never
rewritten - the track stretches to hold it and the note says what the
stretch is worth. The typed field still takes any rupee up to the range's
end: someone who types past the cap has read the note and means it. No
cap before the first plan exists, because until a budget has been said
there is nothing honest to cap with.

2. THE REFUSAL SPEAKS IN CLAIMS, NOT QUALITY. "Everything left on the
shelf is a worse match for your profile" overclaimed: matchScore measures
how many stated concerns a product CLAIMS to address, weighted by focus
and skin-type fit - it has no efficacy data in it, and a reader hears
"worse match" as "works less well", which nothing on this shelf can
assert in either direction. The engine's leanReason and the routine
card's ceiling line now say "claims fewer of the concerns you listed",
and the leanReason owns the gap out loud: we don't yet have efficacy
data for this shelf. That is the truth, and it is also the argument for
getting some. The band spec pins the new sentence and refuses the old
one.

THE REFUSAL ITSELF IS UNTOUCHED. Non-inferiority is not relaxed by a
rupee. Buying a worse-covered product to reach 95% utilisation is the
single behaviour this planner exists to prevent, and every version that
did it produced the Rs 2,517 toner.

3. THE COUNTDOWN NAMES ITS ORDER. "19 days till your next order - your
cleanser runs out first" rendered inside a block headed "The whole
routine - 14 products", one card above a step explaining that a cleanser
was deliberately NOT bought. The countdown is a fact about a purchase
already made - reorderDueFor() says so in its own header - and the card
now carries the one clause that breaks the false adjacency: "from your
order of 12 Aug", off `orderedAt`, which has been on the wire for
exactly this sentence since the field was added. The row variant stops
lowercasing the whole sentence while it is at it, because "12 Aug" is
not improved by becoming "12 aug". A new web test ratchets the clause.

NOT DONE HERE, on purpose: the efficacy column (a clinical judgement per
catalogue row, and the real fix for the pigmentation gap), the
treatment-vs-side-claim distinction in coverage, the face/hair cleanser
split, and the kept-step sentence carrying its empty date - the first is
a data decision, the second and third are catalogue-column work that
should ride with it, and the fourth belongs to the owner.

Gates: api tsc and the beauty jest suite; web tsc, the whole vitest
suite, the four audits at their ceilings, and the web build.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push"
