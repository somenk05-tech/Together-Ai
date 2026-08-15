#!/usr/bin/env bash
# land-the-daybook-4.sh  ·  run from the REPO ROOT
#
# Supersedes land-the-daybook-3.sh, which passed every API gate (652 tests)
# and stopped at web vitest on three failures - all three mine, and all three
# worth the stop:
#
#  1. A REAL DEFECT IN THE PAGE. `failure-states.test.ts` caught DayPage.tsx
#     reading `day.data` and branching on `day.isLoading` while never asking
#     whether the request FAILED. On a failed request `data` is undefined, so
#     every `?? []` below reports "Nothing down yet" - the city telling
#     somebody that a day they lived and wrote is blank. That is the one
#     sentence a diary may not say by accident. There is an isError branch
#     now: nothing has been lost, we could not reach it, try again.
#  2. THE CALENDAR'S OLD DOCSTRING. The page was rewritten into My Daybook and
#     its file-level comment still described the Master Calendar - "every
#     hub's scheduled items in one view" - which is exactly the promise the
#     test bans, and exactly the comment that survives a rewrite. Rewritten to
#     describe what the file now is.
#  3. A GUARD READING ITS OWN PROSE. "it does not grade the day" searched the
#     whole file for `score`, and the first thing it found was the page's
#     docstring saying it does not score the day. A rule that fails when you
#     write the rule down is a rule people delete, so anything banning a WORD
#     now runs against the code with comments stripped - the same helper
#     `failure-states.test.ts` earned the same way. The two structural
#     assertions (`day.isError` present, and the honest line beside it) are new
#     in that file, so the fix cannot quietly rot back.
#
# Three files changed; the other sixteen hashes are the ones the earlier
# scripts already verified.
#
# Its predecessor stopped at the API jest gate on a test of MINE - and on the
# test rather than on the code. `month()` asks for a date RANGE (gte/lte over
# YYYY-MM-DD strings), and the in-memory double in the spec only understood an
# exact date, so it matched nothing and reported `items: 0` while the service
# was correct.
#
# The one before that stopped at its own scope guard on
# `?? together-city-chat/src/daybook/`: git reports an untracked DIRECTORY as
# the directory itself with a trailing slash and no filename, and the
# allowlist below was written expecting the files inside it.
#
# The owner, 15 Aug, on the empty Master Calendar: "I would not make it a
# conventional calendar with events inside boxes. I would turn the calendar
# into a private personal daybook... The calendar doesn't just tell you what
# happened. It becomes the record of your day."
#
# PHASE 1: the spine. FEEL, DO, WRITE, and Mira reading one day. Memories with
# media, her creating lines conversationally, and the end-of-day summary are
# phase 2 - the schema is shaped for them and nothing here has to move.
#
# Requires 'A drawer of ones own' (Personal ships the neighbouring rooms) and
# 'She reads the dating thread'.
#
# AFTER LANDING: Railway applies the DayPage/DayItem migration on boot.
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
LOG="$(git log --oneline -80)"
printf '%s\n' "$LOG" | grep 'The daybook' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
# All three predecessors ran, all three stopped at a gate, all three frozen.
rm -f land-the-daybook.sh land-the-daybook-2.sh land-the-daybook-3.sh
printf '%s\n' "$LOG" | grep 'A drawer of ones own' >/dev/null
[ $? -eq 0 ] || die "base commit 'A drawer of ones own' is not here - run land-a-drawer-of-ones-own-2.sh first"
printf '%s\n' "$LOG" | grep 'She reads the dating thread' >/dev/null
[ $? -eq 0 ] || die "base commit 'She reads the dating thread' is not here - run land-she-reads-the-dating-thread.sh first"
ok "both bases are here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/daybook/" "$A/src/mira/" "$A/src/privacy/" "$A/prisma/" "$A/src/app.module.ts" "$W/src/api/daybook.api.ts" "$W/src/features/daybook/" "$W/src/features/calendar/" "$W/src/styles/relief.css" "$W/src/app/router.tsx" "$W/src/app/the-day-is-kept.test.ts" \
  | grep -Ev '(src/daybook/(?:daybook\.(?:service|controller|module)\.ts|the-daybook\.spec\.ts)?|src/mira/(mira\.service\.ts|mira\.controller\.ts|mira\.module\.ts|mira\.service\.spec\.ts)|src/privacy/purge-plan\.ts|prisma/schema\.prisma|prisma/migrations/20260815120000_the_daybook(/|/migration\.sql)|src/app\.module\.ts|src/api/daybook\.api\.ts|src/features/daybook/|src/features/calendar/pages/Calendar\.tsx|src/styles/relief\.css|src/app/(router\.tsx|the-day-is-kept\.test\.ts))$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/prisma/schema.prisma"                                          5bca6ddcbf311a803bd1e12ee9b3dd4423d64b770e90a81f817c1edbd10fe3d0
