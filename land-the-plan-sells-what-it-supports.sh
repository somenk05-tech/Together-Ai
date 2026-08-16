#!/usr/bin/env bash
# land-the-plan-sells-what-it-supports.sh  ·  run from the REPO ROOT
#
# The supplement PLAN page gets its own shelf: "Available in India" under
# every supplement it supports, with Add straight to the store's own bag -
# and nothing at all under a refusal. Web only. No engine change, no wire
# change, no migration.
#
# RUN AFTER "The till gets its own room".
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The plan sells what it supports' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The till gets its own room' >/dev/null \
  || die "run land-the-till-gets-its-own-room-2.sh first"
ok "the base is here, this is not"

say "2 - scope"
# -uall so a fully untracked directory is named by its FILES rather than
# collapsed to a folder entry - that is what stopped the last land script.
STRAY="$(git status --porcelain -uall -- "$W/src/features/fitness" \
  | grep -Ev '(fitness/pages/Supplements\.tsx|fitness/pages/Store\.tsx|fitness/components/PackShot\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$W/src/features/fitness/pages/Supplements.tsx"
  "$W/src/features/fitness/pages/Store.tsx"
  "$W/src/features/fitness/components/PackShot.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/fitness/pages/Supplements.tsx"       ff0fa48313c0d90089e7820c2d9d1d21c08331008d0dbd7220ca0a1a88b33f0a
check "$W/src/features/fitness/pages/Store.tsx"             6048a8e0f2e8a1d0f16cd2606268b146efaed89ec86ca5055592fcb95264ff0c
check "$W/src/features/fitness/components/PackShot.tsx"     8fdc5dbe69d8817b82a9d6af42b32203b7a8f10c9b7f60144d49933e37d992f9

# No API file changes: the plan endpoint and the store endpoint are both
# unchanged, and this page reads them. The bag it writes to is the store's.

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

say "5 - commit"
git add "${FILES[@]}" land-the-plan-sells-what-it-supports.sh || die "git add"
git commit -F - <<'MSG' || die commit
The plan sells what it supports

The supplement plan page gets the evidence review's own "Available in
India" section under each recommendation - the photograph, the brand,
the strength, the review's markers, the price, and one Add - at the
owner's word. The engine, the catalogue, the bag and the till are all
unchanged; this is the plan page reading the store it already links to.

IT REVERSES A RULE, SO THE ARGUMENT IS IN THE FILE. The old rule was no
price and no Add anywhere on this page: selling is a different act from
advising, and a page doing both cannot be trusted with the second,
because the moment a refusal costs revenue the refusals get quieter.
That risk has not gone away. What changed is where the till stands - a
citizen reading "your LDL is 132, and psyllium is the one answer here
with high-certainty evidence behind it" should not then have to go and
find the isabgol themselves on a shelf of forty-three bottles.

THE ASYMMETRY IS THE GUARD. Priority, consider and optional cards carry
a shelf. The REFUSED bucket carries no product, no price and no button,
ever - and the decision is made by the PARENT rather than inside the
card, so a prop somebody adds later cannot turn one on. The refusal
costs this page revenue by construction, which is what stops it
softening to earn some. Those twelve products are still buyable in the
store, where the checkout makes you read the trial first, and the
refused section says so in as many words.

ONE BAG, ONE TOTAL, ONE TILL. The bag written from here is the store's
own: same lines, same server pricing, editable on either screen, paid at
/fitness/orders. The bag bar is the last block of the page, exactly as
on the shelf.

THE BUY CONTROL MOVED to fitness/components/PackShot beside the pack and
the photograph, because two copies of "what may be bought" is two
answers the first time either is corrected - which for these three rules
would mean a prescription-only medicine growing an Add button on one
screen and not the other. Prescription and no-single-price products are
still SHOWN on the plan's shelf, with their sentence instead of a
button, and they sort below what can actually be bought today.

Gates: web tsc, the whole vitest suite, the four audits at their
ceilings, and the web build. No API file touched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push"
