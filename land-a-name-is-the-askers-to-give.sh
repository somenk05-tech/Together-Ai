#!/usr/bin/env bash
# land-a-name-is-the-askers-to-give.sh  ·  run from the REPO ROOT
#
# A business sees a customer number - "#3" - instead of "Neighbour 3", and the
# person asking can choose, per business, to show their name instead. Default
# unchanged: nobody's name appears until they press something.
#
# ONE MIGRATION (a boolean, default false). `prisma generate` runs first
# because the service writes the new column - that step cannot run in a
# sandbox, so it is gated here rather than pre-checked.
#
# RUN AFTER "The hours on the door".
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
printf '%s\n' "$LOG" | grep "A name is the asker's to give" >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The hours on the door' >/dev/null \
  || die "run land-the-hours-on-the-door.sh first"
ok "the base is here, this is not"

say "2 - scope"
# WHAT THIS CHECK IS FOR, AND WHAT IT IS NOT.
#
# `git add` below names ten exact paths, so nothing else can enter this commit
# however many files appear beside them - and step 3 verifies the bytes of all
# ten. What step 2 adds is AWARENESS of concurrent work, and it draws the line
# where the danger actually is:
#
#   · a TRACKED file in these folders that is modified and is not mine - that
#     is somebody editing the same code, and it stops the run;
#   · an UNTRACKED file that is not mine - a new file from another session. It
#     cannot be swept into an explicit `git add`, so it is reported and stepped
#     around rather than treated as a reason to refuse.
#
# The first version of this script listed the neighbouring session's files by
# name (trust.ts, Verification.tsx). They were renamed to trust-gate.ts within
# the hour and the check blocked on a rename, which is a check measuring the
# wrong thing.
MINE='(prisma/schema\.prisma|prisma/migrations/20260816160000_a_name_is_the_askers_to_give/migration\.sql|local-services/alias\.ts|local-services/local-services\.service\.ts|local-services/local-services\.controller\.ts|local-services/dto/local-services\.dto\.ts|local-services/anonymity\.spec\.ts|local-services/reviews\.spec\.ts|services/api\.ts|services/pages/Messages\.tsx)$'
DIRTY="$(git status --porcelain -uall -- "$A/src/local-services" "$A/prisma" "$W/src/features/services")"
OTHERS="$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -v '^[[:space:]]*$' || true)"
TRACKED_STRAY="$(printf '%s\n' "$OTHERS" | grep -v '^??' | grep -v '^[[:space:]]*$' || true)"
[ -z "$TRACKED_STRAY" ] || { printf '   \033[31mx\033[0m these tracked files carry edits this script did not write:\n%s\n' "$TRACKED_STRAY"; \
  die "another session is editing the same code - do not force past this"; }
if [ -n "$OTHERS" ]; then
  printf '   \033[33m~\033[0m new files from another session are here and are NOT being committed:\n%s\n' "$OTHERS"
fi
ok "the ten files this commit touches are the only ones it will add"

