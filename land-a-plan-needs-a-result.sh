#!/usr/bin/env bash
# land-a-plan-needs-a-result.sh  ·  run from the REPO ROOT
#
# The supplement plan stops suggesting anything from a country's base rate,
# and stops suggesting anything at all to somebody with no blood work. The
# INDIA row is gone from every card. Engine + page; no migration, no wire
# break (both new fields are additive and optional on the client).
#
# RUN AFTER "The city says it, not Mira".
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
printf '%s\n' "$LOG" | grep 'A plan needs a result' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The city says it, not Mira' >/dev/null \
  || die "run land-the-city-says-it-not-mira.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -uall -- "$A/src/fitness" "$W/src/features/fitness" "$W/src/api/supplements.api.ts" \
  | grep -Ev '(supplements/supplements\.engine\.ts|supplements/supplements\.spec\.ts|api/supplements\.api\.ts|fitness/pages/Supplements\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$A/src/fitness/supplements/supplements.engine.ts"
  "$A/src/fitness/supplements/supplements.spec.ts"
  "$W/src/api/supplements.api.ts"
  "$W/src/features/fitness/pages/Supplements.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/fitness/supplements/supplements.engine.ts"   3faa99b5f50129579f86c554747ad88fe15b27b947ffad16b350bb62f085dfe0
check "$A/src/fitness/supplements/supplements.spec.ts"     58be6100e1fd67f26b1c980eeb8fd6518a0632c94228575bd5af24ac1502153d
check "$W/src/api/supplements.api.ts"                      6b2b91817d207925e9e2f8b0d7b02451b62e5e957a0af7a794b1a358df7bcdeb
check "$W/src/features/fitness/pages/Supplements.tsx"      d09eea12d94520d5666ebaee8f78fa6f1985bc71dea191e8fa690db4f06d8bb0

say "4 - api gates"
cd "$A" || die cd
npx tsc --noEmit                     && ok "api tsc"             || die "api tsc"
npx jest src/fitness/supplements     && ok "supplements suite"   || die "supplements suite"
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
git add "${FILES[@]}" land-a-plan-needs-a-result.sh || die "git add"
git commit -F - <<'MSG' || die commit
A plan needs a result

Owner, 16 Aug, reading his own page: take the India rows off, only say
why THIS is being suggested to THIS person from their blood test - and
if there is no blood test, suggest nothing.

TWO RULES, AND THE SECOND IS THE STRONG ONE.

1. `population` IS NO LONGER A KIND OF REASON. It was the tag on "67% of
Indian adults are below 20 ng/mL", "81% of Indian adults have some
dyslipidaemia", and the omega-3 intake-gap line that was appended to
every omega-3 card whether or not a triglyceride existed. Each was
honestly labelled, and each was still a bottle suggested to somebody on
the strength of a statistic about their country. The tag is gone from
the ReasonFrom union, so the COMPILER is what stops the next one being
written; the India row is gone from the page; and three cards that
existed only to carry a base rate - vitamin D with no result, psyllium
with no lipids, omega-3 with no triglyceride - are simply not built.

2. NO BLOOD WORK, NO SUGGESTION AT ALL. A gate at the foot of
`recommend` empties every suggestion bucket when the citizen has no
panel on file. Diet, medicines, a training goal and a measured protein
gap are all real reasons and none of them can say whether the thing
being suggested is already covered, already high, or the wrong answer
for a body nobody has measured. Iron settles it: the diet, the tiredness
and the anaemia headline all point one way, and under a third of the
time they are right.

WHAT SURVIVES THE GATE is everything that is not a suggestion - what the
evidence says NOT to buy with its trial, the clinical notes, and
`watching`, which names the tests that would change the answer. The page
says so in as many words rather than rendering an absence, because an
empty plan under a heading reads as "you need nothing", and that is a
claim nobody has checked.

MEASURED on the owner's own panel: psyllium priority (LDL 132), omega-3
consider (triglycerides 427), the three refusals, and vitamin D moved
from a card to the watch list where it asks for a test instead of ₹649.
With no panel at all: no suggestions, three refusals, four tests named.

The wire gains `hasBloodWork`, additive and optional on the client;
`population` stays in the client's enum for the length of one deploy so
an older server cannot break the page, and the page filters those rows
out. 53 supplements tests green, three of them new ratchets.

Gates: api tsc and the supplements jest suite; web tsc, the whole vitest
suite, the four audits at their ceilings, and the web build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push"
