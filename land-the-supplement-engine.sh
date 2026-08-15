#!/usr/bin/env bash
# land-the-supplement-engine.sh  ·  run from the REPO ROOT
#
# The owner, 15 Aug, with an evidence review of 19 supplements and a long
# specification: "the system should distinguish between educational suggestion
# and clinically appropriate recommendation", and "don't let the AI invent
# dosages".
#
# API ONLY - the knowledge base, the engine, the mapping and one read route.
# The page comes next; this is the half that has to be right first.
set -uo pipefail
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'The supplement engine' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/fitness/" \
  | grep -Ev '(src/fitness/supplements/(knowledge\.ts|supplements\.(engine|service|spec)\.ts)?|src/fitness/fitness\.(controller|module)\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/fitness/supplements/knowledge.ts"           f1510823742ec5e67ac1ae62775d2730c33d62a71a3ced797709cde6e9ee8ce2
check "$A/src/fitness/supplements/supplements.engine.ts"  bdf4472c52457f0295a92ef79c31f685355a7786bfee422320b3cbbc32f23d7d
check "$A/src/fitness/supplements/supplements.service.ts" 75ed09f8c6adcd23ad871eb2ab3e320e8d9e7b714f8252761414e36ce4866030
check "$A/src/fitness/supplements/supplements.spec.ts"    3d370d057ab843ef0424092b7c5763e905bf35fdf447b60a1a63e440a5784a84
check "$A/src/fitness/fitness.controller.ts"              d759d50d997b276133f6ba90d375c5f87d48a9c975a62c49d2a8c8f026792282
check "$A/src/fitness/fitness.module.ts"                  b980b7f61192502b344a10aa23fc61cc6749e579d292dcd3a4b650fcf7bc48dc

say "4 - api gates"
cd "$A" || die cd
npx prisma validate                    && ok "prisma validate" || die "prisma validate"
npx tsc --noEmit                       && ok "api tsc"         || die "api tsc"
npx jest src/fitness src/mira src/privacy src/daybook --silent && ok "api jest" || die "api jest"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build                          && ok "api build"       || die "api build"
cd ..

say "5 - commit"
git add "$A/src/fitness/supplements/knowledge.ts" \
        "$A/src/fitness/supplements/supplements.engine.ts" \
        "$A/src/fitness/supplements/supplements.service.ts" \
        "$A/src/fitness/supplements/supplements.spec.ts" \
        "$A/src/fitness/fitness.controller.ts" \
        "$A/src/fitness/fitness.module.ts" \
        land-the-supplement-engine.sh || die "git add"
git commit -F - <<'MSG' || die commit
The supplement engine

The owner, 15 Aug, with an evidence review of 19 supplements and a long
specification for what to build on it. Two lines of that brief are the
whole architecture: "the system should distinguish between educational
suggestion and clinically appropriate recommendation", and "don't let the
AI invent dosages".

THE BRIEF CONTRADICTED ITSELF ONCE, AND THIS RESOLVES IT THE SAFE WAY.
Section 6 described a dose computed from a lab value, body size and organ
function; section 14 said the model must never produce a dosage. Both
cannot ship. Every number this engine prints is a string copied out of a
cited knowledge base, and a test asserts it: one collects every dose the
engine can emit and checks each exists verbatim in that file, another
greps the engine's own source for arithmetic on a lab value or a body
weight and fails if it finds any. Where a therapeutic dose is the honest
answer - a documented deficiency - the engine returns NO number at all and
says the range and the doctor. Supplements are not pre-approved for safety
or efficacy the way medicines are, and a plausible number in a confident
sentence is indistinguishable from a correct one to the person reading it.

THE PIPELINE RUNS IN THE ORDER THE BRIEF SPECIFIED - recommendation, then
safety, then interaction, then clinical risk - and each stage can only make
the answer more conservative than the stage before. A recommendation
filtered for safety AFTERWARDS has already been computed by something that
did not know about the warfarin.

"NOT RECOMMENDED" IS A FIRST-CLASS ANSWER, WITH THE TRIAL. Iron with no
ferritin result on file is refused, in the review's own words: don't add it
because you are tired. A multivitamin for prevention is refused (78 RCTs,
715,526 people); for a smoker it carries the beta-carotene harm finding
from ATBC and CARET. Collagen is refused on the funding-bias analysis.
Warfarin makes omega-3 and K2 clinician-only. Kidney disease refuses
protein powder on ICMR's own caution. A supplement screen that can only
suggest buying something is an advertisement with a chart on it - and the
page live today recommends a daily multivitamin, D3+K2 and BCAAs, all
three of which this review puts on its skip list. That is what this
replaces.

AN EDUCATIONAL SUGGESTION IS NEVER DRESSED AS A CLINICAL ONE. Every reason
carries where it came from - a LAB, the DIET, the GOAL, a MEDICINE, or a
POPULATION statistic - so "67% of Indian adults are below 20 ng/mL" arrives
labelled as a base rate for the country and not as a finding about the
reader, with the sentence saying so in the copy rather than in the tone.

The blood work is read through the medical hub's CONSENT GATE rather than
out of the table, so a citizen who has revoked Fitness's access gets a
population-level plan instead of a leak. Nothing is substituted for missing
data anywhere: no default weight, no assumed sex, no assumed training
frequency. The entire iron rule rests on the difference between a normal
ferritin and no ferritin, and a default is how that difference gets erased
before anything reads it.

The route is a GET and nothing else. There is no endpoint that takes a
dose, a lab value or a supplement id from a client and returns a
recommendation - that would be the door "recommend me 5,000 IU" arrives
through. It is also the one reader on this controller deliberately NOT
registered with Mira: the gap between "explain my plan" and "tell me what
to take" is one sentence wide when the subject is medicines and blood work.

PHASE 1. The page - four buckets, the fit breakdown, the cabinet, and the
total-daily-intake view against upper limits - is next, and reads this.
MSG
ok committed
say "review, then:  git push"
