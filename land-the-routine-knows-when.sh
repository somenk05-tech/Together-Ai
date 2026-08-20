#!/bin/bash
# land-the-routine-knows-when.sh — the routine's summary card stops selling and
# starts scheduling.
#
#   1. "ADD ALL TO BAG" COMES OFF, at the owner's word. The card carries three
#      numbers and they are a reading of the routine; an accent button under
#      them turned it into a till. `setMany` in features/beauty/api.ts goes with
#      it — it was written for that button and had one caller.
#
#   2. A COUNTDOWN GOES ON. Once an order is placed the card says how many days
#      until the next one is due, and names the product that sets the date. The
#      first thing to run out sets it — a 50 ml sunscreen at the honest dose is
#      six weeks and a 300 ml hair oil is five months — and the date asked for
#      is seven days BEFORE empty, so a delivery lands in time.
#
#   3. AND THE NEWEST ORDER SAYS IT TOO, on /beauty/orders.
#
# WHY ONE COMMIT AND NOT TWO. The button removal was written first, was never
# landed, and touches the same two files the countdown does. Splitting them now
# would mean a commit of "the button is gone" that also carried half a feature.
# land-no-till-on-the-routine.sh, which was written for the first half alone,
# is in _to_delete/superseded-scripts/ — it was never run and its hashes went
# stale the moment the second half was written.
#
# BOTH PACKAGES. Railway rebuilds the API, Vercel the web app. No schema, no
# migration — the reorder date is computed from an order that is already stored.
# PRECONDITION: "The shelf and the cap".
#
# The files are already on disk, written through the Cowork device bridge. This
# verifies them by hash, runs both packages' gates, and commits only if every
# one is green.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] && [ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The routine knows when"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"The shelf and the cap"*) ;;
  *) echo "!! Run land-the-shelf-and-the-cap-2.sh first — this is written against the tree it produces."; exit 1 ;;
esac

# ── the tree carries these nine files, and nothing else that matters ────────
#
# Scope, not filenames — see land-the-shelf-and-the-cap-2.sh for the argument.
# Two packages this time, so "inside" is both of them: nothing may be dirty in
# either except the nine, tracked or untracked, staged or not.
ALLOWED='^(M |MM| M|\?\?) (together-city-chat/src/beauty/(reorder\.ts|reorder-is-due\.spec\.ts|monthly-cost\.ts|beauty\.service\.ts)|together-city-react/src/(features/beauty/(api\.ts|components/NextOrder\.tsx|pages/(Routine|Orders)\.tsx)|app/a-routine-counts-down-to-its-next-order\.test\.ts))$'
PKG='together-city-(chat|react)/'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! The packages carry changes this script did not expect:"
  echo "$IN_SCOPE"
  exit 1
fi

TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  echo "!! Tracked files outside both packages have uncommitted changes:"
  echo "$TRACKED_ELSEWHERE"
  echo "   Commit or stash them first — this script will not commit on top of them."
  exit 1
fi

SCRATCH="$(printf '%s\n' "$STATUS" | grep -E '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$SCRATCH" ]; then
  N="$(printf '%s\n' "$SCRATCH" | grep -c . || true)"
  echo "== $N untracked path(s) outside both packages, ignored — none of it is committed"
fi
echo "== the tree is what this script expects"

