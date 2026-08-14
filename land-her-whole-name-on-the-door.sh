#!/usr/bin/env bash
# land-her-whole-name-on-the-door.sh  ·  run from the REPO ROOT
#
# "i want the entire mira logo with the mira text as tab on chats - and when
# cursor hovers let it say mira can analyse the chat for you" - the owner.
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
printf '%s\n' "$LOG" | grep 'Her whole name on the door' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep "Her mark takes the stage" >/dev/null
[ $? -eq 0 ] || die "base commit \"Her mark takes the stage's ink\" is not here - run land-her-mark-takes-the-stages-ink.sh first"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/styles/mira.css" "$W/src/features/chat/pages/Chats.tsx" "$W/src/app/mira-reads-one-chat.test.ts" \
  | grep -Ev '(src/styles/mira\.css|src/features/chat/pages/Chats\.tsx|src/app/mira-reads-one-chat\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/styles/mira.css"                 389ee7b2d19bb78c68f777a3f45d91ac107ffcd50f36cf0bba845797af435539
check "$W/src/features/chat/pages/Chats.tsx"   85908d2fc2b927f677572c4a5eae26d143dfc7552aa8a8d3914a44b2c753601c
check "$W/src/app/mira-reads-one-chat.test.ts" 798c779c0b36b0c3ef5060d74d329dce2a39571b02e475a565a0ab613999e405

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
        "$W/src/features/chat/pages/Chats.tsx" \
        "$W/src/app/mira-reads-one-chat.test.ts" \
        land-her-whole-name-on-the-door.sh || die "git add"
git commit -F - <<'MSG' || die commit
Her whole name on the door

"i want the entire mira logo with the mira text as tab on chats - and when
cursor hovers let it say mira can analyse the chat for you" - the owner.

The header key grows into the full lockup: ring AND wordmark, at 48 -
the size below which the word stops being legible, which is why the bare
ring shipped wordless at 30. Still no disc, still the stage's own ink, so
MIRA reads crisply on all nine grounds.

AND THE DOOR SAYS WHAT IS BEHIND IT. Hovering shows the owner's line -
"Mira can analyse this chat for you" - as a small card in her own
material, dark red under the stage's header, so the promise reads as
hers. It appears rather than animating in (the motion budget is spent,
and a tooltip that fades is a tooltip you wait for); focus-visible shows
it too, so a keyboard learns the same thing a cursor does, and the
button's title repeats it word for word for everything else. The
aria-label still names the ACTION, which is what a screen reader needs
from a button.
MSG
ok committed
say "review, then:  git push"
