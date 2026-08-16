#!/usr/bin/env bash
# land-the-city-says-it-not-mira.sh  ·  run from the REPO ROOT
#
# THREE WORDS AND A NAME. The supplement plan's refusal heading and the
# store's refusal badge carried Mira's name; the verdict is the city's, so
# they say so. Web copy only - no engine change, no wire change, no API file
# touched, no behaviour touched.
#
# RUN AFTER "The plan sells what it supports".
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
printf '%s\n' "$LOG" | grep 'The city says it, not Mira' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The plan sells what it supports' >/dev/null \
  || die "run land-the-plan-sells-what-it-supports.sh first"
ok "the base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -uall -- "$W/src/features/fitness" together-city-chat/src/fitness \
  | grep -Ev '(fitness/pages/Supplements\.tsx|fitness/pages/Store\.tsx)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change - and the API carries none"

say "3 - sha256"
FILES=(
  "$W/src/features/fitness/pages/Supplements.tsx"
  "$W/src/features/fitness/pages/Store.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/fitness/pages/Supplements.tsx"   ea067f8db2aa6ba77bef4de0688d64e60e3c001cc01bf4360de96589d2abaa82
check "$W/src/features/fitness/pages/Store.tsx"         c96e3d1f56e766e6b14b83458dafceda966865221c1fdd3194f703a6c3f38c4a

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
git add "${FILES[@]}" land-the-city-says-it-not-mira.sh || die "git add"
git commit -F - <<'MSG' || die commit
The city says it, not Mira

Owner, 16 Aug: take Mira's name off the supplement verdict. It is the
city's recommendation.

"Mira doesn't recommend these"  ->  "We don't recommend these"
"Mira doesn't recommend this"   ->  "We don't recommend this"   (store badge)
"What Mira is watching"         ->  "What we're watching"

WHY IT MATTERS BEYOND THE WORDS. A refusal under a name reads as one
voice's opinion, and this one is not an opinion: it is an evidence
review resolved against the citizen's own blood work, medicines, diet
and goal, and every card beneath the heading carries the trial that
decided it. "We" is also simply true - the plan is the city's answer,
and Mira is one of the ways to hear it read out.

THE STORE BADGE CHANGED WITH IT because it renders the SAME verdict on
a different screen, and one verdict under two names is two verdicts to
the person reading them.

NOTHING ELSE MOVED. No engine, no knowledge base, no spec, no wire, no
API file - the backend works exactly as it did, which is the whole
brief. Two string literals and their comments.

Gates: web tsc, the whole vitest suite, the four audits at their
ceilings, and the web build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01X5WD8dRrEqYkrL22q8EGtu
MSG
ok "committed"
say "done - now push"
