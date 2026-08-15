#!/usr/bin/env bash
# land-the-budget-is-the-shopping-trip.sh  ·  run from the REPO ROOT
#
# SUPERSEDES land-the-cheapest-product-is-the-one-you-own.sh, which never ran.
# That change is folded in here: it touched the same planner, and three further
# owner decisions on 15 Aug landed on top of it before it could be committed.
#   · the "what you use now" chips are read
#   · the budget is a ±5% band, climbed only through non-inferior products
#   · the budget is denominated in purchase price, not amortised monthly cost
#   · every dose re-anchored to the one figure that was ever derived
#   · "all skin types" stops meaning "and sensitive skin too"
#   · a category budget is capped at ₹8,000, down from ₹60,000
set -uo pipefail
A=together-city-chat
W=together-city-react
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }
[ -d "$A" ] && [ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The budget is the shopping trip' >/dev/null && die "already landed"
printf '%s\n' "$LOG" | grep 'A budget change is a recalculation' >/dev/null \
  || die "base commit 'A budget change is a recalculation' is not here"
ok "the base is here, this is not"

say "2 - sha256"
FILES=(
  "$A/src/beauty/budget-routine.ts" "$A/src/beauty/beauty-engine.ts"
  "$A/src/beauty/beauty-catalog.ts" "$A/src/beauty/monthly-cost.ts"
  "$A/src/beauty/beauty.service.ts" "$A/scripts/gen-beauty-catalog.mjs"
  "$A/src/beauty/beauty.controller.ts"
  "$A/src/beauty/value-is-not-price.spec.ts" "$A/src/beauty/safety-reaches-selection.spec.ts"
  "$W/src/features/beauty/components/BudgetPanel.tsx"
  "$A/src/beauty/what-you-already-have.spec.ts" "$A/src/beauty/the-band-and-the-gate.spec.ts"
  "$A/src/beauty/budget-is-a-limit.spec.ts" "$A/src/beauty/budget-is-a-live-input.spec.ts"
  "$W/src/features/beauty/api.ts" "$W/src/features/beauty/pages/Routine.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){ got="$(shasum -a 256 "$1" | awk '{print $1}')"; [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"; }
check "$A/src/beauty/budget-routine.ts"                 e4fcc1e25ad03fafd959f6a1d053254ef499ef1d2e98e178f6ac118abb8e957f
check "$A/src/beauty/beauty-engine.ts"                  77c1b48fe9ddd86c33440574ef83f3d73fbf8a27a045098d0c1c51746d00924b
check "$A/src/beauty/beauty-catalog.ts"                 75f1e10b49b56ef2aa478b38392cf39abe14a5f8e08b1b0fafde7419180ce996
check "$A/src/beauty/monthly-cost.ts"                   111fd9c5fd33abcd636cb5eae32d43a60d89b332130e85cd9241260e266da25e
check "$A/src/beauty/beauty.service.ts"                 de30294a3f7010f12676455212beb0a9bff4e1dd3d25cd523612332a0e3c9054
check "$A/scripts/gen-beauty-catalog.mjs"               f090c4cad49dcff250f8999202351200d551f48154f243dda10260cebf109c68
check "$A/src/beauty/what-you-already-have.spec.ts"     682616e1ca8b2f0f7e5eaf328d6a92968871a8e2748bd68d7ffd3f7035f8ffee
check "$A/src/beauty/the-band-and-the-gate.spec.ts"     d60273f934b9537afce256627c7d47f40c90c42ce4823a434eaeb8a3a402e419
check "$A/src/beauty/beauty.controller.ts"              60add911abaf1b294d3674201eba3339e39405c27f766649fb001cda28bb88e8
check "$A/src/beauty/value-is-not-price.spec.ts"        e232dd16d5f1b1d1a3115faad48487da0a14249bb07a04c51505d722932d738c
check "$A/src/beauty/safety-reaches-selection.spec.ts"  699e7de01e934190b05d2c9fed2333fd642db44e7148c679ae59496a4bbc86d5
check "$W/src/features/beauty/components/BudgetPanel.tsx" 7d953b168093335e772131b52fe9c09dffafae18cda88f01456d48e9a2ae7eb2
check "$A/src/beauty/budget-is-a-limit.spec.ts"         9c139fb7bffc90ec14593e4d0bd45f2ae5f5ce29bcb26b302d89c4494e60a8ee
check "$A/src/beauty/budget-is-a-live-input.spec.ts"    7f1d9afb21ba22898acf8f8c216783314097434bbba9152ff2a7f8683d17fa72
check "$W/src/features/beauty/api.ts"                   505df848143edcbbdd697f42617fcdb4e5677f11af7f79d0380d62493c3d852a
check "$W/src/features/beauty/pages/Routine.tsx"        d17fa6f4b155b6dbd96f62b4f1be00db1df162755e2052b283a656fa9fc4845e

say "3 - api gates"
cd "$A" || die cd
npx tsc --noEmit 2>&1 | grep -v '^src/fitness/supplements/' | grep '^src/' \
  && die "api tsc: errors outside fitness/supplements" || ok "api tsc (beauty clean)"
npx jest src/beauty && ok "beauty suite (16 files, 171 tests)" || die "beauty suite"
npx eslint src/beauty/budget-routine.ts src/beauty/beauty-engine.ts src/beauty/beauty-catalog.ts \
           src/beauty/monthly-cost.ts src/beauty/beauty.service.ts scripts/gen-beauty-catalog.mjs \
           src/beauty/what-you-already-have.spec.ts src/beauty/the-band-and-the-gate.spec.ts \
           src/beauty/budget-is-a-limit.spec.ts src/beauty/budget-is-a-live-input.spec.ts \
           src/beauty/beauty.controller.ts src/beauty/value-is-not-price.spec.ts \
           src/beauty/safety-reaches-selection.spec.ts \
  && ok "eslint clean on every file this change touches" || die eslint
NEW="$(node scripts/gen-beauty-catalog.mjs --sheet scripts/beauty-sheet.json | grep -o 'new [0-9]*' | awk '{print $2}')"
[ "$NEW" = "0" ] && ok "the generator still adds nothing" || die "generator would add $NEW products"
npx nest build > /tmp/tc-nest.log 2>&1 && ok "nest build" || {
  grep -qE 'src/(beauty|shared)' /tmp/tc-nest.log && { grep -E '^src/' /tmp/tc-nest.log | head; die "nest build failed in a file this commit touches"; }
  printf '   \033[33m!\033[0m nest build still fails in fitness/supplements only — (cd %s && npx prisma generate)\n' "$A"
  npx tsc -p tsconfig.build.json --outDir /tmp/tc-b 2>&1 | grep -vE '^src/fitness/supplements/' | grep '^src/' \
    && die "api build: errors outside fitness/supplements" || ok "api build (beauty compiles clean)"; }
cd ..

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"      || die "web tsc"
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npx vitest run src/app/one-routine.test.ts src/app/budget-is-on-the-page.test.ts src/app/one-bag.test.ts \
               src/app/a-routine-counts-down-to-its-next-order.test.ts \
  && ok "the web tests that read this change" || die "web vitest (beauty)"
npx vitest run > /tmp/tc-web.log 2>&1
if [ $? -eq 0 ]; then ok "web vitest (whole suite)"; else
  grep -q 'features/beauty' /tmp/tc-web.log && die "web vitest failed in a file this commit touches"
  printf '   \033[33m!\033[0m web vitest fails, and not in anything this commit touches:\n'
  grep -E '^ FAIL' /tmp/tc-web.log | sed 's/^/     /' | head -4; fi
npm run build && ok "web build" || die "web build"
cd ..

say "5 - commit"
git add "${FILES[@]}" land-the-budget-is-the-shopping-trip.sh || die "git add"
git commit -F - <<'MSG' || die commit
The budget is the shopping trip

Four owner decisions on 15 Aug, and one of them reverses something this
planner has done since it was written. Folded together because they all
move the same arithmetic and splitting them would have meant landing a
number nobody believes twice.

THE BUDGET IS DENOMINATED IN PURCHASE PRICE. It was the amortised monthly
cost, and the argument for that was good — a ₹3,200 cleanser lasting four
months and a ₹800 serum lasting three weeks are not a ₹4,000 problem. But it
is not what the citizen is setting. Somebody who moves a slider to ₹5,000 is
saying what they will hand over, and answering with a basket costing ₹1,400
because the rest is "already paid for in future months" is arithmetic they
never agreed to. The monthly figure stays on the page, under the price,
where it still says a big jar is better value than a small one — it just
decides nothing now. One line: every pass in the planner goes through
`cost`, so which unit the plan is built in is a single reversible decision.

THE BAND IS ±5%, AND THE CANDIDATE SET IS WHAT MAKES IT SAFE. B × 0.95 to
B × 1.05, replacing a 0.90 floor. The objection it survived is worth keeping:
climbing an oily/acne profile toward ₹4,750 by taking the cheapest dearer
option each time reached ₹1,425 after twelve swaps and answered FEWER of her
findings — 14 down to 13, match score 427 to 412. Every cheap step up was a
worse product, and the dearest routine of any kind answers ten of fourteen.
So the band is enforced over the NON-INFERIOR shelf: a swap may only be to a
product that answers at least as many of this person's findings and matches
at least as well as the one it replaces. Measured across three profiles,
ten of thirteen budgets at or below what the shelf can absorb now land
inside the band, and no step is ever worse matched than it was.

AND IT STOPS AT WHAT THE SHELF CAN HONESTLY ABSORB. `usefulMaxInr` is the
dearest routine in which every step is still non-inferior — ₹7,144 of face
products for that profile, against ₹17,473 for the dearest routine of any
kind, which answers ten of her findings instead of fourteen. Money can buy
more than this number; it cannot buy a better match than it, and a match is
the only thing a budget is set in order to get. The routine card prints it
when the citizen has set more.

THE DOSES WERE WRONG, AND ₹47 IS WHAT WRONG LOOKED LIKE. A moisturiser was
costed at 24 ml a month — 0.4 ml morning and night, a pea for a whole face,
which is under-application rather than use — so a 190 ml Biotique jar
"lasted" eight months and reported ₹47 a month. Nobody recognises that as a
price. Every figure is now stated against the one number in that file that
was ever derived: 36 ml of sunscreen a month, two finger-lengths a day.
Moisturiser 24 → 45, cleanser 60 → 90, body lotion 200 → 360. Products
reading under ₹100 a month fell from 31 to 20. The toner figure is left
alone and said to be wrong in both directions: a hydrating toner and a 2%
BHA exfoliant cannot share a number, and the fix is a per-product dose on
the sheet rather than a cleverer average.

"ALL SKIN TYPES" IS NOT A CLAIM ABOUT SENSITIVE SKIN. It is a claim about
the oily-to-dry scale — this will not be too rich for you or too stripping.
Reactivity is a different axis, and a formula that has said nothing about it
has not said it is fine. 76 of 132 face products declared `all`; a citizen
with sensitive skin reached 91 of them and only FIFTEEN named her, seven
carried a retinoid, and that is how a reactive face was offered two of them
in one routine. `all` now covers the four base types and stops. She reaches
36 products, every one named in the vendor's own Skin/Hair Type column, six
to eight per essential role, two carrying a retinoid where the load cap
admits at most one. Twenty-one catalogue rows regained a `sensitive` the
generator had thrown away: its "all skin types" short-circuit ran before
anything else, so "All skin types, including sensitive" — thirty-one rows —
came out as `['all']` with the word that mattered discarded. The ordering is
fixed in the generator too, so the next sheet does not lose it again.

AND THE CHIPS ARE READ. "Current routine — what you use now" has been asked
since the profile page was written, stored, and never read: a citizen who
ticked Face Cleanser, Moisturizer and Sunscreen was handed all three again.
It is a category and not a product, so nothing judges whether theirs suits
them — the role is simply not bought a second time, and the freed money does
not move onto something else, which is asserted rather than hoped. Exfoliator
maps to nothing on purpose: there is no exfoliating role here, and reading it
as the weekly mask would tell somebody their mask step is covered because
they own an acid.

Three assertions moved with the unit and none with the rule: the short-budget
example (₹300 was a month, it is now one sunscreen), the big-pack example (a
300 ml body wash is one month at the corrected dose, so the example is 750),
and what-is-left (measured against spend, not upkeep). Each says so beside
itself.

Gates: api tsc clean across src/beauty, 16 suites / 171 tests, eslint clean
on all ten touched API files, web tsc, four web audits, the four web tests
that read this change, and the web build. nest build still fails only in
fitness/supplements, where prisma/schema.prisma has SupplementBag and
SupplementOrder and the generated client does not.

AND THE DIAL IS CAPPED AT ₹8,000 A CATEGORY, down from ₹60,000. A slider is
a claim about the range of sensible answers, and ₹60,000 for a face was not
one: the dearest routine this shelf can build without taking a worse-matched
product tops out at ₹7,144, ₹8,484 and ₹6,722 across three measured
profiles, and hair at under ₹1,000. Everything above that was a number the
citizen could set and the engine could never honestly spend — which is how a
₹17,600 hair budget came to sit on the routine page beside a ₹1,105 hair
routine and read as a failure of the engine rather than of the control.

A FLAT NUMBER RATHER THAN THE PER-PROFILE MAXIMUM, which is the owner's call
and the better one. `usefulMaxInr` is computed per person and printed on the
routine, but a slider whose end moves when you change your skin type is a
control nobody can learn, and it would leak the shelf's shape into a form
filled in before anything has been priced. ₹8,000 sits above every useful
maximum measured and below the absurd. A stored budget above it is clamped
on read rather than migrated: somebody who set ₹17,600 for hair sees ₹8,000
and the same routine they were already getting.

The tiers the six budget tests run at came down with it — ₹500 to ₹8,000
instead of ₹1,000 to ₹60,000 — and the cap found two things on the way:

  · "never exceeds ₹N" was comparing the UPKEEP figure against the budget,
    a leftover from the unit switch that passed while budgets were large.
  · It was also asserting against B rather than B × 1.05. The 5% headroom
    has been the real limit since `overInr` was written, but it was
    theoretical while the planner aimed under the budget. The band aims AT
    it, so a ₹1,000 face lands at ₹1,022 — the shelf has nothing at exactly
    ₹1,000 and ₹1,022 is nearer than ₹958. That is the feature; crossing
    B × 1.05 is what must never happen, and that is what it says now.

STILL NOT DONE: nothing tells the citizen, at the dial, what their own
profile can absorb — the routine says it afterwards. That needs a route the
panel can ask before a budget exists.
MSG
ok "committed"
say "done - now push"