verify() {
  local want="$1" path="$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || {
    echo "!! $path is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify f6570a502584e9c05c811a2b96030d7c42d6884afd4eab25e6beebe3de571143 together-city-chat/src/beauty/reorder.ts
verify f6715f0745588561105611fe896090be4148b4dbc27f3f6a7697a1d329b908e1 together-city-chat/src/beauty/reorder-is-due.spec.ts
verify 97c93a73c07527da97b0efaad74ab3cc18bac595d14db3209240d6409731bf94 together-city-chat/src/beauty/monthly-cost.ts
verify 3476f66bfe578141befcf4d8066b59043c4fcca27439acae2886d9fcd0bd6770 together-city-chat/src/beauty/beauty.service.ts
verify 003d33782fb191438a9c7361aba6ba3f857e151f0ed1ff706db9f83003a8e4f5 together-city-react/src/features/beauty/api.ts
verify 0038e4439b43aa3655a22bc1bc4ce2f96af2e1986ff9b298f65d61be96c5fc72 together-city-react/src/features/beauty/components/NextOrder.tsx
verify 86f1b7096bac2bf2e448109dce81a40c8d5e3092a6042f3983b0ea172c40b31d together-city-react/src/features/beauty/pages/Routine.tsx
verify a57a5e10ae80d5b0115d6d47c96ef17fe4eb33b3f169603cd2ee73a64f97fbb8 together-city-react/src/features/beauty/pages/Orders.tsx
verify 01b7632ff483ce216b721401db51fa20b02e10fe03aab713a70dcf3ac3e72f28 together-city-react/src/app/a-routine-counts-down-to-its-next-order.test.ts
echo "== all nine files verified"

# ── the API ────────────────────────────────────────────────────────────────
echo
echo "== API gate: tsc"
(cd together-city-chat && npx tsc --noEmit)

echo "== API gate: the suites this can reach"
# src/beauty for the change; src/shared because voice-scan and demo-data walk
# every file under src/ and two new files are inside their scope.
(cd together-city-chat && npx jest src/beauty src/shared --silent)

echo "== API gate: lint, held to the number on main"
# See land-the-shelf-and-the-cap-2.sh: scripts/lint-ceiling.json says 124 and
# main measures 127, from a change that landed without ratcheting. Not raised,
# not lowered; what is enforced is that THIS commit adds nothing. The braces
# and `|| true` are load-bearing — ESLint exits non-zero on every run at 127,
# and pipefail would otherwise kill the script at its own measurement.
API_BASELINE=127
API_LINT="$( { (cd together-city-chat && npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null) || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || { echo "!! ESLint produced no readable report. Not committing on an unmeasured tree."; exit 1; }
if [ "$API_LINT" -gt "$API_BASELINE" ]; then
  echo "!! API lint went UP: $API_LINT, main is at $API_BASELINE. This commit added some:"
  (cd together-city-chat && npx eslint 'src/beauty/**/*.ts') || true
  exit 1
fi
echo "   API lint errors: $API_LINT (main: $API_BASELINE). Nothing added."

# ── the web app ────────────────────────────────────────────────────────────
echo
echo "== web gate: tsc"
(cd together-city-react && npx tsc --noEmit)

echo "== web gate: vitest"
# The one gate the authoring session could not run: this package's node_modules
# was installed on macOS, so rollup looks for a Linux binary inside the bridge's
# VM and dies before a single test. It runs here, on the Mac.
(cd together-city-react && npx vitest run)

echo "== web gate: the ceilings that are clean"
(cd together-city-react && node scripts/a11y-audit.mjs)
(cd together-city-react && node scripts/motion-ceiling.mjs)
(cd together-city-react && node scripts/lint-ceiling.mjs)

echo "== web gate: the two audits main is already failing"
# Both were failing at "The shelf and the cap" before this change — verified by
# swapping these files out for HEAD's and re-measuring. Measured against main,
# neither ceiling edited.
DEAD_BASELINE=3
DEAD_OUT="$( { (cd together-city-react && node scripts/dead-export-audit.mjs 2>&1) || true; } )"
DEAD="$(printf '%s\n' "$DEAD_OUT" | sed -n 's/.*Exports nothing imports[^0-9]*\([0-9][0-9]*\).*/\1/p' | sed -n 1p)"
[ -n "$DEAD" ] || { echo "!! Could not read the dead-export audit:"; echo "$DEAD_OUT"; exit 1; }
if [ "$DEAD" -gt "$DEAD_BASELINE" ]; then
  echo "!! Exports nothing imports went UP: $DEAD, main is at $DEAD_BASELINE. This commit orphaned something:"
  (cd together-city-react && node scripts/dead-export-audit.mjs --list) || true
  exit 1
fi
echo "   dead exports: $DEAD (main: $DEAD_BASELINE). Nothing orphaned."

NAV_BASELINE=1
NAV_OUT="$( { (cd together-city-react && node scripts/nav-audit.mjs 2>&1) || true; } )"
case "$NAV_OUT" in
  *clean*) NAV=0 ;;
  *) NAV="$(printf '%s\n' "$NAV_OUT" | sed -n 's/.*nav-audit: \([0-9][0-9]*\) problem.*/\1/p' | sed -n 1p)" ;;
esac
[ -n "$NAV" ] || { echo "!! Could not read nav-audit:"; echo "$NAV_OUT"; exit 1; }
if [ "$NAV" -gt "$NAV_BASELINE" ]; then
  echo "!! nav-audit went UP: $NAV, main is at $NAV_BASELINE. This commit stranded a route:"
  echo "$NAV_OUT"
  exit 1
fi
echo "   nav-audit problems: $NAV (main: $NAV_BASELINE). Nothing stranded."

echo "== web gate: the build"
(cd together-city-react && npx vite build)

echo
echo "   ── THREE PIECES OF DRIFT ON MAIN, NONE OF THEM THIS COMMIT'S ────────"
echo "   web  dead-export-ceiling.json says 2, the tree measures $DEAD:"
echo "          features/astrology/hooks.ts                          useGemCommission"
echo "          features/nutrition/components/MedicalAdvisories.tsx  MedicalAdvisories"
echo "          features/nutrition/components/PlanGuidanceBanner.tsx PlanGuidanceBanner"
echo "   web  nav-audit: \"/beauty/makeup\" is declared and nothing links to it."
echo "          The makeup surface was hidden deliberately (land-hide-makeup.sh)"
echo "          and the route was left declared. Delete it, or put it in"
echo "          UNREACHABLE_ON_PURPOSE in scripts/nav-audit.mjs with that reason."
echo "   api  scripts/lint-ceiling.json says 124, the tree measures $API_LINT."
echo
echo "   Each one makes the NEXT landing script explain itself, as this one just"
echo "   did twice. Worth an afternoon."
echo "   ─────────────────────────────────────────────────────────────────────"
echo

