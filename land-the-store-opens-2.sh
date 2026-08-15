#!/usr/bin/env bash
# land-the-store-opens-2.sh  ·  run from the REPO ROOT
#
# SUPERSEDES land-the-store-opens.sh, which never ran. That script shipped a
# store whose every "buy" left for Tata 1mg. The owner: "create a Together City
# supplements cart, don't divert users to external links." So the store never
# exists in that state at all - the till ships with the shelf, in one commit.
#
# ONE COMMIT, BOTH PACKAGES, and that is forced rather than chosen:
# security/route-reach.spec.ts fails an API route the web app never calls, and
# it is right to. A checkout nothing has ever called is a checkout nobody has
# verified.
set -uo pipefail
A=together-city-chat
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$A" ] && [ -d "$W" ] || die "run me from the repo root"

say "0 - superseding"
rm -f land-the-store-opens.sh && ok "removed land-the-store-opens.sh (never ran, and it linked out)"
rm -rf _claude_scratch && ok "removed the scratch directory"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The store opens' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The shelf keeps the refusals' >/dev/null
[ $? -eq 0 ] || die "base commit 'The shelf keeps the refusals' is not here - run land-the-shelf.sh first"
ok "the base is here, this is not"

say "2 - scope"
# Files named rather than directories: another session is working in
# src/messages/, src/api/chat.api.ts, src/api/schemas.ts and src/features/chat/.
STRAY="$(git status --porcelain -- \
    "$A/prisma" "$A/src/fitness/" \
    "$W/src/api/store.api.ts" "$W/src/features/fitness/" \
    "$W/src/app/router.tsx" "$W/src/config/hubs.ts" "$A/src/privacy/purge-plan.ts" \
  | grep -Ev '(prisma/schema\.prisma|prisma/migrations/20260815223000_a_till_for_the_shelf/|src/fitness/dto/supplements\.dto\.ts|src/fitness/supplements/(products|supplements\.(bag|service|spec))\.ts|src/fitness/fitness\.(controller|module)\.ts|src/api/store\.api\.ts|src/features/fitness/pages/(Store|Supplements)\.tsx|src/app/router\.tsx|src/config/hubs\.ts|src/privacy/purge-plan\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/prisma/schema.prisma"                                                       91b32449208c673fa7b563b7253c5372b184db7d1e67b11de68b009ce7645714
check "$A/prisma/migrations/20260815223000_a_till_for_the_shelf/migration.sql"        25c243f165da9f9e7e3bbcc3510e238a7955678489f19658d80c5ae21ed79f4e
check "$A/src/fitness/dto/supplements.dto.ts"                                         b7bcfffe72ddb19aac07ee879f5c8a0db4524a8f8a4db3768485499461d4039b
check "$A/src/fitness/supplements/products.ts"                                        6878cc7cb49d20dbaad824a670af2d95052d3ee5a6f1204faa09f5481846e6ea
check "$A/src/fitness/supplements/supplements.bag.ts"                                 9d898a72f631a0b506bf27ca31d7cd97a38391cdf6907379ed4d705debc3f18e
check "$A/src/fitness/supplements/supplements.service.ts"                             f3e79723a42d89c1dddf3c5375cafe92a850e97600844df3763e7dd9c4c0f094
check "$A/src/fitness/supplements/supplements.spec.ts"                                2b4f2682e68f2d45beb00b4377608c3fbb36d2c17aca32588121993b2671407b
check "$A/src/fitness/fitness.controller.ts"                                          f8e0e4a23f3e2e2d81e13299b85484c3240dc44eca5f09810b83b0d1727ffbc9
check "$A/src/fitness/fitness.module.ts"                                              1c3867756de8fb715c103aa446e961a8c887c0146f1d176eea45a115caa51862
check "$W/src/api/store.api.ts"                                                       81a43ae4c923b2ebe18bda67a6a0550eae450f1488aa7fb4af8a7c409c0a384b
check "$W/src/features/fitness/pages/Store.tsx"                                       40378fe7dd77128dafc4f2a90dbb23af7501c00329fee9acd4697d9040dad95e
check "$W/src/features/fitness/pages/Supplements.tsx"                                 f97847080af37d3d32ce111af4b063e274be9e3781f9171cd2731391c88a3d18
check "$W/src/app/router.tsx"                                                         d96ee9c8e2a24ac257d611e0bc2e9e78e915a1f4c00950615b6080fcba97d944
check "$W/src/config/hubs.ts"                                                         a29d7e3181a747ef1e4dad282d71d0d917e89bb2f550d769adea5eea246cc63d
check "$A/src/privacy/purge-plan.ts"                                                  55397a9dfda14a0d0d92232aafcdaa888610877fa4b7429c14a47d90f7876fee

