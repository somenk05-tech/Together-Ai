#!/usr/bin/env bash
# land-a-friend-keeps-her-own-room.sh  ·  run from the REPO ROOT
#
# The owner, looking at one merged transcript under the new tabs: "dont merge
# chats with mira as a friend and as city assistant keep it different."
#
# Each tab now keeps its own day. The friend's thread lives under its own
# storage key; the assistant keeps the ORIGINAL key, so every conversation
# from before the split is still exactly where its citizens left it — in the
# assistant's room. Switching tabs swaps the thread and drops the held
# question (an answer read against the wrong conversation is the choose.ts
# bug reborn); "Forget today" forgets the tab you are standing in, not both.
# The seed, the mood and the meter stay shared — one person, two rooms.
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
LOG="$(git log --oneline -60)"
printf '%s\n' "$LOG" | grep 'A friend keeps her own room' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Mira is two tabs' >/dev/null
[ $? -eq 0 ] || die "base commit 'Mira is two tabs, and a door on every page' is not here"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/features/chat/mira/" "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" \
  | grep -Ev '(src/features/chat/mira/(day\.ts|MiraThread\.tsx)|src/app/mira-is-two-tabs-and-a-door\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/chat/mira/day.ts"               32afdede5f3ce2b70f0a5f578c85b49942aeecfe9320c7f1bb0fce060d45ac6e
check "$W/src/features/chat/mira/MiraThread.tsx"       c60916f99063933073378833af2b9a28a3c55bf4c880ab5cfefc1572082a8d02
check "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" 7dfdaa536a056bfc1db3105e43fd0bbc20812eb611753cd9922cd9e5a8aa7af3

say "4 - gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
say "   reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "5 - commit"
git add "$W/src/features/chat/mira/day.ts" \
        "$W/src/features/chat/mira/MiraThread.tsx" \
        "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" \
        land-a-friend-keeps-her-own-room.sh

git commit -F - <<'MSG'
A friend keeps her own room

"dont merge chats with mira as a friend and as city assistant keep it
different" - the owner, looking at one transcript where a heart-to-heart
scrolled straight into "take me to budgets".

Each tab now keeps its own day. day.ts grows rooms: the friend's thread
lives under mira.day.friend, and the assistant keeps the ORIGINAL key, so
every conversation from before the split is still exactly where its
citizens left it - in the assistant's room, which is what those
conversations were. The default room maps to the original key, which is
also what keeps every existing spec of the day store true without an edit.

Switching tabs swaps the thread and drops the held question - the options
she offered in one room must not be read as answered by a sentence typed in
the other, which is the choose.ts loop reborn one level up. "Forget today"
forgets the tab you are standing in, not both; the greeting marker clears
either way, because half-remembering having said hello is worse than
saying it twice.

What stays shared, on purpose: the seed, the mood, the meter, and the tab
memory. She is one person with two rooms, not two people - the same 200
free conversations span both, and the same Mira turns up in each.

The transcript sent to the model now carries only the room being spoken
in, which is its own kind of correctness: the friend no longer sees the
errands, and the assistant no longer sees the confessions.
MSG

ok committed
say "review, then:  git push"
