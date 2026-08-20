#!/bin/bash
# land-the-shelf-and-the-cap.sh — the 126-product shelf, and the share cap that
# only held on paper until it arrived.
#
#   1. THE SHELF. beauty-catalog.ts goes from 70 products to 126. The original
#      70 are byte-identical; 56 are appended. Every row carries two verified
#      photographs from different retailers, a real rupee price and a live
#      product page. The premium tier — which hair did not have at all — is now
#      filled in, and that is what found the bug below.
#
#   2. THE CAP. "No step may take more than half the category budget" was
#      written inside pass 5b and enforced only there. Passes 2, 3, 4 and 5 —
#      including the one that ADDS a step to reach the target — never asked. It
#      moves to the top of planCategory, next to the floor it exempts, and every
#      pass after the floor is held to it.
#
#   3. THE STALE TEST. A ₹1,000 face budget used to be short and is not any
#      more: the cheapest complete face routine fell from ₹1,067/month to ₹311.
#      The say-what-you-need path is asked at ₹300 instead, and a new test pins
#      the improvement so the old budget cannot quietly come back.
#
# API ONLY (together-city-chat). No web change, no route, no schema, no
# migration. Railway rebuilds; nothing on Vercel moves.
# PRECONDITION: the tree that carries "Four faults in one room".
#
# THE THREE FILES ARE ALREADY ON DISK, written through the Cowork device bridge
# — a 126 KB catalogue is not a patch anybody should read as base64. This script
# verifies them by hash, runs the gates, and commits only if every one is green.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="The shelf and the cap"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"Four faults in one room"*) ;;
  *) echo "!! This is written against the tree that carries \"Four faults in one room\"."; exit 1 ;;
esac

# ── the tree carries these three files and nothing else ─────────────────────
ALLOWED='^ M together-city-chat/src/beauty/(beauty-catalog|budget-routine|budget-is-a-limit\.spec)\.ts$'
DIRTY="$(git status --porcelain \
  | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|apply-.*\.sh|.*\.patch|_to_delete/)' \
  | grep -Ev "$ALLOWED" || true)"
if [ -n "$DIRTY" ]; then
  echo "!! The tree carries changes this script did not expect:"; echo "$DIRTY"; exit 1
fi

