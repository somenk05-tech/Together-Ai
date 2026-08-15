#!/usr/bin/env bash
# land-a-step-goes-where-the-product-works.sh  ·  run from the REPO ROOT
#
# The other half of the live-page read. 'One unit on the page' landed the two
# wrong LABELS; these are the two wrong PLACES, and they were in routine-engine
# long before this week. Two files, API only, no migration.
set -uo pipefail
A=together-city-chat
say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }
[ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
LOG="$(git log --oneline -20)"
printf '%s\n' "$LOG" | grep 'A step goes where the product works' >/dev/null && die "already landed"
printf '%s\n' "$LOG" | grep 'One unit on the page' >/dev/null \
  || die "base commit 'One unit on the page' is not here"
ok "the base is here, this is not"

say "2 - sha256"
check(){ got="$(shasum -a 256 "$1" | awk '{print $1}')"; [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"; }
check "$A/src/beauty/routine-engine.ts"             b8629a92c4d7a57f2c63747a2792562abe5d9970e146c15bbafa9a5ac079f4de
check "$A/src/beauty/the-band-and-the-gate.spec.ts" f03b7f060af91c75744d86a7e6531d1c42ce97f9c7fc8538fcb6d82d89ce00db

say "3 - gates"
cd "$A" || die cd
npx tsc --noEmit 2>&1 | grep -v '^src/fitness/supplements/' | grep '^src/' \
  && die "api tsc: errors outside fitness/supplements" || ok "api tsc (beauty clean)"
npx jest src/beauty && ok "beauty suite (16 files, 174 tests)" || die "beauty suite"
npx eslint src/beauty/routine-engine.ts src/beauty/the-band-and-the-gate.spec.ts \
  && ok "eslint clean" || die eslint
cd ..
# Web is untouched: routine-engine runs on the API and the page renders whatever
# step it is handed. No vitest, no build.
ok "no web files in this change"

say "4 - commit"
git add "$A/src/beauty/routine-engine.ts" "$A/src/beauty/the-band-and-the-gate.spec.ts" \
        land-a-step-goes-where-the-product-works.sh || die "git add"
git commit -F - <<'MSG' || die commit
A step goes where the product works

Two routing faults, both found by reading the live routine page rather than
the code, and both older than this week's engine work. 'One unit on the
page' took the two wrong LABELS off that screen; these are the two wrong
PLACES.

A HAND CREAM WAS BEING APPLIED BEFORE THE SHOWER. classify() matches on the
display CATEGORY, and of the sixteen the sheet produces exactly two contain
the word "cream" — Moisturiser and Hand cream. ORDER is scanned in array
order, so `/moisturiser|cream/` at rank 50 caught the hand cream three lines
above its own rule at rank 76. Live, the body band opened with

    1  MOISTURISE  L'Occitane Shea Butter Hand Cream
                   "Seal everything underneath while skin is still slightly damp."
    2  WASH        Dove Deeply Nourishing Body Wash

— hand cream first, the shower second, and MOISTURISE printed twice in one
band. `/moisturiser/` alone reaches the only category that line is for; the
band now runs wash, exfoliate, moisturise, hands, lips, and the hand cream
gets its own instruction back.

AND A SCALP SERUM WAS TOLD TO AVOID THE SCALP. "Hair Serum/Leave-in" is one
column on the data sheet and two different objects: a finishing oil for the
ends, and a Redensyl or AnaGain treatment for the roots. Both classified
'Finish', so Ustraa's Hair Growth Vitalizer was live under "a few drops
through damp mid-lengths and ends. Do not go near the roots" — the opposite
of the only way it works, on the one product on that page bought to do
something about hair fall.

Two of the ten products in that category are scalp treatments. They get a
step of their own, detected from the ACTIVES and the name: Redensyl and
AnaGain are scalp actives and "hair growth vitalizer" is what the bottle
calls itself. Nothing here reads the blurb and nothing claims the product
works — only where it goes.

THE REAL FIX FOR THE SECOND IS A COLUMN, and this is the smaller thing that
can be done without it. A scalp-treatment category on the sheet would make
it structural; a regex covers the two products that exist today and will not
know about the third.

NEITHER SUITE COULD HAVE CAUGHT EITHER OF THESE, and that is the part worth
keeping. 171 tests asserted what the planner CHOOSES and what it costs. What
was wrong was what the page then told somebody to DO with it — a label and
an ordering, downstream of every number any of them checks. The three
assertions added here are the first that read a step's instruction.

Gates: api tsc clean across src/beauty, 16 suites / 174 tests, eslint clean
on both files. No web files touched.
MSG
ok "committed"
say "done - now push"
