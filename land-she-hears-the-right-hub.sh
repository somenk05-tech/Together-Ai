#!/usr/bin/env bash
# land-she-hears-the-right-hub.sh  ·  run from the REPO ROOT
#
# "Fix mira" - the owner, with a screenshot of her answering "What my
# nutrition today" with the astrology day brief. API-side only; independent
# of land-a-way-back-from-her-room.sh (different package, either order).
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
LOG="$(git log --oneline -80)"
printf '%s\n' "$LOG" | grep 'She hears the right hub' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'She reads one chat' >/dev/null
[ $? -eq 0 ] || die "base commit 'She reads one chat' is not here"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/mira/router.ts" "$A/src/mira/she-hears-the-right-hub.spec.ts" "$A/src/nutrition/nutrition.controller.ts" \
  | grep -Ev '(src/mira/(router\.ts|she-hears-the-right-hub\.spec\.ts)|src/nutrition/nutrition\.controller\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/mira/router.ts"                        b3740aaf136f2af388af550faa8f1b8c4f02a2fa3d444ca98e1e9b7747a2a0a9
check "$A/src/nutrition/nutrition.controller.ts"     ee7c41e0c31b9d3d350785bd4b1f28e41e62a9b366c719b8c542b7a9a11326f7
check "$A/src/mira/she-hears-the-right-hub.spec.ts"  1e6ddea81b4e688104408c62994eca21888539e420042c7af2914b404aabe51f

say "4 - api gates"
cd "$A" || die cd
npx prisma validate                    && ok "prisma validate" || die "prisma validate"
npx prisma generate                    && ok "prisma generate" || die "prisma generate"
npx tsc --noEmit                       && ok "api tsc"         || die "api tsc"
npx jest src/mira src/privacy --silent && ok "api jest"        || die "api jest"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build                          && ok "api build"       || die "api build"
cd ..

say "5 - commit"
git add "$A/src/mira/router.ts" \
        "$A/src/nutrition/nutrition.controller.ts" \
        "$A/src/mira/she-hears-the-right-hub.spec.ts" \
        land-she-hears-the-right-hub.sh || die "git add"
git commit -F - <<'MSG' || die commit
She hears the right hub

"Fix mira" - the owner, with a screenshot of her answering "What my
nutrition today" with the astrology day brief: a cryptic line from the
reading, a stew time, an unread count, and "Take me to Astrology". A
citizen asked about food and was told about her stars - the exact
machinery-forward failure the master framework forbids, arrived at
through routing rather than through voice.

Two faults, both fixed:

THE ROUTER MATCHED TOKENS BY SUBSTRING. "day" is a substring of "today",
so 'how is my day' half-claimed every sentence that merely said "today",
and the day brief outbid hubs that had no words in the fight. A token now
counts only as a whole word; a full PHRASE may still match inside a
longer sentence, which is a real match and stays.

THE KITCHEN OWNED NONE OF ITS OWN WORDS. "Nutrition today" and "meal
plan" are how citizens actually ask for today's food, and no nutrition
utterance said them - so even a fixed router had nowhere to send the
question. prep-alerts now owns the meal-plan and nutrition-today
phrasings; targets owns 'my nutrition targets'.

she-hears-the-right-hub.spec.ts pins both against the REAL manifest -
the same source-parsed utterance lists the build gates read - including
the exact production sentence, typo-grammar and all, and a no-tie guard
so the next utterance addition cannot quietly turn this question into
"which one?". The substring case gets its own test: "day" does not live
inside "today", ever again.
MSG
ok committed
say "review, then:  git push"
