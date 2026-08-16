#!/usr/bin/env bash
# land-a-workout-has-a-place.sh  ·  run from the REPO ROOT
#
# Owner, 17 Aug: "Make this log user based, let user add details of workout
# style home gym sports and the duration..."
#
# ASKED WHAT "USER BASED" MEANT, because the log already only ever returned the
# caller's own rows - `log(userId)` has been scoped since it was written - so
# the phrase had to mean something the FORM could not do. He chose: LET ME EDIT
# AND DELETE ENTRIES. And asked which styles, he chose five rather than the
# three he typed: home, gym, sports, studio, outdoor.
#
# THE STYLE IS THE EASY HALF.
# One nullable column. NULLABLE IS THE DESIGN: every row logged before tonight
# was written without anybody being asked where the work happened, and a DEFAULT
# would file hundreds of past sessions in a room the citizen never named. NULL
# means "not asked", the page prints nothing for it, and pressing the chip you
# are already on clears it - so "I would rather not say" stays reachable.
#
# It is deliberately NOT the training profile's `place`, which stays home|gym.
# That one INSTRUCTS the session engine, which can only program the two rooms it
# has movements for. This one RECORDS what happened, and "five-a-side on
# Tuesday" is a real answer to that question and not to the other one.
#
# THE HALF WORTH A SPEC IS THE OTHER ONE.
# This log just grew its first two DESTRUCTIVE routes, and a destructive route
# that takes an id out of a URL is exactly the shape of thing that ends up
# editing somebody else's row. So:
#
#   · The owner is IN THE QUERY, not in a branch: updateMany/deleteMany with
#     `where: { id, userId }`, never findUnique-then-check. There is no window
#     between reading a row and deciding about it, and no branch a later edit
#     can forget to keep.
#   · A stranger's id and a fictional id get THE SAME 404. A 403 for one and a
#     404 for the other is a membership oracle.
#   · A PATCH writes only the keys it was sent. Spreading the dto writes
#     `undefined` over everything it does not carry, which is how correcting a
#     duration silently erases a note.
#   · Neither route is a Mira intent. An assistant that can delete a training
#     history on a misheard word is not a feature anybody asked for.
#
# AND REMOVE ASKS ONCE, IN PLACE - not a browser dialog, which stops the page,
# and not a one-tap delete either, because this list is the only record there is
# of what somebody actually did.
#
# `prisma generate` RUNS FIRST AND IS A GATE, not a pre-check: a new column
# leaves the generated client stale, and that step cannot run in the sandbox
# this was written in (the engine download 403s on linux-arm64). The API tsc
# below is the FIRST typecheck this column gets.
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then rm -f .git/index.lock && ok "cleared an empty index.lock"; fi
git log --oneline -40 | grep 'A workout has a place' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
SCH="$A/prisma/schema.prisma"
MIG="$A/prisma/migrations/20260817020000_a_workout_has_a_place/migration.sql"
FD="$A/src/fitness/dto/fitness.dto.ts"
FS="$A/src/fitness/fitness.service.ts"
FC="$A/src/fitness/fitness.controller.ts"
ASP="$A/src/fitness/a-workout-has-a-place.spec.ts"
WA="$W/src/features/fitness/api.ts"
WP="$W/src/features/fitness/pages/Log.tsx"
WT="$W/src/app/a-workout-has-a-place.test.ts"
for f in "$SCH" "$MIG" "$FD" "$FS" "$FC" "$ASP" "$WA" "$WP" "$WT"; do [ -f "$f" ] || die "missing $f"; done
grep -q 'style     String?' "$SCH"                                    || die "the column is not on the model"
grep -q "WORKOUT_STYLES = \['home', 'gym', 'sports', 'studio', 'outdoor'\]" "$FD" || die "the five styles are not declared"
grep -q 'export const EditWorkoutSchema' "$FD"                        || die "no edit schema"
grep -q 'deleteMany({ where: { id, userId } })' "$FS"                 || die "the delete is not scoped to its owner"
grep -q "@Patch('log/:id')" "$FC"                                     || die "no edit route"
grep -q "@Delete('log/:id')" "$FC"                                    || die "no delete route"
grep -q 'useRemoveWorkout' "$WP"                                      || die "the page cannot remove an entry"
# A shell grep cannot strip comments, and every string these would look for
# appears in the prose explaining WHY the code avoids it. So the ABSENCE checks
# - no findUnique-then-check, no bare update/delete, no `data: { ...dto }`, no
# window.confirm, no Mira intent on a destructive route - live in the two specs,
# which strip comments before they look. That division is the lesson from a grep
# that matched its own comment.
ok "all nine files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(prisma/schema\.prisma|migrations/20260817020000_a_workout_has_a_place|dto/fitness\.dto\.ts|fitness/fitness\.service\.ts|fitness/fitness\.controller\.ts|a-workout-has-a-place\.spec\.ts|features/fitness/api\.ts|features/fitness/pages/Log\.tsx|a-workout-has-a-place\.test\.ts|land-a-workout-has-a-place\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - the API gates"
cd "$A"
npx prisma generate || die "prisma generate - a new column needs it before anything typechecks"
ok "prisma client regenerated"
npx tsc --noEmit || die "api tsc"
ok "api tsc clean"
npx jest src/fitness/a-workout-has-a-place.spec.ts || die "the workout-log spec"
ok "the log's own spec passes"
npx jest src/fitness src/shared/one-body-one-number.spec.ts src/shared/one-day-one-number.spec.ts \
  || die "the fitness and cross-hub specs"