git add -A together-city-chat/src/beauty together-city-react/src/features/beauty together-city-react/src/app
git commit -F - <<'MSG'
The routine knows when

── THE CARD STOPS SELLING ─────────────────────────────────────────────────────

"Add all to bag" comes off the routine's summary card, at the owner's word.

The card carries three numbers and they are a READING of the routine: what it
costs to buy today, what it costs a month to keep going, how many bottles that
actually is. An accent button under them turned that reading into a till — the
one loud control on the page, and the only thing on the card that was not
information.

It was also the worst-matched affordance on it. Ten products go into the bag in
one tap and come out one at a time: there is no undo for it anywhere in this
hub. Every step already carries its own Add to bag, next to the photograph, the
size, the price and how long the bottle lasts, which is where a decision that
size belongs.

`setMany` in features/beauty/api.ts goes with it. It existed for that button and
had exactly one caller, and a bulk write left behind with nothing calling it is
a loaded gun in a drawer. The behaviour is described in the comment left in its
place, if it is ever wanted back.

── AND STARTS SCHEDULING ──────────────────────────────────────────────────────

A routine is not a purchase, it is a supply. Somebody who has just paid ₹10,553
for ten products owns between six weeks and five months of different things, and
the question they will have in a month is not "what did I buy" but "when do I
have to do this again". Nothing in the hub answered it, so the answer lived in a
drawer with ten bottles in it.

THE FIRST THING TO RUN OUT SETS THE DATE. Not the average, and emphatically not
the last. On the routine this was written against, the coconut hair oil is a
300 ml bottle at 60 ml a month — five months — and the sunscreen is 50 ml at the
honest dose of 36 ml a month, which is six weeks. Waiting for the hair oil means
three and a half months with no sunscreen, in a routine whose first principle is
that sunscreen is the one step with no substitute.

AND IT IS AN ORDER-BY DATE, NOT AN EMPTY-BOTTLE DATE. Seven days earlier,
because a reorder placed on the morning the tube runs out is a week without
sunscreen however fast the courier is. The lead time is a named constant rather
than a subtraction buried in a sum: it is a judgement about delivery, it will be
wrong the first time this ships anywhere with different logistics, and whoever
changes it should be able to find it.

IT IS COMPUTED FROM THE ORDER, NOT FROM THE CURRENT ROUTINE. Somebody who moves
their budget the day after paying has a new routine and the same ten bottles,
and the bottles are what run out. Which is also why the function takes no clock:
a due date is a fact about a purchase made at a fixed moment, so it is the same
date whenever it is asked for.

── WHERE THE ARITHMETIC LIVES, WHICH IS THE POINT OF THE SPLIT ────────────────

The server decides the DATE; the browser counts the DAYS. Every judgement —
which product, how long a pack lasts, how early to ask — is made once in
beauty/reorder.ts, exactly as lastsLabel and packLabel are made once in
monthly-cost.ts, and travels as an answer. The page turns one ISO day into
"35 days" and formats nothing else, which is why the number is right at midnight
without anybody refetching anything, and why there is still only one copy of the
rule to correct when it is wrong.

DAYS_PER_MONTH is derived from lastsLabel's own 4.345 weeks rather than picked
afresh, because the countdown says "35 days" about the same bottle that file
calls "about 6 weeks", and two independent constants would eventually disagree.

AND IT NAMES WHAT RUNS OUT. "35 days" is a number that has to be trusted; "35
days — your sunscreen runs out first, a pack lasts about 6 weeks" is a number
that can be checked against the bottle on the shelf. This hub shows the working
behind every other figure it prints, and a countdown is the figure most likely
to be wrong about somebody who uses more sunscreen than the honest dose assumes.

Quantity extends the supply — two sunscreens is twelve weeks — and the twelve
month period-after-opening cap applies per pack, because the second bottle is
sealed until the first is done. A product that has left the catalogue is skipped
rather than guessed at; an order where nothing resolves gets no date at all, and
no order at all gets the card exactly as it was.

── ON THE ORDERS PAGE, ONCE ───────────────────────────────────────────────────

The server dates every order in the history, because an order IS a supply with a
life and a history where only the top row knew about it could not answer "how
long did that last me". The page shows it on the newest one only: an order from
March ran out in April, and "Time to reorder" printed against every row somebody
has ever placed is a page of alarms rather than an answer.

Gates: API tsc, 124 beauty tests including 11 new ones in reorder-is-due.spec.ts,
316 shared tests, lint unchanged at 127. Web tsc, vitest, a11y, motion, lint,
and the build. The dead-export audit and nav-audit were already failing on main
before this commit, so both are measured against main and neither ceiling is
touched here — the landing script prints all three pieces of drift.

No schema, no migration, no new route.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The routine knows when
 Push — Railway rebuilds the API, Vercel the web app.
 /beauty/routine: the card reads, and says when to buy again.
===============================================================

DONE
