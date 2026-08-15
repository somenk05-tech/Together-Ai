#!/usr/bin/env bash
# land-a-day-can-be-photographed.sh  ·  run from the REPO ROOT
#
# Two owner calls, 15 Aug:
#   "fix this" — the red "Invalid value" bubble on the day's time field.
#   "also let people attach pictures for the day if they want to save a memory"
#   "make sure everything stored here is stored date wise labeled which is then
#    shown on the calendar" — with a reference of polaroids taped across a month.
#
# Requires 'The daybook'.
#
# AFTER LANDING: Railway applies the DayPhoto migration on boot. The pictures
# go to the PRIVATE vault (the same bucket the health vault and Drive use),
# under a new `daybook/<userId>/` namespace - no new bucket, no new env var.
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
printf '%s\n' "$LOG" | grep 'A day can be photographed' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The daybook' >/dev/null
[ $? -eq 0 ] || die "base commit 'The daybook' is not here - run land-the-daybook-4.sh first"
ok "the base is here, this is not"

say "2 - scope"
# The api/ files are named one by one rather than by their directory: another
# session is working in chat.api.ts and schemas.ts, and a directory-wide check
# would stop this script on somebody else's change.
STRAY="$(git status --porcelain -- "$A/prisma/" "$A/src/privacy/" "$A/src/media/" "$A/src/daybook/" "$A/src/mira/" \
  "$W/src/api/daybook.api.ts" "$W/src/api/media.api.ts" "$W/src/features/daybook/" "$W/src/features/calendar/" \
  "$W/src/styles/relief.css" "$W/src/app/the-day-is-kept.test.ts" \
  | grep -Ev '(prisma/schema\.prisma|prisma/migrations/20260815160000_a_day_can_be_photographed(/|/migration\.sql)|src/privacy/purge-plan\.ts|src/media/storage\.provider\.ts|src/daybook/(daybook\.(service|controller|module)\.ts|the-daybook\.spec\.ts)|src/mira/mira\.service\.ts|src/api/(daybook|media)\.api\.ts|src/features/daybook/pages/DayPage\.tsx|src/features/calendar/pages/Calendar\.tsx|src/styles/relief\.css|src/app/the-day-is-kept\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/prisma/schema.prisma"                                                        fc18836995b370ad6fab344a35d420835c68bf5286381854fd0cfeb5d21a06b0
check "$A/prisma/migrations/20260815160000_a_day_can_be_photographed/migration.sql"     d6daef898ff5ce7301213c4ae3eee2784dbc054552f8d4e49ae17c62de3f810d
check "$A/src/privacy/purge-plan.ts"                                                   ca21b2071e21beb848d959e7ca0ae375da4c39cba1956df778f34d5dbe23d7cb
check "$A/src/media/storage.provider.ts"                                               2f1fc124ce0a40fa67f8e416d07e9fd1a0006e4b270c1ca6c5073ee3a0c7a486
check "$A/src/daybook/daybook.service.ts"                                              ff3eef85f5ea9a14f856e08460ee06fe82762173197b204f6d7522f3a64267c6
check "$A/src/daybook/daybook.controller.ts"                                           abd7ca5ee3634f97a15c3c2ab3ee531392f5ad4b9eb0afde78e4d0fe48773477
check "$A/src/daybook/daybook.module.ts"                                               73f4deae01f28a3a1aff44b134a7f431d7ce922e8e282d52bcea393331de590e
check "$A/src/daybook/the-daybook.spec.ts"                                             cd75dca7133cf5f019fac1acbf60adad416671b81af37a9f461834e8c1ac4f70
check "$A/src/mira/mira.service.ts"                                                    36cc283949c8dc493f17dcaebb3a4862747635b49e030fcba23e301af5270391
check "$W/src/api/media.api.ts"                                                        ac50ccad9c228b3dd4619f8c3daa3bc848e5a053e3a4e530499a1131a4f7b38b
check "$W/src/api/daybook.api.ts"                                                      b04dca8c0c1b4d7b7b05031575011ff3d82fab9631b2999a35822141b354fb12
check "$W/src/features/daybook/pages/DayPage.tsx"                                      7385e06e0df11fddd6a38e8e632fd25b98694ce4170a3e0279f470d27dfd71c0
check "$W/src/features/calendar/pages/Calendar.tsx"                                    6a292902e4cf6be6ddec61bbea90d7a34a7f7dee7c452d1f6c83f79255acfddd
check "$W/src/styles/relief.css"                                                       87110157c780eb9a4f50f04b370eb05f7398e360446241595c9cff9b118caf89
check "$W/src/app/the-day-is-kept.test.ts"                                             8a6bd4039f94b72e5a122e5fe0f3c6f2d81bccff803e9051e5d79c7aa198fdea