ok "fitness + the two one-number guards green"
EXPECTED_RED="src/dev/dev.spec.ts src/security/query-scoping.spec.ts src/security/route-reach.spec.ts src/security/runtime-isolation.spec.ts src/shared/swallow.spec.ts src/shared/unbounded-reads.spec.ts src/shared/voice-scan.spec.ts "
OUT="$(npx jest 2>&1 || true)"
RED="$(printf '%s\n' "$OUT" | grep -E '^[[:space:]]*FAIL ' | awk '{print $2}' | sort -u | tr '\n' ' ')"
if [ "$RED" != "$EXPECTED_RED" ]; then
  printf '%s\n' "$OUT" | tail -60
  printf '\n   expected red: %s\n   actually red: %s\n' "$EXPECTED_RED" "$RED"
  die "the API suite's failing set changed - this commit is answerable for the difference"
fi
note "7 suites red on main, and still exactly those 7 - query-scoping and route-reach included, which are the two this change would have moved if the new routes were wrong"
cd ..

say "4 - the web gates"
cd "$W"
npx tsc --noEmit || die "web tsc"
ok "web tsc clean"
npx vitest run src/app/a-workout-has-a-place.test.ts || die "the log guard"
npx vitest run src/app/the-session-is-built-not-looked-up.test.ts src/app/one-energy.test.ts \
               src/app/activity-scale.test.ts src/app/citizen-facing-copy.test.ts \
               src/app/tap-targets.test.ts \
  || die "the fitness / copy / target guards"
ok "the log guard and its five neighbours pass"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
DEAD="$(node scripts/dead-export-audit.mjs --list 2>&1 | grep -E '^\s+features/' | awk '{print $2}' | sort | tr '\n' ' ')"
[ "$DEAD" = "MedicalAdvisories PlanGuidanceBanner useGemCommission " ] || die "dead exports changed: $DEAD"
ok "lint, nav, a11y, motion, dead-export all at ceiling"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "5 - commit"
git add "$SCH" "$MIG" "$FD" "$FS" "$FC" "$ASP" "$WA" "$WP" "$WT" land-a-workout-has-a-place.sh
git commit -q -m "A workout has a place, and an entry has an owner

Owner: 'make this log user based, let user add details of workout style home gym
sports and the duration.' The log already returned only the caller's own rows,
so 'user based' had to mean something the form could not do - asked, he chose
editing and deleting entries, and five styles rather than the three he typed:
home, gym, sports, studio, outdoor.

One nullable column, and nullable is the design. Every row logged before tonight
was written without anybody being asked where the work happened, and a default
would file hundreds of past sessions in a room the citizen never named. NULL
means not asked, the page prints nothing for it, and pressing the chip you are
already on clears it. It is deliberately not the training profile's 'place',
which stays home|gym: that one instructs the session engine, which can only
program the two rooms it has movements for, and this one records what happened.

THE HALF WORTH A SPEC IS THE OTHER ONE. This log just grew its first two
destructive routes, and a destructive route that takes an id out of a URL is
exactly the shape of thing that ends up editing somebody else's row.

The owner is in the QUERY, not in a branch: updateMany/deleteMany with
where { id, userId }, never findUnique-then-check - no window between reading a
row and deciding about it, and no branch a later edit can forget. A stranger's
id and a fictional id get the same 404, because a 403 for one and a 404 for the
other is a membership oracle. A PATCH writes only the keys it was sent;
spreading the dto writes undefined over everything it does not carry, which is
how correcting a duration silently erases a note. And neither route is a Mira
intent - an assistant that can delete a training history on a misheard word is
not a feature anybody asked for.

Remove asks once, in place: not a browser dialog, which stops the page, and not
a one-tap delete, because this list is the only record of what somebody did.

Every mutation returns the recounted week, so the total and the row that changed
can never disagree - which is the reason this was asked for. A mistyped
300-minute session was in the week's total forever." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
say "NOTE: a new column. Railway must run 20260817020000_a_workout_has_a_place on deploy."