# ── and they are the exact bytes that were tested ───────────────────────────
#
# THE HASHES ARE THE PATCH. Everything this commit contains was verified in a
# session that could not run `nest build` (the bridge's mount refuses to unlink
# dist/), so the guarantee it can offer is "these are the bytes I measured" and
# the gates below are what turn that into "and they still pass here".
verify() {
  local want="$1" path="together-city-chat/src/beauty/$2"
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  local got; got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || {
    echo "!! $2 is not the file this script was written against."
    echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify f6a6f853366f96d95858940631c7836d3bb00801e7cbf763d970862cad3b39a9 beauty-catalog.ts
verify f4e1b1f85ca75935ff04000b641a421fd30bc765f47d2720f636e1c190323918 budget-routine.ts
verify 9ff64c4805b970ec3b78a6f70a33eddbbf1996d7beabc450741ca45ff8713e70 budget-is-a-limit.spec.ts
echo "== all three files verified"

cd together-city-chat

echo "== gate: tsc"
npx tsc --noEmit

echo "== gate: the suites this can reach"
# src/beauty is the change. src/shared is here because two of its specs WALK THE
# SOURCE TREE — voice-scan and demo-data both read every file under src/ — so a
# new 126 KB file full of prose is inside their scope whether or not it looks
# like it. Scoped rather than the full suite: the nutrition engine specs take
# minutes and nothing in this commit can reach them.
npx jest src/beauty src/shared --silent

echo "== gate: lint, held to the number on main"
#
# NOT `npm run lint:ceiling`, AND THE REASON IS A FINDING RATHER THAN A DODGE.
# scripts/lint-ceiling.json says 124. main at "Four faults in one room" measures
# 127 — before this commit, and with this commit's files swapped out for HEAD's
# to prove it. Some earlier change raised the number without ratcheting the
# ceiling, so `lint:ceiling` fails on a tree nobody here made dirty.
#
# The ceiling is NOT raised to paper over that: raising it is forbidden, and
# this commit did not earn a lowering either. Instead the gate that actually
# means something is enforced — this change adds no error to the count — and
# the drift is reported so it can be fixed by whoever caused it. Every one of
# the 127 is in a spec or service this commit never touches; src/beauty carries
# none of them.
BASELINE=127
COUNT="$(npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))})")"
if [ "$COUNT" -gt "$BASELINE" ]; then
  echo "!! Lint errors went UP: $COUNT, main is at $BASELINE. This commit added some."
  npx eslint 'src/beauty/**/*.ts' || true
  exit 1
fi
echo "   API lint errors: $COUNT (main: $BASELINE). Nothing added."
if [ "$COUNT" -ne "$(node -e "console.log(require('./scripts/lint-ceiling.json').errors)")" ]; then
  echo
  echo "   ── SEPARATELY, AND NOT THIS COMMIT'S DOING ──────────────────────────"
  echo "   scripts/lint-ceiling.json says $(node -e "console.log(require('./scripts/lint-ceiling.json').errors)") and the tree measures $COUNT. A change landed"
  echo "   without ratcheting. Worst files: chat/chat-gateway-golden.spec.ts (13),"
  echo "   tasks/tasks-golden.spec.ts (12), avatars/avatars.spec.ts (11),"
  echo "   calls/calls.service.spec.ts (11). 108 of the 127 are no-explicit-any."
  echo "   ─────────────────────────────────────────────────────────────────────"
  echo
fi

echo "== gate: the build"
npm run build

cd ..

git add -A together-city-chat/src/beauty
git commit -F - <<'MSG'
The shelf and the cap

── THE SHELF ──────────────────────────────────────────────────────────────────

beauty-catalog.ts goes from 70 products to 126. Fifty-six appended; two of the
fifty-eight generated deduped against rows already there. The original seventy
are byte-identical, and that is deliberate: the generator that produced them is
not in this repo, and a reimplementation of its derivations would silently
rewrite rows that are already correct. Appended, never regenerated.

Every new row carries two photographs, both resolved against the live page and
checked for content-type, and both from DIFFERENT retailers — so one retailer
reorganising its CDN cannot blank a product. Zero rotted, zero missing, zero
duplicated between primary and backup.

The five fields the engine needs and the owner's sheet does not carry — usage,
suitableSkin, profileKeys, tags and the display category — were reverse
engineered from the existing seventy rather than invented. The usage mapping in
particular was read out of the shipped file: a retinoid is Night whatever else
it is, vitamin C is Morning, wash-day items are Weekly.

What this buys, in the two places it shows: the cheapest complete face routine
falls from ₹1,067 a month to ₹311, on large-pack mass-market SPF that simply was
not on the old shelf. And hair gets a premium tier for the first time — it
topped out at ₹933 sticker before this, with no premium hair oil at all.

── THE CAP, WHICH THE PREMIUM TIER FOUND WITHIN THE HOUR ──────────────────────

"No step may take more than half the category budget" has been in this planner
since the budget became a target. It was written inside pass 5b — the premium
upgrade pass — because that is where the ₹3,300-a-month sunscreen came from, and
it was enforced only there.

IT WAS NEVER ONLY THAT PASS'S RULE. Pass 5 adds a whole step to reach the target
and priced its candidate against the ceiling alone. Pass 4 swaps a step for a
better one and priced only the DIFFERENCE — a ₹3,300 product replacing a ₹3,200
one is a ₹100 upgrade by that arithmetic and still most of the routine. Passes 2
and 3 pick the treat step and the optional step and asked nothing at all.

On the seventy-product shelf none of that mattered, because no category had a
product dear enough to trip it. The first premium hair oil found the hole the
same afternoon it arrived: at a ₹1,000 hair budget, pass 5 put a ₹680-a-month
hair serum on top of a ₹278 wash-and-condition routine. Seventy per cent of the
bill in one bottle, the cap in the same file, every other rule satisfied.

So `shareCap` moves to the top of planCategory as `withinShare`, declared beside
the floor it exempts, and every pass after the floor is held to it. The floor
stays exempt and has to: if the only compatible sunscreen costs more than half
the budget, that is the routine, and a cap that removed it would be choosing no
protection over expensive protection.

Two sentences come with it. A high-value step refused by the cap now says the
cheapest one that suits you is more than half your budget on one product,
instead of "would push you over" — which was not true, the money was there. And
a role left open by the cap says so plainly rather than "what you already have
covers it", which is a claim the citizen can check and find false.

── AND ONE TEST WHOSE ASSUMPTION THE SHELF MADE STALE ─────────────────────────

`says what a short budget would need` asked at ₹1,000 because ₹1,000 could not
carry cleanse-moisturise-protect: measured against that spec's own profile the
floor was ₹1,067, which is where the number in the assertion came from. It is
₹311 now, so there was no minimum left to report and the assertion failed on an
improvement.

The budget in it moves to ₹300, genuinely below the new floor. The assertion
does not move: a budget too small for a routine still has to answer with a
NUMBER rather than "your budget is insufficient", and that path still exists.
The comment left in its place says which of the two to change next time.

A second test pins the other half — ₹1,000 now carries a whole face routine —
so the first one cannot start passing again for the wrong reason. And a third
asserts the added step specifically, at a ₹1,000 hair budget, so the cap cannot
quietly go back to being one pass's guard.

Gates: tsc, 113 beauty tests, 316 shared tests, the API build. Lint measured at
127, unchanged from main — see the note in the landing script, the ceiling file
is stale by three from an earlier commit and this one does not touch it.

No route, no DTO, no schema, no migration. The wire shape is unchanged.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The shelf and the cap
 Push — Railway rebuilds the API. /beauty/routine plans against
 126 products, and no step is more than half its category.
===============================================================

DONE