check "$A/prisma/migrations/20260815120000_the_daybook/migration.sql"    d91a0b79eb5d4f3054c834e029dbb1b9ce153603d3e346ee0ebe8e2effb9852e
check "$A/src/privacy/purge-plan.ts"                                     21357656de9bb9a0d559cfc56f4b092c9195c5d0c57d0d85fd2b4ac339233646
check "$A/src/daybook/daybook.service.ts"                                033a0c769bbe2e3b490ad7e13e5e8d85662274f978c3a17918eafaaef9633eff
check "$A/src/daybook/daybook.controller.ts"                             c0f7ca24d9ba2d393ad34f0ceb9f77465eb7523860e63d06d54e6ff32a47ad26
check "$A/src/daybook/daybook.module.ts"                                 667fa920869dffa19c596dd916072e825b1679994dd72691cadda6024441d77b
check "$A/src/daybook/the-daybook.spec.ts"                               614409843812711b79b1d6757059c226a59cf476afb131bd53049cca9796b86c
check "$A/src/mira/mira.service.ts"                                      5401c5a678af25e8f31cdc8d8db0ecd8be4dc6a360fd5b9eb5e6e59995cc84dc
check "$A/src/mira/mira.controller.ts"                                   3905dfaa7986bc269c633f32b180d7994522e8a66e277bf192d948d5bfda954c
check "$A/src/mira/mira.module.ts"                                       bc58f6e8c9f1f98188654cb7590e2fe8e2aaa9e169b2fef7041cf9db590cf34c
check "$A/src/mira/mira.service.spec.ts"                                 4b6754327a1709c7fae69e152145f98071162c795941c1de9b89134b9c061abd
check "$A/src/app.module.ts"                                             37a4fe6e8196f7db365e1d8f6b943860fd3d3e6cffeab2d74aa4a7f74cf37053
check "$W/src/api/daybook.api.ts"                                        53f0ea52347387e9a01ad1cd0539ea0b911e032c69e18cd584a1b46a6175e3e4
check "$W/src/features/daybook/pages/DayPage.tsx"                        7be99e1ad4f5aec1e5b4297c42fb1eec18b71bfc4a047aaf520ad85275bef310
check "$W/src/features/daybook/MiraDay.tsx"                              1453118fcf0503cb24fb3958777e01c729b38e241469f51173b689d05af08f5f
check "$W/src/features/calendar/pages/Calendar.tsx"                      5969689e2bc22c3b78a07e80991f91eac4537697635a707d7e1a5dc7d6b53de7
check "$W/src/styles/relief.css"                                         89c269473b2c852bd1be46ecd4d45e375103fea7c8de2b00f78d902f81e4cddf
check "$W/src/app/router.tsx"                                            f8f26948cac82fc4376181b1a6c267d291bf176a6fa40cb2dc7a67ac2ae15664
check "$W/src/app/the-day-is-kept.test.ts"                               aa46fe705bdd8bb745c1f4c17e6b5c683e59217215c8b3558a235eaba7894502

say "4 - api gates"
cd "$A" || die cd
npx prisma validate                    && ok "prisma validate" || die "prisma validate"
npx prisma generate                    && ok "prisma generate" || die "prisma generate"
npx tsc --noEmit                       && ok "api tsc"         || die "api tsc"
npx jest src/mira src/privacy src/daybook --silent && ok "api jest" || die "api jest"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build                          && ok "api build"       || die "api build"
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
say "   reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "6 - commit"
git add "$A/prisma/schema.prisma" \
        "$A/prisma/migrations/20260815120000_the_daybook/migration.sql" \
        "$A/src/privacy/purge-plan.ts" \
        "$A/src/daybook/daybook.service.ts" \
        "$A/src/daybook/daybook.controller.ts" \
        "$A/src/daybook/daybook.module.ts" \
        "$A/src/daybook/the-daybook.spec.ts" \
        "$A/src/mira/mira.service.ts" \
        "$A/src/mira/mira.controller.ts" \
        "$A/src/mira/mira.module.ts" \
        "$A/src/mira/mira.service.spec.ts" \
        "$A/src/app.module.ts" \
        "$W/src/api/daybook.api.ts" \
        "$W/src/features/daybook/pages/DayPage.tsx" \
        "$W/src/features/daybook/MiraDay.tsx" \
        "$W/src/features/calendar/pages/Calendar.tsx" \
        "$W/src/styles/relief.css" \
        "$W/src/app/router.tsx" \
        "$W/src/app/the-day-is-kept.test.ts" \
        land-the-daybook-4.sh || die "git add"
