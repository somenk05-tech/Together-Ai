#!/usr/bin/env bash
# land-the-session-is-built-not-looked-up.sh  ·  run from the REPO ROOT
#
# Owner's brief, 16 Aug: the workout should be recalculated from the citizen's
# profile, goal, nutrition, activity and recovery - and it should say WHY
# today's session looks like this. This is the first of the four builds that
# brief describes, and it is the one the other three stand on.
#
# THE DEFECT UNDERNEATH THE BRIEF, WHICH MATTERED MORE THAN IT.
# The Workout page built the session in the BROWSER from three hardcoded tables
# and seven inputs, five of them useState that reset on reload. It read no
# saved training profile, no body goal, no lab, and NO DECLARED CONDITION - so
# a citizen who had told us about joint pain was handed Jump squats and
# Burpees, while the weekly-plan engine three screens away was correctly
# swapping their cardio for something low-impact. The safety tests in
# session-engine.spec.ts are first in the file for that reason, and one of them
# sweeps all fifteen combinations of the four declarable conditions.
#
# FOUR RULES, EACH ONE A WAY THE OLD PAGE WAS WRONG:
#
#  1. THE BODY GOAL SETS THE CHARACTER OF THE WORK. Not the nutrition goal -
#     that decides what is eaten. shared/energy.ts settled this for calories in
#     August, in the sentence still standing above GOAL_DELTA: "a goal's
#     character lives in its protein, macros and TRAINING EMPHASIS, not in a
#     rival calorie policy". This is the training-emphasis half, and the page
#     had it backwards: FoodPref.goal chose the rep ranges.
#  2. SAFETY IS A FILTER, NOT A CAPTION. A condition removes movements from the
#     pool before anything is chosen, and each movement names its own stand-in
#     so the session does not come up short - and every swap is shown, because
#     a citizen quietly handed an easier movement has been managed, not trained.
#  3. NEVER COMPENSATE WITH MORE EXERCISE. The owner's own line. When the
#     ceiling is down, or the week is already heavy, the session gets SHORTER
#     and says so. Fat loss plus low movement is answered with WALKING, which
#     is activity without recovery cost - not with a harder session.
#  4. IT SAYS WHAT IT DID NOT KNOW. why.missing names the inputs nobody was
#     asked for, with the way to give them, so "personalised" is a claim the
#     page can back.
#
# AND THE 743 MOVES NOW. The burn was kcalWorkout(WORKOUT_MIN) - the constant
# 60 - so choosing 45 or 90 minutes changed the routine and left the goal, the
# three tiles and the heading all saying sixty.
#
# NEW COLUMNS, and the owner chose to ASK rather than infer: equipment, days a
# week, a free-text limitation, and a usual place and length. Empty is not
# "nothing" anywhere - 'none' is how somebody says they train with nothing, and
# empty means we never asked. The engine reports the difference.
#
# ONE LANDED GUARD MOVES, AND IT CAUGHT THIS COMMIT FIRST.
# one-day-one-number.spec asserted that `this.nutrition.targets(userId)` appears
# exactly ONCE in fitness.service.ts - written this morning, when there was one
# consumer. GET /fitness/session is a second, and a SEPARATE request. The rule
# it was defending is "one read per request": a screen showing a calorie figure
# from one read and a protein figure from another, taken either side of somebody
# editing their profile. Two requests each reading once is not that. So the
# count moved onto the METHOD, where the rule lives, and kept its teeth - a
# third caller fails the total, a second read inside either method fails its own.
#
# `prisma generate` RUNS FIRST and is a gate, not a pre-check: five new columns
# leave the generated client stale, and that step cannot run in the sandbox
# this was written in (engine download 403s on linux-arm64). So the API tsc
# below is the FIRST typecheck these columns get; session-engine.spec was run
# with ts-jest diagnostics off - 18 passing - which is honest about what was
# and was not proved before it reached your machine.
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
git log --oneline -40 | grep 'The session is built, not looked up' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
SCH="$A/prisma/schema.prisma"
MIG="$A/prisma/migrations/20260817010000_a_session_of_ones_own/migration.sql"
LIB="$A/src/fitness/exercise-library.ts"
ENG="$A/src/fitness/session-engine.ts"
ESP="$A/src/fitness/session-engine.spec.ts"
FS="$A/src/fitness/fitness.service.ts"
FC="$A/src/fitness/fitness.controller.ts"
FD="$A/src/fitness/dto/fitness.dto.ts"
WA="$W/src/features/fitness/api.ts"
WP="$W/src/features/fitness/pages/Workout.tsx"
PP="$W/src/features/fitness/pages/Profile.tsx"
WT="$W/src/app/the-session-is-built-not-looked-up.test.ts"
ODS="$A/src/shared/one-day-one-number.spec.ts"
for f in "$SCH" "$MIG" "$LIB" "$ENG" "$ESP" "$FS" "$FC" "$FD" "$WA" "$WP" "$PP" "$WT" "$ODS"; do [ -f "$f" ] || die "missing $f"; done
grep -q 'export function buildSession' "$ENG" || die "no session engine"
grep -q "@Get('session')" "$FC" || die "no /fitness/session route"
grep -q 'equipment  String   @default' "$SCH" || die "the training set-up columns are not on the model"
# THESE TWO GREPS LOOK FOR CODE, NOT FOR WORDS, and the first run of this
# script is the reason. `grep -q 'HOME_PLANS'` matched the comment that
# EXPLAINS the table's removal — a shell grep cannot strip comments, and the
# guard test that can (the-session-is-built-not-looked-up.test.ts) passes on
# the same file. So the shape is the check: a declaration, and a table row.
grep -q 'const HOME_PLANS' "$WP" && die "an exercise table is still in the page"
grep -qE "n: 'Burpee|n: 'Jump squat" "$WP" && die "a movement is still hardcoded in the page"
grep -q 'useTodaySession(dur, loc)' "$WP" || die "the page does not ask the server for the session"
grep -q "const readsIn = (name: string)" "$ODS" || die "one-day-one-number still counts reads file-wide"
ok "all thirteen files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(prisma/schema\.prisma|migrations/20260817010000_a_session_of_ones_own|fitness/exercise-library\.ts|fitness/session-engine\.ts|fitness/session-engine\.spec\.ts|fitness/fitness\.service\.ts|fitness/fitness\.controller\.ts|fitness/dto/fitness\.dto\.ts|features/fitness/api\.ts|features/fitness/pages/Workout\.tsx|features/fitness/pages/Profile\.tsx|the-session-is-built-not-looked-up\.test\.ts|shared/one-day-one-number\.spec\.ts|land-the-session-is-built-not-looked-up\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - the API gates"
cd "$A"
npx prisma generate || die "prisma generate - five new columns need it before anything typechecks"
ok "prisma client regenerated"
npx tsc --noEmit || die "api tsc"
ok "api tsc clean"
npx jest src/fitness/session-engine.spec.ts || die "the session engine spec"
ok "the session engine passes (18 tests, incl. all 15 condition combinations)"
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
note "7 suites red on main, and still exactly those 7 - route-reach included, which means /fitness/session IS reached by the web app"
cd ..

