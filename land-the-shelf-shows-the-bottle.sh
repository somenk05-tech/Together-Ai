#!/usr/bin/env bash
# land-the-shelf-shows-the-bottle.sh  ·  run from the REPO ROOT
#
# The supplement store takes the owner's reference design
# (supplements-india_1.html, 16 Aug): the retailer's photograph on every
# card, the review's markers as chips, and a "See the product" door - while
# the till stays the city's. Backend engine unchanged; the wire regains two
# fields the catalogue always carried.
#
# RUN AFTER "The card says it once".
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
printf '%s\n' "$LOG" | grep 'The shelf shows the bottle' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The card says it once' >/dev/null \
  || die "run land-the-card-says-it-once.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/fitness/supplements" "$W/src/features/fitness" "$W/src/api/store.api.ts" \
  | grep -Ev '(supplements/supplements\.service\.ts|supplements/supplements\.spec\.ts|api/store\.api\.ts|fitness/pages/Store\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$A/src/fitness/supplements/supplements.service.ts"
  "$A/src/fitness/supplements/supplements.spec.ts"
  "$W/src/api/store.api.ts"
  "$W/src/features/fitness/pages/Store.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/fitness/supplements/supplements.service.ts"   4d98207c254f8988fc613c10267e8b626cdc898a4481c474618849320876cd28
check "$A/src/fitness/supplements/supplements.spec.ts"      d7860c86664c0d48f43ec26a8fffe7a29111bfa62ec201b8442b2e3f6ca3c5d5
check "$W/src/api/store.api.ts"                             fc58d3d30c0733e8532f41b7c109f5f8d5f49c597824c5b5876787eafd4a2370
check "$W/src/features/fitness/pages/Store.tsx"             36fa1a8130823710c920345ec7572f2cc7ef23dab4380ec1299ff5fdf33559a7

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
git add "${FILES[@]}" land-the-shelf-shows-the-bottle.sh || die "git add"
git commit -F - <<'MSG' || die commit
The shelf shows the bottle

The supplement store takes the owner's reference design - the card grid
from supplements-india_1.html, 16 Aug. The engine, the bag and the till
are untouched; what changed is what a card shows and where its door
leads.

THE PHOTOGRAPH AND THE DOOR ARE BACK, reversing the 15-Aug "nothing
leaves the city" rule at the owner's word. The catalogue always carried
`url` and `image` per product; the service deleted both on the wire so
no screen could put them back by accident. It now sends them, and the
store shows the retailer's own photograph on every card with the drawn
pack standing behind it as the fallback for a hotlink that is slow or
gone - the same deal the Beauty market has always made. "See the
product" is a link on the card and in the detail: leaving is allowed,
it just isn't the transaction.

WHAT DID NOT REVERSE. Paying happens here, from the one city wallet -
Add, the bag, the refused-list acknowledgement at the till, and the
order history are all exactly as they were. The catalogue spec still
holds every url to clean https with no affiliate or tracking params,
and `retailer` still travels as provenance in its own right.

AND THE MARKERS COME FORWARD. The review's own chips - VEGAN,
VEGETARIAN, REPLETION ONLY, LABELLED 100% RDA - were buried in the
detail view; the reference draws them on the card face, so they are on
the card face, three at most with the rest waiting in the detail.

The two specs that enforced the drop now enforce the opposite contract,
each carrying the date and the reason the old assertion left: the store
payload carries the photograph and the product page again, and every
door out is a clean https product page, not an affiliate. 52
supplements tests green.

Gates: api tsc and the supplements jest suite; web tsc, the whole
vitest suite, the four audits at their ceilings, and the web build.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push"