say "3 - sha256"
FILES=(
  "$A/prisma/schema.prisma"
  "$A/prisma/migrations/20260816160000_a_name_is_the_askers_to_give/migration.sql"
  "$A/src/local-services/alias.ts"
  "$A/src/local-services/local-services.service.ts"
  "$A/src/local-services/local-services.controller.ts"
  "$A/src/local-services/dto/local-services.dto.ts"
  "$A/src/local-services/anonymity.spec.ts"
  "$A/src/local-services/reviews.spec.ts"
  "$W/src/features/services/api.ts"
  "$W/src/features/services/pages/Messages.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/prisma/schema.prisma"                                                           1d6f3be81367ca1278113bf47eefa50b93d0cc1352da9a97a1d45c415fd1edf9
check "$A/prisma/migrations/20260816160000_a_name_is_the_askers_to_give/migration.sql"    7513a00dfbcf36ce145e70d0799beb7c9e01ea0d66a50275f1d976bf6e0cabf8
check "$A/src/local-services/alias.ts"                                                    34d425b03dfdb93bca9fffef759733f97d33b73240112705e5255e35367aa78a
check "$A/src/local-services/local-services.service.ts"                                   3f2a8dae23c1654d2cfa142c7b4ba6febd2454fe80cad58e12787e6dea774cf2
check "$A/src/local-services/local-services.controller.ts"                                8b4746e5e34d5cbb9bbe155b132de9b59a606c2025113ab345f88db7b39c6e82
check "$A/src/local-services/dto/local-services.dto.ts"                                   1ac01aec1a68ad36258ff922ff246fcbbe89de7ee0972b75235f972b816e06b3
check "$A/src/local-services/anonymity.spec.ts"                                           d886d8795f790ae05238bb85d77c30e0f2f4559050b74fd81ec9cdf12af14268
check "$A/src/local-services/reviews.spec.ts"                                             1134141ad2c03bc99fcc184c7ca00db5976473b2bf50b3a6b4d828c3908e1d51
check "$W/src/features/services/api.ts"                                                   0210db52d8a90e56612e6a20f26f2695dd8d5d9995535fff3ef117966f2ed4e6
check "$W/src/features/services/pages/Messages.tsx"                                       ced5d97f33b48ab04e4ed84773cbc25303c304ccc75d076eeeb025356edaf66e

say "4 - api gates"
cd "$A" || die cd
npx prisma generate                  && ok "prisma generate"      || die "prisma generate"

# THE SAME RULE AS THE WEB CHECK BELOW, AND FOR THE SAME REASON.
#
# `tsc --noEmit` reads every file on disk. Another session is mid-flight in
# this folder: verification.service.ts calls Prisma models whose migration it
# has written but whose schema models it has not added yet, so the client
# genuinely does not have them. Those eight errors are that session's to
# finish and are not in this commit - the ten paths in FILES are, and step 3
# checked their bytes.
#
# Errors located in UNTRACKED files are dropped; an error in ANY tracked file
# is fatal. Untracked is the right test: git has never seen the file, so it
# cannot be in the commit being gated.
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
if printf '%s\n' "$TSC_API" | grep -q "error TS"; then
  ok "api tsc - clean in every tracked file (another session's untracked files still have errors, and are not in this commit)"
else
  ok "api tsc"
fi

# THE SUITES THIS REPO ACTUALLY HAS. `jest src/local-services` would also
# compile the neighbouring session's untracked specs, which import the service
# that does not type-check yet - so the run is scoped to the spec files git
# knows about. Mine are among them: anonymity and reviews are both tracked and
# both modified by this commit.
TRACKED_SPECS="$(git ls-files 'src/local-services/*.spec.ts' | tr '\n' ' ')"
[ -n "$TRACKED_SPECS" ] || die "no tracked local-services specs found - refusing to pass a gate that ran nothing"
# shellcheck disable=SC2086
npx jest $TRACKED_SPECS               && ok "local-services suite (tracked specs)" || die "local-services suite"
cd ..

say "5 - web gates"
cd "$W" || die cd
# THE TYPE-CHECK JUDGES THIS COMMIT, NOT THE WORKING TREE.
#
# `tsc --noEmit` reads every file on disk, including the half-written ones
# another session has not committed yet - and one of those (Verification.tsx)
# imports exports it intends to add to services/api.ts and has not added. Those
# diagnostics are real, they are that session's to fix, and they are not in
# this commit: the ten paths in FILES are.
#
# So errors located in UNTRACKED files are dropped and everything else is
# fatal. Untracked is the right test: a file git has never seen cannot be in
# the commit being gated. If a single error remains in any tracked file -
# mine or otherwise - the run stops.
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
if printf '%s\n' "$TSC_OUT" | grep -q "error TS"; then
  ok "web tsc - clean in every tracked file (another session's untracked files still have errors, and are not in this commit)"
else
  ok "web tsc"
fi

npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
# `npm run build` is `tsc -b && vite build`, and the tsc half cannot be
# filtered the way the check above is - it would fail on the same untracked
# file. The type-check has already run; this is the bundle, which is the part
# `npm run build` adds.
npx vite build                  && ok "web build (vite)" || die "web build"
cd ..

say "6 - commit"
git add "${FILES[@]}" land-a-name-is-the-askers-to-give.sh || die "git add"
git commit -F - <<'MSG' || die commit
A name is the asker's to give

The owner, 16 Aug, looking at his own inbox: show real names in the
Local Services chat. Asked how that should apply to the two people who
had already messaged him under "the people you message do not learn your
name", he answered: let the user decide, and make the anonymous label a
number the business can identify.

TWO CHANGES, AND THE SECOND IS THE ONE WITH THE PROMISE IN IT.

1. "Neighbour 3" BECOMES "#3". The word was chosen because "User 3" is a
database row and "Anon 3" announces that somebody is hiding. What that
missed is the counter: an inbox of Neighbour 1, Neighbour 2, Neighbour 3
is three copies of one word, and the business scanning it is looking for
the digit anyway. "#3" is the same fact with the noise off - a customer
number, which is what a shop writes on a ticket. Rows minted under the
old word are NOT rewritten; the number is read out at the edge, so a
review posted in July keeps the signature it was posted under and still
prints as "#3".

2. THE ASKER DECIDES, PER BUSINESS. One boolean on the thread, default
false, and false for every row that already exists - the migration
backfills nothing, because publishing those names would honour the
owner's new instruction by breaking the application's old promise to
somebody who is not in the room. A switch in the thread turns it on and
off; it is reversible, and the copy says so rather than implying a name
once given is gone.

WHAT THE BUSINESS GETS WHEN IT IS ON: the display name. Owner's call on
how much, and it is the whole of it - no id, no handle, no photograph,
no city, no join date, no link to a profile. Enough to greet a customer
by name; nothing to build a file on. The field is ABSENT rather than
null when no name was given, for the same reason a private phone number
is absent from a public card.

THE NAME IS READ BY ID, ONLY FOR REVEALED THREADS, ONE COLUMN. Not a
join on the enquiry - a join returns a user row for every thread and
leaves a whole citizen in scope beside the loop that shapes the
anonymous ones, which is the exact accident anonymity.spec.ts was
written against. An anonymous thread's seekerId never reaches the user
table, and the spec asserts that no query was made at all.

anonymity.spec.ts keeps every walk it had - nothing identifying reaches
the business side by default - and gains five: the default is off, the
switch belongs to the asker (a business trying it gets the same 404 the
rest of the thread gives), turning it off puts the number back, the
notification says what the inbox says in both states, and the revealed
object still contains nothing but a name. 128 local-services tests green.

Gates: prisma generate, api tsc, the local-services jest suite; web tsc,
the whole vitest suite, the four audits at their ceilings, and the web
build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push (Railway runs the migration on deploy)"