say "4 - the web gates"
cd "$W"
npx tsc --noEmit || die "web tsc"
ok "web tsc clean"
npx vitest run src/app/the-session-is-built-not-looked-up.test.ts || die "the session guard"
npx vitest run src/app/one-energy.test.ts src/app/two-fitness-questions.test.ts \
               src/app/activity-scale.test.ts src/app/citizen-facing-copy.test.ts \
  || die "the fitness / energy / copy guards"
ok "the session guard and its four neighbours pass"
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
git add "$SCH" "$MIG" "$LIB" "$ENG" "$ESP" "$FS" "$FC" "$FD" "$WA" "$WP" "$PP" "$WT" "$ODS" land-the-session-is-built-not-looked-up.sh
git commit -q -m "The session is built, not looked up

The Workout page built the workout in the browser, from three hardcoded tables
and seven inputs - five of them useState that reset on reload. It read no saved
training profile, no body goal, no lab, and no declared condition, so a citizen
who had told us about joint pain was handed Jump squats and Burpees while the
weekly-plan engine three screens away gave them low-impact cardio.

Today's session is now built server-side from the saved profile, the body goal,
the declared conditions AND the ones in the medical records, the intensity
ceiling the plan engine derives from the labs, Nutrition's day, and the week's
own logged minutes. None of that is new data - every one was already computed
and already on a screen. The gathering is the feature.

Four rules, each one a way the old page was wrong. The BODY goal sets the
character of the work, not the nutrition goal - the training-emphasis half of
what energy.ts settled for calories in August. Safety is a filter, not a
caption: a condition removes movements before anything is chosen, each names
its own stand-in, and every swap is shown. Nothing answers a constraint with
more exercise - a lowered ceiling or a heavy week makes the session SHORTER,
and fat loss with low movement is answered with walking. And it says what it
did not know, with the way to give it.

The burn moves too: it was kcalWorkout(60) whatever the citizen chose.

Five new columns, asked for rather than inferred at the owner's word -
equipment, days a week, a free-text limitation, a usual place and length. Empty
is never 'nothing': 'none' is an answer and empty means we never asked.

one-day-one-number moves its count from the file to the method. It asserted one
read of nutrition.targets in fitness.service.ts, written when there was one
consumer; the session is a second and a separate request. The rule was always
one read PER REQUEST - a screen mixing two reads taken either side of an edit -
and it still fails a third caller or a second read inside either method." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
say "NOTE: five new columns. Railway must run the migration on deploy."
