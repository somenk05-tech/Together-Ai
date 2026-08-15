#!/usr/bin/env bash
# land-a-way-back-from-her-room.sh  ·  run from the REPO ROOT
#
# "have a back button on the mobil version for this" - the owner, standing
# in Mira's room on a phone with no way out. Her room replaces the thread
# header - the one place the back arrow lived - so it now carries its own.
#
# Handles both states: if "Her whole name on the door" has not landed yet,
# its commit lands first from the same files (shared files at final state).
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
printf '%s\n' "$LOG" | grep 'A way back from her room' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep "Her mark takes the stage" >/dev/null
[ $? -eq 0 ] || die "base commit \"Her mark takes the stage's ink\" is not here"
HAVE_DOOR=0
printf '%s\n' "$LOG" | grep 'Her whole name on the door' >/dev/null && HAVE_DOOR=1
if [ "$HAVE_DOOR" = 0 ]; then
  rm -f land-her-whole-name-on-the-door.sh
  ok "the whole-name commit lands first, from these same files"
else
  ok "whole-name already landed - only the way back will be committed"
fi

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/styles/mira.css" "$W/src/features/chat/pages/Chats.tsx" "$W/src/features/chat/mira/MiraThread.tsx" "$W/src/app/mira-reads-one-chat.test.ts" "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" \
  | grep -Ev '(src/styles/mira\.css|src/features/chat/pages/Chats\.tsx|src/features/chat/mira/MiraThread\.tsx|src/app/(mira-reads-one-chat|mira-is-two-tabs-and-a-door)\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "stop"; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/chat/mira/MiraThread.tsx"        c859d6836d24a3f700f90861334d60ae68d25bd3c6c0120c0ad2f61f9622515d
check "$W/src/features/chat/pages/Chats.tsx"            0fa65c7fc494a05768930513aa6da257712098bf838287154eedfc2f112c4341
check "$W/src/styles/mira.css"                          588bcd1dcee2d444079659462c46ce554f384107505e7659fc5e7e0c6daa7ad4
check "$W/src/app/mira-is-two-tabs-and-a-door.test.ts"  ac0c99a826d2e719c29a7436c896d49f041566ffe9d5c5e01f82140e4d5b2818
check "$W/src/app/mira-reads-one-chat.test.ts"          798c779c0b36b0c3ef5060d74d329dce2a39571b02e475a565a0ab613999e405

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

if [ "$HAVE_DOOR" = 0 ]; then
say "5 - commit 1 · her whole name on the door"
git add "$W/src/styles/mira.css" \
        "$W/src/features/chat/pages/Chats.tsx" \
        "$W/src/app/mira-reads-one-chat.test.ts" || die "git add (door)"
git commit -F - <<'MSG' || die "commit (door)"
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
hers. It appears rather than animating in; focus-visible shows it too, so
a keyboard learns the same thing a cursor does, and the button's title
repeats it word for word. The aria-label still names the ACTION, which is
what a screen reader needs from a button.

The shared files here also carry the next commit's back-arrow bits -
mira.css's .mira-back and Chats.tsx's onBack wire - because a file's
changes cannot be sliced; the next commit stages what is purely its own.
MSG
ok "committed the door"
else
say "5 - staging the shared files' half of this change"
git add "$W/src/styles/mira.css" "$W/src/features/chat/pages/Chats.tsx" || die "git add (shared)"
fi

say "6 - commit · a way back from her room"
git add "$W/src/features/chat/mira/MiraThread.tsx" \
        "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" \
        "$W/src/styles/mira.css" \
        "$W/src/features/chat/pages/Chats.tsx" \
        land-a-way-back-from-her-room.sh || die "git add (back)"
git commit -F - <<'MSG' || die "commit (back)"
A way back from her room

"have a back button on the mobil version for this" - the owner, standing
in Mira's room on a phone with no way out.

He had found a real hole. On a phone the chat page shows one room at a
time, and every HUMAN conversation gets the back arrow because it lives
in the thread header - but Mira's room replaces that header entirely
(her tabs are her chrome), so opening her from the list was a one-way
door: no arrow, no list, pinch and hope.

So her room carries its own way back now. MiraThread takes an optional
onBack; when it is passed, the same arrow every human thread has appears
at the head of her tabs row, drawn in her room's own chip shape. It is
passed ONLY where somebody can actually be stuck - the phone's chat page
- and explicitly never by the dock, which floats over a page and already
has its close and its scrim. The tabs keep their group semantics one
level down (display: contents), so "Which Mira" still reads as one
choice to a screen reader and the back arrow does not read as a third
Mira.
MSG
ok "committed the way back"

say "review, then:  git push"