git commit -F - <<'MSG' || die commit
The daybook

"I would not make it a conventional calendar with events inside boxes. I
would turn the calendar into a private personal daybook... The calendar
doesn't just tell you what happened. It becomes the record of your day."
- the owner, 15 Aug.

WHAT WAS ACTUALLY THERE. The Master Calendar was a grid with nothing
behind it: `const activities: Activity[] = []`, hardcoded, waiting for hub
bookings that were never wired in, under a subtitle promising "flights,
tables, tests, workouts and dates - every hub in one view". It had no API,
no model and no data, and it had been telling that story on a blank month
for a while. The owner's answer is better than going to fetch the
bookings: a calendar tells you what is SCHEDULED, and what people want is
the record of the day.

So the grid becomes the MAP and the day becomes the PLACE. Every date is a
door now; the month shows a mark for a day that holds something - a count
of its lines, a dot if it was written in - and never what it says, because
a diary you can read over a shoulder from across the room is not private.
Opening a day is a second, deliberate act.

A DAY, IN THE ORDER A DAY IS LIVED. How it felt (a mood you can take back,
and a line about it if there is one). What was on it - to-dos, meetings,
reminders, appointments, each with a time or honestly without one, because
most of what people mean to do has no hour. What you want to remember: a
page to write on, hairline-ruled rather than boxed, private and said to be
private. And Mira at the foot of it, who can read that ONE day back to
you.

MIRA READS ONE DAY, AND SHE READS IT FROM THE RECORD. Unlike the chat
confidant - handed a window of somebody else's words, allowed to keep
none of it - this is the citizen's own page, so the server reads it and
hands her that date alone: not the month, not the neighbouring days, not
her own memory of them. She may not invent a day; an empty page comes back
as an empty page, in code and in the prompt, because confident fiction
about a day somebody actually lived is the one failure a diary's reader
cannot come back from. Metered like every model turn, unmetered when
there is nothing there to read.

AND IT DOES NOT SAY THE DAY IS EMPTY WHEN IT SIMPLY COULD NOT READ IT.
The first version of this page branched on loading and on data and never
on failure, which meant a dropped request rendered "Nothing down yet" over
a day somebody had written - a claim about their own record that had never
been checked. Of every empty state in the city this is the worst one to
say by mistake, so failure is now a state of its own, and it says the
opposite out loud: nothing has been lost, we could not reach it, try
again.

WHAT THIS PAGE REFUSES TO DO is most of what a habit app would have done
here. No score. No streak. No "2 of 5 done". No prompt written by the
product pretending to be a thought, and no empty-state cheerleading: a day
with nothing on it says nothing. A diary that grades you is a diary you
stop telling the truth in, and the test file holds that as a rule rather
than a preference.

Both models are purge-classified - a diary goes with the diarist - and the
date is a plain YYYY-MM-DD string throughout, never an instant: midnight
UTC is the day before for anybody west of Greenwich, and a diary may not
rename somebody's day.

Three things were learned on the way in, all about the tools rather than
the feature. The scope guard met an untracked DIRECTORY, which git reports
as the bare path with a trailing slash rather than as the files inside it,
so an allowlist written in filenames rejects the folder it was meant to
admit. The daybook spec's in-memory double understood an exact date but
not the RANGE `month()` actually queries, so it failed a service that was
right - a fake that only speaks the queries you remembered writing will
fail the ones you did. And a guard that banned the word "score" read the
page's own docstring saying it does not score the day: anything banning a
WORD now runs against the code with the comments stripped, because a rule
that fails when you write the rule down is a rule somebody deletes.

PHASE 1. Memories with photographs, voice notes and places; Mira creating
lines conversationally ("remind me to call Rahul at 5"); the end-of-day
summary she offers to write; tomorrow's preview - all of it is the next
turn, and the schema is shaped so none of this has to move for them.
MSG
ok committed
say "review, then:  git push"
