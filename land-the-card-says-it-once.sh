#!/usr/bin/env bash
# land-the-card-says-it-once.sh  ·  run from the REPO ROOT
#
# Three defects on the live /fitness/supplements page, all in how the plan's
# words are composed. API only - no wire-shape change, no web change, no
# migration. Railway redeploys on push.
#
# RUN AFTER "The band is the rule".
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
printf '%s\n' "$LOG" | grep 'The card says it once' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The band is the rule' >/dev/null \
  || die "run land-the-band-is-the-rule.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/fitness/supplements" \
  | grep -Ev '(supplements/knowledge\.ts|supplements/supplements\.engine\.ts|supplements/supplements\.spec\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
FILES=(
  "$A/src/fitness/supplements/knowledge.ts"
  "$A/src/fitness/supplements/supplements.engine.ts"
  "$A/src/fitness/supplements/supplements.spec.ts"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/fitness/supplements/knowledge.ts"             21f36b3261ae9e748c74e1a5b8eb96a44944b67159f7e2fa43187240db84eb0a
check "$A/src/fitness/supplements/supplements.engine.ts"    9554c40587ed209e2fa2e7f8a02fbfbacea2bb11eb1dee97e4d810f41896ba3a
check "$A/src/fitness/supplements/supplements.spec.ts"      5f00bd27738639462c628d871cf09d91d0f32ef84a3bf1008e143207f8bb1212

say "4 - api gates"
cd "$A" || die cd
npx tsc --noEmit                     && ok "api tsc"             || die "api tsc"
npx jest src/fitness/supplements     && ok "supplements suite"   || die "supplements suite"
cd ..

say "5 - commit"
git add "${FILES[@]}" land-the-card-says-it-once.sh || die "git add"
git commit -F - <<'MSG' || die commit
The card says it once

Three defects on the live /fitness/supplements page, found by reading it,
and all three are one class: the composing of the plan's words was done
in the data instead of on the page, and then done again.

1. THE SKIP LIST WAS A PASTE. All sixteen DO_NOT_RECOMMEND entries
carried their `what` fused onto the front of `why` and their `source`
fused onto the end - "Collagen for skin ageing23 RCTs..." and "...the
funding pattern is the story.Myung & Park, Am J Med 2025", with the same
citation then printed again on its own line beneath. The three fields
are three different sentences now: the claim, the evidence body, the
citation - and a new spec refuses a `why` that starts with its own
`what` or ends with its own `source`. The smoker's beta-carotene flag,
which quotes `why` into a composed sentence, reads correctly for the
first time.

2. THE REFUSED CARDS SAID THEIR ONE THING TWICE. Multivitamin and
Collagen are pushed with the skip evidence as their `why`, and the
null-or-harm branch then added the identical paragraph as a "Harm
signal" flag - same text, same citation, twice on a card whose whole
job is one refusal. The flag now fires only when the evidence is not
already on the card, which keeps the flags that genuinely add facts.
A new spec walks every card and refuses a flag that repeats a why.

3. gradeFor SAID THE GRADE AGAIN IN DIFFERENT TYPE. "Strong evidence -
Strong" on psyllium, creatine and B12; "Moderate evidence - Moderate"
on omega-3 and magnesium; "Emerging - Emerging" on K2. The field is
for the CLAIM the grade attaches to, which is the informative half of
the sentence, and each now names it from its own entry's evidence:
psyllium "LDL lowering", omega-3 "Triglycerides", creatine "Strength &
muscle", B12 "Deficiency correction", magnesium "Blood pressure", K2
"Bone markers, not bone density". A new spec refuses a gradeFor that
echoes the grade.

No wire-shape change: the same fields travel, carrying words that are
now correct. 52 supplements tests green, three of them new ratchets.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push"
