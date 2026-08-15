#!/usr/bin/env bash
# land-one-thread-every-device.sh  ·  run from the REPO ROOT
#
# "user data on mobile and site should be same... any activity on app should
# also be updated for website" - the owner, holding a phone showing one Mira
# conversation beside a laptop showing another.
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
LOG="$(git log --oneline -80)"
printf '%s\n' "$LOG" | grep 'One thread, every device' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A way back from her room' >/dev/null
[ $? -eq 0 ] || die "base commit 'A way back from her room' is not here"
printf '%s\n' "$LOG" | grep 'She hears the right hub' >/dev/null
[ $? -eq 0 ] || die "base commit 'She hears the right hub' is not here"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$A/src/mira/" "$W/src/features/chat/mira/" "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" \
  | grep -Ev '(src/mira/(mira\.service\.ts|mira\.controller\.ts|she-remembers-and-forgets\.spec\.ts)|src/features/chat/mira/(api\.ts|MiraThread\.tsx)|src/app/mira-is-two-tabs-and-a-door\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$A/src/mira/mira.service.ts"                    03fcdefdac6f92128a5dd9303737299a69ae2352e16815a79e0d887ef826f38b
check "$A/src/mira/mira.controller.ts"                 b9513eb82d8b1c346bdc2187a17b140e4a6b05c95b79ddd8e2c2b5b042c24f98
check "$A/src/mira/she-remembers-and-forgets.spec.ts"  6fc3c1744fec1f1d5b4bc6f86a267dae02e066b3bd67e5b7f962c4e8700f5468
check "$W/src/features/chat/mira/api.ts"               7ac6d7b6b3039f9c025446c4be87c8978bdb79707da5f144c7b75305065d19c2
check "$W/src/features/chat/mira/MiraThread.tsx"       1be58fbe178ac1f4ebeedc446b10b04901f8f795bb398dac1daf1d5d4ac82f20
check "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" 2630698052da82f059069524927c3a392a23254b17cb960ce9f76b5e79f732e8

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
git add "$A/src/mira/mira.service.ts" \
        "$A/src/mira/mira.controller.ts" \
        "$A/src/mira/she-remembers-and-forgets.spec.ts" \
        "$W/src/features/chat/mira/api.ts" \
        "$W/src/features/chat/mira/MiraThread.tsx" \
        "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" \
        land-one-thread-every-device.sh || die "git add"
git commit -F - <<'MSG' || die commit
One thread, every device

"user data on mobile and site should be same... any activity on app should
also be updated for website" - the owner, holding a phone showing one Mira
conversation beside a laptop showing another.

The record already spanned devices - MiraTurn is what her memory reads -
but the SCREEN read the browser's own day store, so each device showed its
own transcript of the same relationship. Now the record is also the
screen's source: GET /mira/thread serves the citizen's last sixty turns
per room, and MiraThread hydrates from it on open. The device day store
remains the offline fallback, never the truth - an older API without the
route, or a slow table, costs nothing but sync.

Three guards keep hydration honest. ONCE per room per visit, so a refetch
never rewrites a scroll somebody is reading. NEVER over a conversation in
progress - if they typed before the server answered, their turn wins and
the record catches up next open. And clearing holds: "Forget today"
becomes "Clear this screen", which marks the moment on THIS device, and
hydration shows only what came after - so a cleared thread does not
resurrect, while the record and every other device keep the history.
Deleting the record itself remains the forget command's job, and hers
alone; her forget-everything line now says so in the new words.

The footer stops lying too: "Today, on this device - it clears itself at
midnight" described the day store. The thread it sits under now follows
the account, and it says exactly that.
MSG
ok committed
say "review, then:  git push"
