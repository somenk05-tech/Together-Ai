#!/usr/bin/env bash
# land-a-plan-not-a-shelf.sh  ·  run from the REPO ROOT
#
# The supplements page, reading the engine that landed in 'The supplement
# engine'. Two files, web only, no API and no migration.
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
printf '%s\n' "$LOG" | grep 'A plan, not a shelf' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The supplement engine' >/dev/null
[ $? -eq 0 ] || die "base commit 'The supplement engine' is not here - this page reads its route"
ok "the base is here, this is not"

say "2 - scope"
# The api file is named rather than its directory: another session is working
# in chat.api.ts and schemas.ts.
STRAY="$(git status --porcelain -- "$W/src/api/supplements.api.ts" "$W/src/features/fitness/" \
  | grep -Ev '(src/api/supplements\.api\.ts|src/features/fitness/pages/Supplements\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/api/supplements.api.ts"                       73d58d2109a7e79bbce1417cd098ecbca25365835b53757c94b3e5dc637d72ed
check "$W/src/features/fitness/pages/Supplements.tsx"       a4d8dfb47a5fc87349c1925de8ee33419150a3cdbc61d9c43cea07da1eedd514

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
git add "$W/src/api/supplements.api.ts" \
        "$W/src/features/fitness/pages/Supplements.tsx" \
        land-a-plan-not-a-shelf.sh || die "git add"
git commit -F - <<'MSG' || die commit
A plan, not a shelf

The supplements page, reading the engine.

WHAT WAS HERE. Eight products with a price and a sentence, ordered by
`const HEALTH = { weightKg: 65, goal: 'maintain' }` — a hardcoded body that
belonged to nobody, sitting on a screen headed "Recommended for you". The
protein target it printed was arithmetic on that fictional 65 kg. And
three of the eight were a daily multivitamin, D3+K2 and BCAA/EAA: all
three are on the skip list of the owner's own evidence review, two of them
beside trials that found harm rather than nothing. It was a shop using the
word "recommended", and it recommended things this city has now published
the evidence against.

WHAT IT IS. A read of GET /fitness/supplements, in four buckets: needs
attention, worth considering, supporting your goal, and the things not to
take — with the trial that says so. Every card carries its reasons with
the SOURCE OF EACH ONE tagged in the margin: blood work, diet, medicines,
India, evidence. "67% of Indian adults are below 20 ng/mL" and "your
ferritin is 9" are different kinds of statement, and a page that sets them
in the same type is lying by layout even when every word on it is true.

THIS FILE DOES NO THINKING, and that is the design. No threshold, no
arithmetic, no dose, no "if low then" anywhere in the component. Every
number and every claim arrives from the server with a citation attached. A
rule enforced in one place is a rule; enforced in two, it is a coincidence
waiting to end — and the rule here is that this application does not
calculate a dose for anybody.

`dose: null` RENDERS AS A SENTENCE, not as a blank: "set by your doctor —
not by this app". The absence is the message, and a placeholder would have
hidden the one thing worth saying.

THE PRICES AND THE "ADD TO KIT" RAIL ARE GONE. Selling is a different act
from advising, and a page doing both cannot be trusted with the second:
the moment a refusal costs revenue, the refusals get quieter. The shelf
can come back as its own screen, which is also where a cart belongs.

It opens with what the plan was actually built from — the date of the
blood test or a link to add one, how many medicines were checked, the diet
and the goal — and closes with what Mira is watching: the tests whose
ABSENCE is shaping the answer, named before the results exist. Then the
review, its date, and the line that matters most: dietary supplements are
not pre-approved for safety or effectiveness the way medicines are.

NEXT. The cabinet and the total-daily-intake view against upper limits,
which need somewhere to store what somebody already takes — the engine
already accepts `taking` for exactly that.
MSG
ok committed
say "review, then:  git push"
