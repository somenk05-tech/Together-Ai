#!/usr/bin/env bash
# land-the-hours-on-the-door.sh  ·  run from the REPO ROOT
#
# A business can say which days it is open and at what times, once, and every
# screen works out "open now" from that on the reader's own clock. One
# nullable column, one migration, and no switch anybody has to remember.
#
# THIS ONE HAS A MIGRATION. `prisma generate` runs first below because the
# service writes the new column and the generated client has to know about it
# before tsc can agree - that step cannot run in a sandbox (the engine
# download is blocked), which is why it is gated here rather than pre-checked.
#
# RUN AFTER "A plan needs a result" - or before it; they touch different
# hubs. If land-a-plan-needs-a-result.sh has not been run yet, its four
# supplements files are still sitting modified in the tree and this script
# deliberately does not look at them.
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
git log --oneline -40 | grep 'The hours on the door' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - scope"
# -uall so a new directory (the migration) is named by its file rather than
# collapsed to a folder entry.
STRAY="$(git status --porcelain -uall -- "$A/src/local-services" "$A/prisma" "$W/src/features/services" \
  | grep -Ev '(local-services/hours\.ts|local-services/hours\.spec\.ts|local-services/dto/local-services\.dto\.ts|local-services/local-services\.service\.ts|prisma/schema\.prisma|prisma/migrations/20260816140000_the_hours_on_the_door/migration\.sql|services/hours\.ts|services/hours\.test\.ts|services/HoursEditor\.tsx|services/api\.ts|services/pages/MyBusiness\.tsx|services/pages/BusinessPage\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$A/prisma/schema.prisma"
  "$A/prisma/migrations/20260816140000_the_hours_on_the_door/migration.sql"
  "$A/src/local-services/hours.ts"
  "$A/src/local-services/hours.spec.ts"
  "$A/src/local-services/dto/local-services.dto.ts"
  "$A/src/local-services/local-services.service.ts"
  "$W/src/features/services/hours.ts"
  "$W/src/features/services/hours.test.ts"
  "$W/src/features/services/HoursEditor.tsx"
  "$W/src/features/services/api.ts"
  "$W/src/features/services/pages/MyBusiness.tsx"
  "$W/src/features/services/pages/BusinessPage.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/prisma/schema.prisma"                                                                dbe2de9bed6ce69af5a1df13e65b33182f5b83756896fe45fe36c93feff373c1
check "$A/prisma/migrations/20260816140000_the_hours_on_the_door/migration.sql"                6500a2626510b303c7cd5e9b94c4ac2b17f3b6172bbc492cfa74cfbacedb9113
check "$A/src/local-services/hours.ts"                                                         49a9035674b8e4913c2e7152a72198e85df91da8cf6a14f27c58393f93e5094a
check "$A/src/local-services/hours.spec.ts"                                                    2e4292d1693e74b381a358df79ee56e8013cc5ca9010d0ff9f8832857ab833fa
check "$A/src/local-services/dto/local-services.dto.ts"                                        70596de0a6c22876ae0658417998da4731071e1db76d893fcd4e7d835ac95e77
check "$A/src/local-services/local-services.service.ts"                                        3c9d430a285f9da1088e65f6c0bf306f7e6e9adbf952e11e5642e756ed11bb36
check "$W/src/features/services/hours.ts"                                                      675259f5fce494b053f3b6d42d611965a82b8fe9a38a477b2584ed0d91a717fc
check "$W/src/features/services/hours.test.ts"                                                 490bfc9fb7f897b1aa610df19aac27a45ae3153cbb72992d537c7bbfb299db76
check "$W/src/features/services/HoursEditor.tsx"                                               e334dcc3da61af8929c606d4f19c53655801d8bab8427a83e79665343a5fc006
check "$W/src/features/services/api.ts"                                                        849224fe39c7f25cc402571b51f5dc20ce2c31d293986f0835ff4891eecf1011
check "$W/src/features/services/pages/MyBusiness.tsx"                                          1ea046c729b28d173a88e97b745f5169115d52df2ab3b1fcd48f926ef6d682ac
check "$W/src/features/services/pages/BusinessPage.tsx"                                        30a764622b908c1c3336828ea8bac0d644a9e572133250289345e052c0b5db55

say "4 - api gates"
cd "$A" || die cd
# THE CLIENT FIRST. Without this, tsc reports one error and it is the right
# one: the service writes a column the generated client has not heard of.
npx prisma generate                  && ok "prisma generate"     || die "prisma generate"
npx tsc --noEmit                     && ok "api tsc"             || die "api tsc"
npx jest src/local-services          && ok "local-services suite" || die "local-services suite"
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
git add "${FILES[@]}" land-the-hours-on-the-door.sh || die "git add"
git commit -F - <<'MSG' || die commit
The hours on the door

The owner, 16 Aug: let a business set which days it is open and at what
times, once, and show open or closed on the page. One nullable column,
one migration, and no switch anybody has to remember.

NO MANUAL OPEN/CLOSED TOGGLE, WHICH IS THE WHOLE DESIGN. The obvious
build is a switch the owner flips on the way in and out. Daily Offers
next door already learned what that costs - a flag somebody has to
remember to turn off is one nobody turns off, and a directory full of
shops claiming to be open at 2am is worse than one that says nothing.
Hours are a fact that stays true; a switch is a promise renewed every
morning. So the badge is DERIVED, on the reader's own clock, from the
week set once. Closing for good stays a separate act with its own
button.

NULL IS NOT "CLOSED". Every listing that exists today gets NULL, and
NULL means nobody has told us - so the editor says "hours not set", the
public page shows no badge at all, and the directory keeps showing them.
A page that rendered the absence as a closed week would be putting a
claim in the mouths of every business that never made one. The migration
adds no default and backfills nothing for the same reason: there is no
honest week to invent for somebody else's shop.

THE SERVER OWNS THE FACT, THE BROWSER OWNS THE CLOCK - the same split as
the beauty reorder countdown. Seven rows travel; no open-now flag does,
because a flag baked into a response is wrong the moment a page is left
open, and a page that must refetch to stop saying OPEN at half past
midnight is worse than one that never said it. The rule is eleven lines
and it is compiled on both sides, each with its own test.

AND A CLOSING TIME MAY PRECEDE ITS OPENING TIME. 18:00-01:00 is a real
answer for a kitchen; `from < to` validation would refuse it and teach
people to type 23:59 and mean something else. So a row that wraps is
read as spilling past midnight, "open now" checks yesterday's spill as
well as today's window, and the form says "closes 1:00 am the next
morning" rather than flagging an error. That case is the one this
feature would otherwise get wrong every Saturday night.

Also: the week folds for reading - "Mon-Fri 9:00 am - 6:00 pm", "Sat
10:00 am - 2:00 pm", "Sun Closed" - because seven identical lines is a
table nobody reads and three is the sign in the window. Times are stored
24-hour and printed the way people say them.

Gates: prisma generate, api tsc, the local-services jest suite (62 tests,
10 of them new); web tsc, the whole vitest suite (9 new), the four audits
at their ceilings, and the web build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push (Railway runs the migration on deploy)"
