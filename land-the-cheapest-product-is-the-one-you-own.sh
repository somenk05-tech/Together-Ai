#!/usr/bin/env bash
# land-the-cheapest-product-is-the-one-you-own.sh  ·  run from the REPO ROOT
#
# The "Current routine" chips, read for the first time. Both rails: the planner
# skips a role the citizen says they have, and the routine card says so.
# No migration — the answer has been stored in the profile blob all along.
#
# RUN AFTER land-a-budget-change-is-a-recalculation.sh: this adds a fifth
# argument to planWithinBudget, and that spec asserts the four-argument
# behaviour it has to keep.
set -uo pipefail
A=together-city-chat
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$A" ] && [ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The cheapest product is the one you already own' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A budget change is a recalculation' >/dev/null \
  || die "run land-a-budget-change-is-a-recalculation.sh first - this changes the signature it pins"
ok "the base is here, this is not"

say "2 - sha256"
FILES=(
  "$A/src/beauty/budget-routine.ts"
  "$A/src/beauty/beauty.service.ts"
  "$A/src/beauty/what-you-already-have.spec.ts"
  "$W/src/features/beauty/api.ts"
  "$W/src/features/beauty/pages/Routine.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/beauty/budget-routine.ts"              bc8f9b7f5bb77d8334a7997733fab27f1e3fbfdd5f8b492333f4e454a189b40c
check "$A/src/beauty/beauty.service.ts"              de30294a3f7010f12676455212beb0a9bff4e1dd3d25cd523612332a0e3c9054
check "$A/src/beauty/what-you-already-have.spec.ts"  682616e1ca8b2f0f7e5eaf328d6a92968871a8e2748bd68d7ffd3f7035f8ffee
check "$W/src/features/beauty/api.ts"                b6e195e5c4ce2e5ab63f69b20b46121adf7282b40b9de196b4abcf1cb1e39ed7
check "$W/src/features/beauty/pages/Routine.tsx"     0eb244ac989c8dde3e758fe38942e3cc0470694c6ac604b3a4bb06624ea65292

say "3 - api gates"
cd "$A" || die cd
npx tsc --noEmit 2>&1 | grep -v '^src/fitness/supplements/' | grep '^src/' \
  && die "api tsc: errors outside fitness/supplements" || ok "api tsc (beauty clean)"
npx jest src/beauty && ok "beauty suite (15 files, 163 tests)" || die "beauty suite"
npx eslint src/beauty/budget-routine.ts src/beauty/beauty.service.ts src/beauty/what-you-already-have.spec.ts \
  && ok "eslint clean on every file this change touches" || die eslint
cd ..

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"      || die "web tsc"
node scripts/lint-ceiling.mjs   && ok lint-ceiling   || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit      || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit     || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling || die motion-ceiling
npx vitest run src/app/one-routine.test.ts src/app/budget-is-on-the-page.test.ts src/app/one-bag.test.ts \
  && ok "the web tests that read this change" || die "web vitest (beauty)"
# The whole suite still fails on Store.tsx unless land-the-store-opens-2.sh has
# landed. Read rather than obeyed, and fatal if it ever names this change.
npx vitest run > /tmp/tc-web-vitest.log 2>&1
if [ $? -eq 0 ]; then ok "web vitest (whole suite)"; else
  grep -q 'features/beauty' /tmp/tc-web-vitest.log && die "web vitest failed in a file this commit touches"
  printf '   \033[33m!\033[0m web vitest fails, and not in anything this commit touches:\n'
  grep -E '^ FAIL' /tmp/tc-web-vitest.log | sed 's/^/     /' | head -4
fi
npm run build && ok "web build" || die "web build"
cd ..

say "5 - commit"
git add "${FILES[@]}" land-the-cheapest-product-is-the-one-you-own.sh || die "git add"
git commit -F - <<'MSG' || die commit
The cheapest product is the one you already own

The profile has asked "Current routine — what you use now" since it was
written. Twelve chips, stored in the same blob as everything else, and NO
READER: `p.routine` appeared in an interface and nowhere else in the hub.

Measured on the shipped planner before this: a citizen who ticked Face
Cleanser, Moisturizer and Sunscreen was handed a cleanser, a moisturiser and
a sunscreen. ₹1,785 a month against three roles they had just told us were
covered, on a page one tap from the form that asked. Now the same profile at
a ₹5,000 face budget goes from ₹1,284/month to ₹589 and names the three
steps it did not buy.

IT IS A CATEGORY, NOT A PRODUCT, AND THAT DECIDES WHAT MAY BE DONE WITH IT.
"Face Cleanser" does not say which one, so nothing here judges whether
theirs suits them. A routine that said "your cleanser is fine" on this
evidence would be inventing the half of the sentence that matters — it is
the keyword-derivation problem with somebody's face on the end of it. So an
owned role is not asserted to be a GOOD choice. It is only not bought again.

AND THE MONEY DOES NOT MOVE. Skipping a step frees cash inside the same
budget, and a planner aimed at B × 0.90 would spend it on a dearer version
of whatever is left — which is the defect the premium pass was removed for,
re-entering by a side door. Every product still in the plan is asserted to
be the same one it would have been anyway, and the saving reaches the
citizen rather than the basket.

THE ROLE IS REMOVED FROM `defs`, not filtered at each pass. Six passes plus
the openRoles, idealInr and upgrades derivations all read `defs`, and a rule
applied in five of eight places is a rule that comes back. `minimumInr`
falls out of that for free: somebody who owns two of the three essentials is
no longer told they need the budget for all three.

EXFOLIATOR IS DELIBERATELY UNMAPPED, and the spec pins that. There is no
exfoliating role in this planner; the nearest thing is the weekly mask, and
quietly reading one as the other would tell somebody their mask step is
covered because they own an acid. A chip with nowhere honest to go maps
nowhere.

The step is NAMED rather than silently dropped — "You told us you already
have a cleanser, so we haven't bought you another — and we haven't moved the
money onto something else either." A step that simply vanishes is
indistinguishable from one we forgot, and it appears above `leftOut` because
the citizen's own answer comes before our declining. One role, one sentence:
a kept role never also appears as left out.

WHAT THIS STILL CANNOT DO. It cannot tell them their cleanser is wrong for
their skin, because it does not know which cleanser it is; and it cannot see
that product's actives, so the overlap rule is blind to whatever is already
on their shelf. Both need product-level input rather than a category chip.
Neither is claimed here.

Gates: api tsc clean across src/beauty, 15 suites / 163 tests, eslint clean
on all three touched API files, web tsc, the four web audits, the three web
tests that read this change, and the web build.
MSG
ok "committed"
say "done - now push"
