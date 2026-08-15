#!/usr/bin/env bash
# land-the-looking-back-page-2.sh  ·  run from the REPO ROOT
#
# Supersedes land-the-looking-back-page.sh, which passed every gate and then
# stopped at web vitest on ONE assertion - relief.spec's five-depths guard, and
# it was right. The new pill's :active state was written by eye against a black
# face (`inset 0 2px 5px rgba(0,0,0,.45)`) rather than using the pressed depth
# the system already names. That is precisely what that guard is for: one
# component's hand-rolled inset and the next one's are two materials that look
# like one mistake, and nothing else in this repo would ever say so. It is
# `var(--press)` now, and the old rule's `background: var(--well)` stays gone -
# right for a white pill, and it would turn a black one pale under the thumb.
# One line changed; the other ten hashes are the ones the first script verified.
#
# Two owner calls, 15 Aug, and they land together because they touch the same
# stylesheet - relief.css cannot be committed twice:
#
#   "the journal page layout"  + a printed self-reflection sheet
#   "background remains white the button becomes black"  + a glass-lozenge
#   reference for the header's five doors
#
# Requires 'A day can be photographed' and 'One masthead, three lines'.
#
# AFTER LANDING: Railway applies one ALTER TABLE (DayPage.reflection, JSONB,
# nullable - no page already written is touched by it).
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
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The looking-back page' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
# Its predecessor ran and stopped at a gate, so it is frozen.
rm -f land-the-looking-back-page.sh
printf '%s\n' "$LOG" | grep 'A day can be photographed' >/dev/null
[ $? -eq 0 ] || die "base commit 'A day can be photographed' is not here"
printf '%s\n' "$LOG" | grep 'One masthead, three lines' >/dev/null
[ $? -eq 0 ] || die "base commit 'One masthead, three lines' is not here"
ok "both bases are here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/prisma/" "$A/src/daybook/" "$A/src/mira/" \
  "$W/src/api/daybook.api.ts" "$W/src/features/daybook/" "$W/src/styles/relief.css" \
  "$W/src/app/the-day-is-kept.test.ts" "$W/src/app/the-bar-moves-up.test.ts" \
  | grep -Ev '(prisma/schema\.prisma|prisma/migrations/20260815190000_the_looking_back_page(/|/migration\.sql)|src/daybook/(daybook\.(service|controller)\.ts|the-daybook\.spec\.ts)|src/mira/mira\.service\.ts|src/api/daybook\.api\.ts|src/features/daybook/pages/DayPage\.tsx|src/styles/relief\.css|src/app/(the-day-is-kept|the-bar-moves-up)\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/prisma/schema.prisma"                                                    d073ab09c6bf74ea66451c06a1bee67adb11aa4e4a53ad87fd9524b084109169
check "$A/prisma/migrations/20260815190000_the_looking_back_page/migration.sql"    3ae7b54f01921df4a92a7f45a64456df14751f090e904cdc62466bd5458a6a92
check "$A/src/daybook/daybook.service.ts"                                          c7ef91c43ba07b1194acb11f2a2def5507a080b78bbe15d83f3e2650b6f809c0
check "$A/src/daybook/daybook.controller.ts"                                       6b0790cb6aad7fb307d6c18f5558a408a962bc653161dd8d1a2da359475547b8
check "$A/src/daybook/the-daybook.spec.ts"                                         5c7765b143db7c96bde8c21d87d6e1a9cafcafb62d20b57d60f4e49abbe51d96
check "$A/src/mira/mira.service.ts"                                                19244c735126621ea5c55edbba60b8222b7e208d78157d929f715661eb39fbe4
check "$W/src/api/daybook.api.ts"                                                  b50d9c111caa71602ea84f72118a5f3fe03eef91c1d5e96c7d6bae3d41025d48
check "$W/src/features/daybook/pages/DayPage.tsx"                                  9d0e4c90988e6186d741788c89ddc81ba8bb6fbced734d0bd633bcaf8fa048bf
check "$W/src/styles/relief.css"                                                   a13f26b5b0c1b18213743fb628f05ceededc616c21d3d30b36f4c5be18027d10
check "$W/src/app/the-day-is-kept.test.ts"                                         8c6263c71efbaca7fc820280761c28b5b3385001a54c7315686c1754dac62628
check "$W/src/app/the-bar-moves-up.test.ts"                                        be535cfc46e702aea50a02d1fcf3142ada404f77c3c579e516a7f053e09a7617

