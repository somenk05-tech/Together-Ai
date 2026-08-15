#!/usr/bin/env bash
# land-the-shelf.sh  ·  run from the REPO ROOT
#
# The owner, 15 Aug: "the supplements page needs to be connected to the medical
# records and then recommend supplements — also create a store where you can
# order your supplements and see all the other supplements in the store."
#
# API ONLY. The catalogue, four new lab rules, and one read route. The store
# PAGE comes next and reads this.
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
printf '%s\n' "$LOG" | grep 'The shelf keeps the refusals' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A plan, not a shelf' >/dev/null
[ $? -eq 0 ] || die "base commit 'A plan, not a shelf' is not here"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/fitness/" \
  | grep -Ev '(src/fitness/supplements/(labs|products|supplements\.(engine|service|spec))\.ts|src/fitness/fitness\.controller\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/fitness/supplements/labs.ts"                2e955de6911507c7620560e26f3938787e3341e1390ed75fe58f5e8d398239d2
check "$A/src/fitness/supplements/products.ts"            2ebbbdd98514cad142fd767a109b40e964e5affbbb7d46c24ec87681bba6cc3e
check "$A/src/fitness/supplements/supplements.engine.ts"  42d0252464d1807c09ce537a8e3967ce72a5d33f2d76f61e8c6e541ace05290b
check "$A/src/fitness/supplements/supplements.service.ts" 78d7f9eba93e4803c23e410c5d095c671691a2c8a55248ac733b80e36f8815e0
check "$A/src/fitness/supplements/supplements.spec.ts"    800b3766c8b32263693cee5d9de9edc985ca1aff8bf0923a8730c1bb052ff966
check "$A/src/fitness/fitness.controller.ts"              b8c2dd407b5cf175bec3c05d66cb3547b38f52c1ec9b8dc072a5b518a001c184

say "4 - api gates"
cd "$A" || die cd
npx prisma validate                    && ok "prisma validate" || die "prisma validate"
npx tsc --noEmit                       && ok "api tsc"         || die "api tsc"
npx jest src/fitness src/mira src/privacy src/medical --silent && ok "api jest" || die "api jest"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build                          && ok "api build"       || die "api build"
cd ..

say "5 - commit"
git add "$A/src/fitness/supplements/labs.ts" \
        "$A/src/fitness/supplements/products.ts" \
        "$A/src/fitness/supplements/supplements.engine.ts" \
        "$A/src/fitness/supplements/supplements.service.ts" \
        "$A/src/fitness/supplements/supplements.spec.ts" \
        "$A/src/fitness/fitness.controller.ts" \
        land-the-shelf.sh || die "git add"
git commit -F - <<'MSG' || die commit
The shelf keeps the refusals

The owner, 15 Aug, on the page that landed four hours ago: connect it to the
medical records, then recommend, and build a store you can actually order
from. The last commit argued the shelf should come back as its own screen.
This is the half of it that has to be right first.

THE PAGE WAS READING THREE MARKERS HE DOES NOT HAVE. Vitamin D, B12 and
ferritin - and his panel of 19 July carries haemoglobin, HbA1c, LDL and
triglycerides. So a screen headed "built from your blood work" told him what
is generally true of Indian adults while his own results sat one hub away,
unread. That is not a missing feature. It is the specific failure a
personalised page is supposed to be incapable of, and it was shipped by me.

FOUR MARKERS, FOUR RULES, AND THEY ARE NOT THE SAME KIND OF RULE.

An LDL of 132 makes PSYLLIUM a priority - 28 trials, 1,924 people, LDL down
about 13 mg/dL and apolipoprotein B down with it, at HIGH GRADE certainty,
which almost nothing else in this review can claim. It costs 320 rupees for
six months and it is sold as a kitchen staple. This is the one the engine
may actually dose, because the number is a food quantity and not a
titration.

A triglyceride of 427 moves OMEGA-3 up a bucket AND TAKES THE NUMBER AWAY.
Triglyceride lowering is the one reliable omega-3 effect and it is
dose-dependent, so this is precisely where a supplement page turns into a
prescription pad. The only dose ever shown to move EVENTS was four grams a
day of prescription icosapent ethyl in REDUCE-IT - and STRENGTH, at the same
four grams, found no benefit and more atrial fibrillation. So the card says
"set by your doctor", and the reason paragraph says why in full rather than
quietly raising the range.

An HbA1c of 6.7% gets NOTHING SOLD FOR IT. It is named, sourced to the ADA
band, and handed back: no supplement in the review is offered for blood
sugar and none is offered here. A test asserts that no recommendation on the
plan may cite HbA1c at all. The failure mode of a page like this is not
naming a bad bottle - it is reading a serious result and answering it with
fish oil.

A LOW HAEMOGLOBIN STILL DOES NOT UNLOCK IRON, and now it says so in that
person's own numbers. Iron deficiency explains under a third of Indian
anaemia; the rest is B12, folate, haemoglobinopathies and inflammation. So a
low haemoglobin with no ferritin makes the iron refusal MORE specific and
brings B12 forward instead. Where the sex is unknown the LOWER of the two
WHO thresholds is used, because 12.4 is anaemia in one of those sentences
and not the other, and this engine does not get to pick which person is
reading.

EVERY THRESHOLD NOW LIVES IN `labs.ts` WITH THE BODY THAT PUBLISHED IT -
NCEP ATP III, the ADA, the WHO - and a test greps the engine for
`.value < 20`, which is how an unsourced number gets into a codebase. A
cut-off may move a bucket. It may not scale a dose, and it is never
subtracted from a result to manufacture a gap.

THE STORE IS 43 PRODUCTS ACTUALLY SOLD IN INDIA, read out of the same
review's "Available in India" tables: brand, label strength, the price on
the day it was compiled, and a link to the retailer. Every row resolves to a
supplement id in the knowledge base, and the spec asserts it - a product
this city can show but cannot say the evidence for is a product it has no
business showing. That rule cost one real product, a probiotic with no
knowledge-base entry, and it is not here.

TOGETHER CITY DOES NOT TAKE THE MONEY. The link goes to Tata 1mg, HealthKart,
Nutrabay or the brand's own store, and a test asserts that no link in the
catalogue carries an affiliate parameter. The previous commit's argument was
that the moment a refusal costs revenue the refusals get quieter; the
cheapest way to keep that true is to never be in the transaction, and the
cheapest way to keep THAT true is to assert it rather than promise it.

TWELVE OF THE 43 SIT UNDER SUPPLEMENTS THIS ENGINE REFUSES, and they stay on
the shelf. Hiding a multivitamin from somebody who came looking for one does
not stop them buying it - it stops them reading the 78 trials and 715,526
participants first, and sends them to a shop that will sell it without the
footnote. Each card carries the citizen's own verdict as a badge, and a null
badge renders as "no opinion" rather than as a silent tick.

/fitness/store is a GET, and it is the second reader on this controller
deliberately NOT registered with Mira. "Order me the vitamin D" is one word
away from working, and an assistant that can put a supplement in a basket is
an assistant that can be talked into putting the wrong one there.

NEXT. The store page, then the cabinet - which is the only thing here that
needs a table, and which turns "what you already take" from a parameter the
engine accepts into something a person can fill in.
MSG
ok committed
say "review, then:  git push"
