#!/usr/bin/env bash
# land-she-reads-the-dating-thread.sh  ·  run from the REPO ROOT
#
# "add mira to dating chats too" - the owner, 15 Aug.
#
# Independent of land-a-drawer-of-ones-own.sh (different files, either order).
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
printf '%s\n' "$LOG" | grep 'She reads the dating thread' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Her whole name on the door' >/dev/null
[ $? -eq 0 ] || die "base commit 'Her whole name on the door' is not here"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/features/dating/" "$W/src/app/mira-reads-one-chat.test.ts" \
  | grep -Ev '(src/features/dating/pages/DatingChats\.tsx|src/app/mira-reads-one-chat\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/dating/pages/DatingChats.tsx"  b436d33a93ba4f67cec5b9d9dfeee6fc28e76f68f37968e487da00139e22a533
check "$W/src/app/mira-reads-one-chat.test.ts"        b47c447ff3fd3389471be73e97d7b8b706bc030831e83a5bb83faceff1882b4c

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
git add "$W/src/features/dating/pages/DatingChats.tsx" \
        "$W/src/app/mira-reads-one-chat.test.ts" \
        land-she-reads-the-dating-thread.sh || die "git add"
git commit -F - <<'MSG' || die commit
She reads the dating thread

"add mira to dating chats too" - the owner, 15 Aug.

Her whole lockup now sits in the dating thread's header, beside the match
score and the call keys, and a press opens the SAME panel the city chats
open - not a second implementation of it. That is the whole design
decision here. A dating conversation is the one people most want a second
read on ("what did that actually mean?"), and it is also the one where the
other person's words are least anybody's to keep: a stranger, three
messages in, who has not agreed to be studied. A copy of the confidant
living in the dating hub could quietly grow a memory the original does not
have, and nobody would notice until it had one. One component, one route,
one promise.

So the scope is what it already was, enforced the same way: what she reads
is the window this screen is rendering, handed over as a prop and capped
at forty turns - words only, deletions already gone - and the server never
queries the chat tables for it. No memory is read, none is written, no
chart, no name, no history; the panel keeps nothing on the device either,
and closing it ends it. The guard test now holds all of that for the
dating thread by name, so the day somebody wires a second panel in here it
goes red rather than live.
MSG
ok committed
say "review, then:  git push"
