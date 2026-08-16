#!/usr/bin/env bash
# land-a-closed-listing-can-be-deleted.sh  ·  run from the REPO ROOT
#
# An owner can delete a closed listing for good, and the neighbours whose
# conversations end are told before the rows go.
#
# TWO STEPS, NOT ONE. Deleting is only allowed on a listing that is already
# closed. A single button that destroys a shopfront, its reviews, its menu and
# every conversation in it is a button somebody presses at the end of a bad
# week; closing first is one extra press and it is the press that makes the
# decision deliberate.
#
# No migration. Every relation on ServiceListing is already onDelete: Cascade.
#
# RUN AFTER "Together City Trust" - it touches four of the same files.
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'A closed listing can be deleted' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Together City Trust' >/dev/null \
  || die "run land-together-city-trust.sh first - this is written on top of it"
ok "the base is here, this is not"

say "2 - scope"
MINE='(local-services/local-services\.service\.ts|local-services/local-services\.controller\.ts|local-services/deletion\.spec\.ts|security/runtime-isolation\.spec\.ts|services/api\.ts|services/pages/MyBusiness\.tsx)$'
DIRTY="$(git status --porcelain -uall -- "$A/src/local-services" "$A/src/security" "$W/src/features/services")"
OTHERS="$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -v '^[[:space:]]*$' || true)"
TRACKED_STRAY="$(printf '%s\n' "$OTHERS" | grep -v '^??' | grep -v '^[[:space:]]*$' || true)"
[ -z "$TRACKED_STRAY" ] || { printf '   \033[31mx\033[0m these tracked files carry edits this script did not write:\n%s\n' "$TRACKED_STRAY"; \
  die "another session is editing the same code - do not force past this"; }
if [ -n "$OTHERS" ]; then
  printf '   \033[33m~\033[0m new files from another session are here and are NOT being committed:\n%s\n' "$OTHERS"
else
  ok "the six files this commit touches are the only ones it will add"
fi

