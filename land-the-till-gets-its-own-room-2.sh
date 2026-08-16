#!/usr/bin/env bash
# land-the-till-gets-its-own-room-2.sh  ·  run from the REPO ROOT
#
# The supplement store buys the Beauty way, at the owner's word: Add on the
# shelf, ONE bag bar at the foot of the page, and a checkout PAGE at
# /fitness/orders. "See the product" comes off - the photograph stays. The
# engine and the till endpoints are untouched.
#
# -2 BECAUSE THE FIRST DIED AT ITS OWN SCOPE CHECK on a git habit: a fully
# untracked directory is printed as "components/" rather than as the file
# inside it, so the new PackShot.tsx read as a stray. `-uall` makes git name
# the files themselves, which is what the allow-list is written against.
#
# RUN AFTER "The shelf shows the bottle".
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
printf '%s\n' "$LOG" | grep 'The till gets its own room' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The shelf shows the bottle' >/dev/null \
  || die "run land-the-shelf-shows-the-bottle.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -uall -- "$A/src/fitness/supplements" "$W/src/features/fitness" "$W/src/api/store.api.ts" "$W/src/app/router.tsx" "$W/src/config/hubs.ts" \
  | grep -Ev '(supplements/supplements\.service\.ts|supplements/supplements\.spec\.ts|api/store\.api\.ts|fitness/pages/Store\.tsx|fitness/pages/Orders\.tsx|fitness/components/PackShot\.tsx|app/router\.tsx|config/hubs\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$A/src/fitness/supplements/supplements.service.ts"
  "$A/src/fitness/supplements/supplements.spec.ts"
  "$W/src/api/store.api.ts"
  "$W/src/features/fitness/pages/Store.tsx"
  "$W/src/features/fitness/pages/Orders.tsx"
  "$W/src/features/fitness/components/PackShot.tsx"
  "$W/src/app/router.tsx"
  "$W/src/config/hubs.ts"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/fitness/supplements/supplements.service.ts"      80499fd55e4a4aea559cb2833ba2c3680cfb03b673973faeca2a405b9eea8eeb
check "$A/src/fitness/supplements/supplements.spec.ts"         5691f4183b6d0f46a38530162ffdd26d8288e40c6984cef22cd113daaf2f72ae
check "$W/src/api/store.api.ts"                                bb7e6d1c0159303d05da7369451dee1d912a9bd98a7cfc958507ccda68efccfd
check "$W/src/features/fitness/pages/Store.tsx"                acb4a5e556bf84e311b14aa9150203170f566272b739375ae8bccebccdf68b66
check "$W/src/features/fitness/pages/Orders.tsx"               4c712e4dbc396b71c9242ece5c1757aad96d14831db32badad75410ec64f3f6f
check "$W/src/features/fitness/components/PackShot.tsx"        fe1556dfbca67c74505d90ea08c3c16ea326a7426ca28273bc1badc75a4d285a
check "$W/src/app/router.tsx"                                  ddf185e50096dee8d0e92ef7eb2abde821c4a67e24adc1a6bab6c59928eda515
check "$W/src/config/hubs.ts"                                  e6b57adf054299d9e9bc54b487b0a1b44835eac2a5cb004092e93e499fc196d0

say "4 - api gates"
cd "$A" || die cd
npx tsc --noEmit                     && ok "api tsc"             || die "api tsc"
npx jest src/fitness/supplements     && ok "supplements suite"   || die "supplements suite"
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
git add "${FILES[@]}" land-the-till-gets-its-own-room.sh land-the-till-gets-its-own-room-2.sh || die "git add"
git commit -F - <<'MSG' || die commit
The till gets its own room

The supplement store buys the Beauty hub's way, taken whole, at the
owner's word - and "See the product" comes off, hours after it went on.
The engine, the bag endpoints and the wallet till are untouched.

THE DOOR COMES OFF. The photograph stays on every card (drawn pack
behind it as the fallback); the outbound link goes, and `url` is
deleted on the wire again where no screen can put it back by accident.
A shop with a door to a rival checkout is not a shop. The store spec
now asserts exactly this split: image travels, url does not, retailer
survives as provenance.

CHECKOUT IS A PAGE. The store carried the bag, the refusal
acknowledgement and the pay button inline above the products - a till
parked on top of a shop still trying to sell you more. The Beauty
shape instead: Add on the shelf; ONE BAG BAR as the last block of the
page - count, total, names, and Checkout as a LINK; and /fitness/orders
(My Orders, sidebar 10) where the bag is laid out line by line with its
photographs, prices each, editable quantities, the total at the foot,
and the wallet under that. Nothing is charged before that page. The
refusal friction moved with the till - the do-not-buy list and its
read-once checkbox are at the payment, where they always belonged, and
the server still verifies the acknowledgement. Order history lives
under the bag, beauty-style, and leaves the store page.

THE PACK AND THE PHOTOGRAPH BECOME A SHARED COMPONENT
(fitness/components/PackShot) because the orders page draws the same
bag lines, and two copies of a fallback are two behaviours the day one
of them is fixed. Bag lines carry `image` on the wire (the server
always sent it; the client schema now reads it), so the checkout page
shows the thing being paid for and not a diagram of it.

Gates: api tsc and the supplements jest suite (52 green); web tsc, the
whole vitest suite, the four audits at their ceilings - nav-audit now
counting /fitness/orders among its declared routes - and the web build.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push"