say "4 - api gates"
cd "$A" || die cd
# generate FIRST: `reflection` does not exist on the client until it runs, and
# two tsc errors that mean "the generated client is one migration behind" look
# exactly like two real ones.
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
cd ..

say "6 - commit"
git add "$A/prisma/schema.prisma" \
        "$A/prisma/migrations/20260815190000_the_looking_back_page/migration.sql" \
        "$A/src/daybook/daybook.service.ts" \
        "$A/src/daybook/daybook.controller.ts" \
        "$A/src/daybook/the-daybook.spec.ts" \
        "$A/src/mira/mira.service.ts" \
        "$W/src/api/daybook.api.ts" \
        "$W/src/features/daybook/pages/DayPage.tsx" \
        "$W/src/styles/relief.css" \
        "$W/src/app/the-day-is-kept.test.ts" \
        "$W/src/app/the-bar-moves-up.test.ts" \
        land-the-looking-back-page-2.sh || die "git add"
git commit -F - <<'MSG' || die commit
The looking-back page

"The journal page layout" - the owner, 15 Aug, with a printed
self-reflection sheet. And, in the same hour, on a reference of a dark
glass lozenge: "background remains white, the button becomes black."

Two changes in one commit because they touch the same stylesheet, and
relief.css cannot be committed twice. They are unrelated and the message
keeps them apart.

── THE SHEET ───────────────────────────────────────────────────────────

A day now has a place to be looked back on, between what you kept of it
and what you write about it: what went well, something you are proud of,
three things you are grateful for, what was difficult, what you can learn
from it, the win, the challenge, tomorrow's focus. And the reference's
1-10, which lives beside the mood words at the top rather than on the
sheet - both are the same question, and a page that asks how the day felt
twice, four sections apart, gets two different answers from one person.

ITS PROMPTS ARE THE PRODUCT'S WORDS ON A PAGE WHOSE WHOLE ARGUMENT IS THAT
THE PRODUCT DOES NOT PUT WORDS THERE. That is survivable, and only under
conditions: they are QUESTIONS and never suggestions, every box is
optional and empty is a real answer, and nothing is counted, chained,
averaged or compared with yesterday. The 1-10 is a feeling and not a mark
- tapping it again takes it back, because a day you cannot un-rate is a
day you rate carefully, which is the opposite of a diary. The test file
holds all of that as rules rather than as taste.

ONE JSON COLUMN, NOT ELEVEN, and the keys are named and validated in the
controller. A reflection sheet's prompts are the part of it most likely to
be reworded, and a product that needs a migration to reword a question
stops rewording its questions. The column merges rather than replaces on
write: eleven answers share it and each is saved alone as somebody tabs
out of a box, so answering "what went well" cannot wipe the three things
they were grateful for - the partial-save bug this page already fixed
once, one level down and invisible until somebody loses an evening.

Mira reads the sheet with the QUESTION each answer was given to, because
an answer read back without its prompt is a sentence with the subject
removed. She is told in as many words that the 1-10 is not a score. And a
day holding nothing but this sheet is no longer a day she calls empty.

── THE BUTTON ──────────────────────────────────────────────────────────

The reference is a dark glass lozenge lit from underneath. The colour in
it - a green rim, an amber bleed - is a hue this city does not own, and
five of these sit on every page in the application, over every hub
photograph and both night surfaces; a green light under a pill would have
to be answered by the cards, the rails and the plates or it reads as a
mistake. What carries with no argument is the OBJECT: one solid dark face,
a lit hairline where the light lands on the top edge, and its own shadow
under it rather than around it. A coloured glow is a light source, and a
light source belongs to a scene rather than to a button.

So: ink face, paper letters, on the same white header. These five were the
palest things up there and are now the firmest, which is what they should
have been from the start - they are the only CONTROLS in the header, and
the twelve district tabs beneath them are text.

THE TWO NIGHT HUBS KEEP THE FACE THEY HAD, and that is the interesting
half. `--ink` and `--card` swap meaning on a night surface, so the same
rule would make five SOLID WHITE lozenges there - and tokens.css spends a
paragraph on why exactly two things in that room may be solid white: the
primary button, whose one job is to be the loudest object on the screen,
and the rail lamp. Five white pills across the top would beat both.
"Black on white" is an instruction about a white page.
MSG
ok committed
say "review, then:  git push"