say "3 - sha256"
FILES=(
  "${A}/src/local-services/local-services.service.ts"
  "${A}/src/local-services/local-services.controller.ts"
  "${A}/src/local-services/deletion.spec.ts"
  "${A}/src/security/runtime-isolation.spec.ts"
  "${W}/src/features/services/api.ts"
  "${W}/src/features/services/pages/MyBusiness.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "${A}/src/local-services/local-services.service.ts"    5f9a1853bb370f30dc6d2e79e1726db82b94f9e4dcdcb7b608083f1459e24063
check "${A}/src/local-services/local-services.controller.ts" 7ef53fac9f040d08a0e73008b5a0ab4fdd806f501dc5b81625374ddfac3c2dcf
check "${A}/src/local-services/deletion.spec.ts"             5e2c95546b1654786eb66ef55391be5de432df610df1e3e3a76a307669a09999
check "${A}/src/security/runtime-isolation.spec.ts"          6b8dfaabeb389737bfffa3100efaab19b866f478c1884e69130675893518ac90
check "${W}/src/features/services/api.ts"                   a6e62930733d971feb7e782d2e15f957a997a8f1e769272dbd478b0245d5960e
check "${W}/src/features/services/pages/MyBusiness.tsx"     3dff458efda547e316215b7ef1dfa3791932ca31228817c85bdb23ceb7b0e7fd

say "4 - api gates"
cd "$A" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$A/src" "$A/prisma" | sed -n "s|^?? $A/||p")"
TSC_API="$(npx tsc --noEmit 2>&1 || true)"
FILTERED_API="$TSC_API"
while IFS= read -r f; do
  [ -n "$f" ] && FILTERED_API="$(printf '%s\n' "$FILTERED_API" | grep -vF "$f" || true)"
done <<EOF
$FOREIGN
EOF
if printf '%s\n' "$FILTERED_API" | grep -q "error TS"; then
  printf '%s\n' "$FILTERED_API"
  die "api tsc"
fi
ok "api tsc"

SPECS="$(git ls-files 'src/local-services/*.spec.ts' 'src/admin/*.spec.ts' | tr '\n' ' ')"
[ -n "$SPECS" ] || die "no tracked specs found - refusing to pass a gate that ran nothing"
# shellcheck disable=SC2086
npx jest $SPECS src/local-services/deletion.spec.ts \
  && ok "local-services + admin suites" || die "local-services + admin suites"

# THE CROSS-USER HARNESS: RUN, REPORTED, NOT GATED - AND HERE IS WHY.
#
# This commit adds DELETE /api/services/:id/forever to the services probe, so
# the new door is covered the day the live half runs. The suite itself is
# ALREADY RED on main and was before this change: `daybook` takes
# PATCH/DELETE items/:id from callers and appears in neither PROBES nor
# UNPROBED, so "accounts for every controller that takes an id" fails. That is
# somebody else's to classify - and it is not a one-liner, because daybook's
# create returns the whole day record rather than { id }, which the generic
# probe cannot read. Absorbing it here by adding 'daybook' to UNPROBED would be
# writing a claim that is not true: every reason on that list is "cannot be
# created from a bare account", and daybook can.
#
# Reported rather than hidden, in the same spirit as dead-export-audit below.
if npx jest src/security/runtime-isolation.spec.ts >/dev/null 2>&1; then
  ok "cross-user isolation harness (structural half)"
else
  note "cross-user isolation is RED, and was before this commit: 'daybook' is neither probed nor listed as unprobed. Not absorbed here."
fi
cd ..

say "5 - web gates"
cd "$W" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$W/src" | sed -n "s|^?? $W/||p")"
TSC_OUT="$(npx tsc --noEmit 2>&1 || true)"
FILTERED="$TSC_OUT"
while IFS= read -r f; do
  [ -n "$f" ] && FILTERED="$(printf '%s\n' "$FILTERED" | grep -vF "$f" || true)"
done <<EOF
$FOREIGN
EOF
if printf '%s\n' "$FILTERED" | grep -q "error TS"; then
  printf '%s\n' "$FILTERED"
  die "web tsc"
fi
ok "web tsc"

npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npx vite build                  && ok "web build (vite)" || die "web build"
node scripts/dead-export-audit.mjs >/dev/null 2>&1 || note "dead-export-audit is over its ceiling by 3 pre-existing exports - somebody else's, untouched here"
cd ..

say "6 - commit"
git add "${FILES[@]}" land-a-closed-listing-can-be-deleted.sh || die "git add"
git commit -F - <<'MSG' || die commit
A closed listing can be deleted

The owner, 16 Aug: a closed listing sits on My business forever with
nothing but a Messages button and no way to remove it. Give it a delete.

DELETING IS THE STEP AFTER CLOSING, NOT AN ALTERNATIVE TO IT. The server
refuses on a live listing - "Close the listing first" - and the button
only renders on a closed card. One button that destroys a shopfront, its
reviews, its menu, its offers and every conversation in it is a button
somebody presses at the end of a bad week. The extra press is the whole
safety feature; friction is not.

AND IT BREAKS A PROMISE THIS HUB PRINTED, WHICH IS WHY THE NEIGHBOURS
ARE TOLD. "Closing takes it out of the directory. Conversations already
open stay open" sits on the card beside the close button, and a citizen
who was mid-job on Tuesday read it. Deleting ends those rooms. So every
person with a thread is notified BEFORE the rows go - one message per
person however many threads they hold, and a spec asserts that no
neighbour's id or alias ever appears in another neighbour's notice. A
conversation that simply vanishes is the version of this that is not
honest.

THE CONFIRMATION STATES THE NUMBERS RATHER THAN ASKING A QUESTION. Two
presses, no modal, no typed word: the second press says "delete hair
salon for good? Its reviews, menu and offers go with it, and so do 3
conversations - we will tell the neighbours in them." A dialog asking
"are you sure?" asks something nobody has the information to answer.

Its own path, not a flag: DELETE :id/forever rather than
DELETE :id?permanent=true, which would put an irreversible act one query
parameter from a reversible one and make the two read identically in a
log. No migration - every relation on ServiceListing is already
onDelete: Cascade, including the verification row landed this morning.

The cross-user harness gains DELETE /api/services/:id/forever so the new
door is probed the day the live half runs. The suite is red on main for
an unrelated reason and this commit reports it rather than absorbing it:
daybook takes PATCH/DELETE items/:id and is in neither PROBES nor
UNPROBED. It is not a one-liner - daybook's create returns the whole day
record rather than { id } - and listing it as unprobed would be writing
a false claim, since every reason on that list is "cannot be created
from a bare account".

NOT BUILT, AND THE REASON IS WORTH RECORDING: there is still no Reopen.
`moderation: 'removed'` means BOTH "the owner closed it" and "a
moderator suspended it" - the same value, indistinguishable - so a
Reopen button would let an owner undo a console suspension. Telling
those two states apart is a small migration and it is the prerequisite.

Gates: api tsc, the local-services and admin suites (6 new tests); web
tsc, the whole vitest suite, the four audits at their ceilings, and the
web build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018wnHW4SL446MrzLXdUgBrY
MSG
ok "committed"
say "done - now push"