say "4 - api gates"
cd "$A" || die cd
# prisma generate FIRST and every time: `dayPhoto` does not exist on the client
# until it runs, and four tsc errors that mean "the generated client is one
# migration behind" look exactly like four real ones.
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
        "$A/prisma/migrations/20260815160000_a_day_can_be_photographed/migration.sql" \
        "$A/src/privacy/purge-plan.ts" \
        "$A/src/media/storage.provider.ts" \
        "$A/src/daybook/daybook.service.ts" \
        "$A/src/daybook/daybook.controller.ts" \
        "$A/src/daybook/daybook.module.ts" \
        "$A/src/daybook/the-daybook.spec.ts" \
        "$A/src/mira/mira.service.ts" \
        "$W/src/api/media.api.ts" \
        "$W/src/api/daybook.api.ts" \
        "$W/src/features/daybook/pages/DayPage.tsx" \
        "$W/src/features/calendar/pages/Calendar.tsx" \
        "$W/src/styles/relief.css" \
        "$W/src/app/the-day-is-kept.test.ts" \
        land-a-day-can-be-photographed.sh || die "git add"
git commit -F - <<'MSG' || die commit
A day can be photographed

"Let people attach pictures for the day if they want to save a memory."
"Make sure everything stored here is stored date wise labeled which is
then shown on the calendar." - the owner, 15 Aug, the second with a
reference of polaroids taped across a month.

THE ONLY REAL DECISION IN THIS COMMIT IS WHICH BUCKET. Every other picture
the city stores wants a permanent public address - a post, a listing, a
menu photo - so every upload path already written returns a public URL, and
that path is one line shorter than the alternative. A photograph somebody
put in their diary is the most private image in this application. It goes
to the private vault under a `daybook/<userId>/` namespace of its own: no
url column anywhere, ownership provable from the key itself, and the only
way to see it is a signed link that dies in minutes and is minted fresh
each time the day is read. The namespace is not decoration - `isOwnHealthKey`
guards three medical routes that accept a client-supplied key, and filing
diary photos under `health/` would mean a key from one feature satisfies
another feature's ownership check.

Two checks on the way in, and neither is optional: the key must be in the
citizen's own namespace, and the object must actually BE there - a browser
PUT that failed silently would otherwise leave a row pointing at nothing,
and a diary showing a broken frame where a memory was is a worse lie than
showing none. Removing a picture deletes the file, not just the row; the
purge plan carries DayPhoto with its storage key, because a deleted account
that leaves its pictures in a bucket is not a deleted account. The location
is stripped in the browser before the bytes leave, through the one module
every upload in the city goes through, because a picture of a Tuesday
afternoon at home carries the coordinates of the home.

THE MONTH BECOMES A SCRAPBOOK. The grid was built to say THAT a day holds
something and never what - a diary you can read over a shoulder from across
the room is not private. The owner's reference moves that line by exactly
one thing: the first picture kept on a day is now pinned to its square,
printed rather than thumbnailed, a degree or two off square. The words do
not move. A photograph glanced at across a room is a memory; a sentence
read across a room is something somebody wrote down in confidence, and the
test file states that distinction rather than leaving it to taste.

MIRA KNOWS A PICTURE EXISTS AND CANNOT SEE IT. She is told the count and
nothing else, and told plainly that she has not been shown them - because a
day holding only a photograph was, for one commit, a day she would have
called empty, and because the failure mode of handing an image count to a
model is a confident description of a picture nobody showed it.

AND THE TIME FIELD STOPS REFUSING THE LINE. A half-typed time - :30 with no
hour, which is what you get by tabbing in and typing the minutes first - is
`badInput`: the value is empty and native validation refuses the submit, so
Safari answered "Add" with a red "Invalid value" bubble and nothing was
added. The hour was never required; the browser was enforcing a rule nobody
wrote. The form opts out of native validation and makes the call itself: a
finished time is used, no time at all is used, and a half-written one stops
and says so rather than being silently dropped - somebody who typed 30
meant something by it.
MSG
ok committed
say "review, then:  git push"
