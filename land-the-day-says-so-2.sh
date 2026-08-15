#!/usr/bin/env bash
# land-the-day-says-so-2.sh  ·  run from the REPO ROOT
#
# Supersedes land-the-day-says-so.sh, which stopped at web vitest on ONE
# assertion - and on the best test in this repo. The day's sections were a
# SECOND disclosure: face, panel, state and aria-expanded, written by hand
# beside `components/ui/Fold.tsx`, which is the city's only one. That test
# counts the implementations by name precisely because a second copy is how one
# of them quietly stops announcing itself to a screen reader. So Fold learned
# the two things it was missing instead - a caller-held open state (the daybook
# shuts a section from its own Save, which a fold holding its own state cannot
# know about) and a control beside the face - and the day page now wears it.
# Callers who pass neither render exactly the DOM they rendered before.
#
# 'The looking-back page' landed while these three files were being written, so
# land-the-looking-back-page-3.sh met its own "already landed" guard and stopped
# - correctly. The work in it is real and unlanded; it needed a commit of its
# own, and this is it. (-3 is deleted below: it ran, so it is frozen.)
#
# The day page went live and came back with three things wrong.
#
#   THE TIME BOX NOW OPENS ON THE TIME IT IS ("the time should start from live
#   time"). An empty time field is where the half-written-time problem came
#   from; a field that opens filled cannot be half-written. Still optional -
#   clear it and the line has no hour, which most lines want.
#
#   "THE BACKEND FUNCTION IS NOT WORKING" was this page refusing its own
#   submit. The line was never added because the time guard stopped it, and
#   nothing said the write itself had failed - so a working API looked broken
#   from the only side that matters.
#
#   AND EVERY SECTION HAS A SAVE THAT SHUTS IT ("all the other tabs need to
#   have a save button and once saved it gets collapsed").
#
# WEB ONLY - three files, no API, no migration.
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
printf '%s\n' "$LOG" | grep 'The day says so' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
rm -f land-the-looking-back-page.sh land-the-looking-back-page-2.sh land-the-looking-back-page-3.sh land-the-day-says-so.sh
printf '%s\n' "$LOG" | grep 'The looking-back page' >/dev/null
[ $? -eq 0 ] || die "base commit 'The looking-back page' is not here"
ok "the base is here, this is not"

say "2 - scope"
# Named file by file, not by directory: another session is working in
# src/api/ and src/features/chat/, and a wider check would stop on their work.
STRAY="$(git status --porcelain -- "$W/src/features/daybook/" "$W/src/styles/relief.css" \
  "$W/src/components/ui/Fold.tsx" "$W/src/app/the-day-is-kept.test.ts" \
  | grep -Ev '(src/features/daybook/pages/DayPage\.tsx|src/styles/relief\.css|src/components/ui/Fold\.tsx|src/app/the-day-is-kept\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/components/ui/Fold.tsx"               3aa04972fb0f6351f0d63af54e35e976f0eef01bc971d7e56b3184b9cdcf8cde
check "$W/src/features/daybook/pages/DayPage.tsx"   9a407135f2b1651a6c56eaf1f70a9184f90cab66bdb60a949fbe77a66451ad1d
check "$W/src/styles/relief.css"                    fea0887fbfc86360bd8e22f74e6a2adf0483486a8b659f3fdfa8d9e46cf8f2d2
check "$W/src/app/the-day-is-kept.test.ts"          c094635e2fd7b0132a5780726ae03142bebb6ae0302a4f9053821c7ef22f062f

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
git add "$W/src/components/ui/Fold.tsx" \
        "$W/src/features/daybook/pages/DayPage.tsx" \
        "$W/src/styles/relief.css" \
        "$W/src/app/the-day-is-kept.test.ts" \
        land-the-day-says-so-2.sh || die "git add"
git commit -F - <<'MSG' || die commit
The day says so when it keeps something

The day page went live and came back with three things wrong, from the
owner, 15 Aug.

"THE BACKEND FUNCTION IS NOT WORKING" was this page refusing its own
submit. A line typed with a half-written time was stopped by the guard
written to protect exactly that case - correctly - but the line was never
added and nothing anywhere said a write had failed, so a working API
looked broken from the only side that matters. The guard clears the
moment the field is valid now, and a failed write says so in the section
it happened in. A button that does nothing and explains nothing is
indistinguishable from a broken product, and it does not matter which one
it actually is.

THE TIME BOX OPENS ON THE TIME IT IS. "The time should start from live
time" - and it fixes the class of bug above rather than the instance: an
empty time field is where a half-written time comes from, and a field
that opens already filled cannot be half-written. Still optional; clear
it and the line has no hour, which most lines want.

EVERY SECTION HAS A SAVE, AND SAVING SHUTS IT. "All the other tabs need
to have a save button and once saved it gets collapsed." Every field here
saved silently when you clicked away, which is invisible - and a page
that never says it kept anything is a page you cannot trust with a diary.
The fix is not a toast that fades: it is the section closing, which is
what a notebook does when you have finished with a page. Its header says
what is inside while shut - the mood and the number, the count of lines,
the count of pictures, how many boxes were answered, how many words - all
facts about what somebody wrote, never a mark and never a fraction of a
target.

TICKS, MOODS AND PICTURES DO NOT WAIT FOR THE BUTTON. They are ACTIONS,
not fields: a tick that needs saving is a tick you can lose by closing a
tab, and nobody in the world expects to save a checkbox. What the button
commits is the boxes somebody types into - and on the sheet, only the
boxes that CHANGED, so pressing Save cannot overwrite an answer written
in another tab with the blank this screen happens to be holding.
AND THE SECTIONS ARE THE CITY'S FOLD, NOT A SECOND ONE. The first version
of this wrote its own - face, panel, state, aria-expanded - and
`a-read-section-folds-itself.test.ts` refused it by name. That test counts
disclosure implementations because a second copy is how one of them
quietly stops announcing itself to a screen reader, and it was right. Fold
learned the two things it was missing: a caller-held open state, because a
section that shuts when its own Save is pressed cannot be told that by a
component holding its own, and a control beside the face, because a button
inside a button is markup no two browsers agree on. A fold that is passed
neither renders exactly the DOM it rendered yesterday.
MSG
ok committed
say "review, then:  git push"