say "4 - api gates"
cd "$A" || die cd
npx prisma validate  && ok "prisma validate" || die "prisma validate"
npx prisma generate  && ok "prisma generate" || die "prisma generate - the two new models are why this must run before tsc"
npx tsc --noEmit     && ok "api tsc"         || die "api tsc"
# THE SECURITY SPECS ARE NAMED RATHER THAN THE DIRECTORY, and the omission is
# declared rather than hidden: query-scoping.spec.ts and runtime-isolation.spec.ts
# are RED ON MAIN ALREADY, from the daybook landings, which gated on
# `src/fitness src/mira src/privacy src/daybook` and never ran src/security.
# Neither failure is in this hub and neither is fixed here. The four named below
# are the ones this commit is answerable to - route-reach because it is what
# forces the API and the web into one commit, and wallet-pricing because this
# commit starts taking money.
npx jest src/fitness src/mira src/privacy src/medical \
         src/security/route-reach.spec.ts src/security/wallet-pricing.spec.ts \
         src/security/transaction-safety.spec.ts src/security/route-exposure.spec.ts \
         --silent && ok "api jest" || die "api jest"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build        && ok "api build"       || die "api build"
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
git add "$A/prisma/schema.prisma" \
        "$A/prisma/migrations/20260815223000_a_till_for_the_shelf" \
        "$A/src/fitness/dto/supplements.dto.ts" \
        "$A/src/fitness/supplements/products.ts" \
        "$A/src/fitness/supplements/supplements.bag.ts" \
        "$A/src/fitness/supplements/supplements.service.ts" \
        "$A/src/fitness/supplements/supplements.spec.ts" \
        "$A/src/fitness/fitness.controller.ts" \
        "$A/src/fitness/fitness.module.ts" \
        "$W/src/api/store.api.ts" \
        "$W/src/features/fitness/pages/Store.tsx" \
        "$W/src/features/fitness/pages/Supplements.tsx" \
        "$W/src/app/router.tsx" \
        "$W/src/config/hubs.ts" \
        "$A/src/privacy/purge-plan.ts" \
        land-the-store-opens-2.sh || die "git add"
git commit -F - <<'MSG' || die commit
The store opens

Fitness 09, with its own till. The owner, 15 Aug: a Together City cart, and
no links out.

THE DELETION PLAN HAD TO MOVE WITH IT, and purge-plan.spec.ts said so
rather than anybody noticing: two new models carrying a citizen's id, and
no line anywhere saying whether deleting an account destroys them. Both
purge. A basket somebody never checked out is still a statement about their
body, and a history of which supplements they buy is a health record in
everything but name.

THE VERSION THAT NEVER SHIPPED sent every "buy" to Tata 1mg, and argued for
it: this city takes no cut, so it cannot be tempted to soften a refusal. The
argument was sound and the conclusion was somebody else's shop. The
temptation is real, so it is answered with a test instead of with an
absence - wallet-pricing.spec.ts, route-reach.spec.ts, and a check that the
plan and the shelf resolve to the same knowledge base. A city that will not
sell you anything is not more honest than one that will. It is just smaller.

THE CLIENT SAYS WHAT IT WANTS AND THE SERVER SAYS WHAT IT COSTS. Every price
is read off products.ts; the request carries an id and a quantity and there
is nowhere in the schema for a price to arrive. POST /beauty/orders once
summed `priceInr` out of the request body - a 1,690-rupee retinal named at 1
rupee would have been charged 1 rupee and written an order that looked
entirely normal afterwards. That schema still accepts the field and ignores
it; this one never accepted it, which is the stronger of the two.

THIRTY-EIGHT OF THE FORTY-THREE CAN BE BOUGHT. Two are prescription-only in
India and have no Add button at all - their card points at Medicines, which
is an internal door, because a licensed drug does not belong in a basket
beside a tub of whey. Three have no single recorded price: the review found
a range or no stock, and the middle of a range is a number nobody published.
They keep their card and their evidence and say plainly that this city will
not sell them.

TWELVE SIT UNDER SUPPLEMENTS THIS CITY'S OWN REVIEW REFUSES, and they are
buyable. Hiding them does not stop the purchase - it moves it somewhere that
never showed anybody the 78 trials and 715,526 participants. THE FRICTION IS
AT THE TILL RATHER THAN AT THE SHELF: adding one is free, paying for one
means reading the trial once. At the checkout, because that is the only
place the question survives a page reload - and the server checks the answer
rather than trusting the screen to have asked, because a confirmation
nothing verifies is decoration.

THE GROCERY CHECKOUT IS WHY THE READERS SHIP FIRST. Nutrition once had a
placeOrder that debited the wallet, wrote an order and created seven
delivery rows, and nothing in the app rendered any of it: a citizen paid and
then had nowhere to see, track or cancel what they had bought. It was
removed and a spec holds it removed. Here GET store/bag and GET store/orders
exist in the same commit as the routes that write them, and the order
history renders on the page. `itemsJson` is a snapshot of what was charged
rather than ids to re-price later - a receipt that changes when a shelf
price changes is not a receipt.

ONE TILL. It charges through the Financial hub like the thirteen other hubs
that take money, so a bottle of D3 lands in the monthly spending view beside
a dinner, and `financial.paid` puts the debit and the order in one
transaction - a failure after the debit is how somebody ends up paid-up with
nothing to show for it.

NONE OF THE FOUR ROUTES IS A MIRA CAPABILITY. "Order me the vitamin D" is one
sentence away from working, and an assistant that can spend a citizen's
wallet on a supplement is an assistant that can be talked into spending it
on the wrong one.

THE RETAILER'S LINK AND PHOTOGRAPH ARE DROPPED ON THE WIRE, not in the
component, so no screen can put either back by accident. What survives is
`retailer` as PROVENANCE - the claim the review was actually making, that
this is a real product somebody stocks in India - and the drawn pack, which
this city owns.

TWO SECURITY SPECS ARE RED ON MAIN and are not fixed here: query-scoping and
runtime-isolation, both from the daybook landings, which gated on
`src/fitness src/mira src/privacy src/daybook` and never ran src/security.
The three daybook writes it flags each do an ownership check first, so this
is a scanner that cannot see a read-then-write rather than an open door -
but read-then-write is also a race, and both deserve their own commit. The
gate in this script names the four security specs this change is answerable
to rather than passing the directory and quietly inheriting somebody else's
red.

NEXT. The cabinet - what somebody actually takes, checked against the upper
limits already in the knowledge base. An order is now the best evidence this
city has of that, and it is still not the same thing as being asked.
MSG
ok committed
say "review, then:  git push"
