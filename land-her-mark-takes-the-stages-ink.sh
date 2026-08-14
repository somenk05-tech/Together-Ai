#!/usr/bin/env bash
# land-her-mark-takes-the-stages-ink.sh  ·  run from the REPO ROOT
#
# "the mira logo is missing" - the owner, on the emerald theme. It was not
# missing; it was invisible: the bare ring kept --mira-mark, her on-white
# red, which lands near 1.5:1 on the dark stages. One declaration changes.
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
LOG="$(git log --oneline -80)"
printf '%s\n' "$LOG" | grep 'Her mark takes the stage' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The stage lies flat' >/dev/null
[ $? -eq 0 ] || die "base commit 'The stage lies flat' is not here - run land-the-stage-lies-flat.sh first"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/styles/mira.css" "$W/src/app/mira-reads-one-chat.test.ts" \
  | grep -Ev '(src/styles/mira\.css|src/app/mira-reads-one-chat\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/styles/mira.css"                 cf3b739fcbe991f2f7421be75589818ee96fae06f67de89ea9eca9c1e585378c
check "$W/src/app/mira-reads-one-chat.test.ts" 71c9f7d1456defd20691d31a32d5c9ab606396bbc2426009be2b55b5447aa43f

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
git add "$W/src/styles/mira.css" \
        "$W/src/app/mira-reads-one-chat.test.ts" \
        land-her-mark-takes-the-stages-ink.sh || die "git add"
git commit -F - <<'MSG' || die commit
Her mark takes the stage's ink

"the mira logo is missing" - the owner, on the emerald theme. It was not
missing; it was invisible. When the tool disc came off, the bare ring kept
--mira-mark - her red, which exists for the ONE place the mark is drawn on
white, her row's slot in the list - and red measured for white lands near
1.5:1 on a dark green stage. A mark-shaped nothing beside the search key.

The rule that fixes it is the one the whole token layer runs on: an ink is
measured against its ground, and the ground here is THE STAGE - any of
nine of them now. So the bare ring is drawn in var(--on-stage), which
every theme block already re-measures (6.2:1 at the slate's worst, 4.6:1
floor across the set), and the ring's gap is what says Mira. The guard
test now pins the ink and bans the on-white red from this rule, so the
next restyle cannot repeat this with a different theme in the screenshot.
MSG
ok committed
say "review, then:  git push"
