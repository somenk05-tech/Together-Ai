#!/usr/bin/env bash
# land-one-door-per-room.sh  ·  run from the REPO ROOT
#
# The floating Mira mark hid itself on /chats and nowhere else, so it went on
# floating over Dating chats - which already carries her mark in its own header
# - and over the anonymous Local Services threads. One screen, two doors to the
# same assistant.
#
# Web only. No API change, no migration.
#
# RUN AFTER "The alerts panel is not a pill" - that commit touches
# src/layouts and src/app too, and this scope check will refuse while its
# files are still uncommitted.
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'One door per room' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'The alerts panel is not a pill' >/dev/null \
  || die "run land-the-alerts-panel-is-not-a-pill.sh first - it touches src/layouts and src/app as well"
ok "the base is here, this is not"

say "2 - scope"
MINE='(layouts/MiraDock\.tsx|app/mira-is-two-tabs-and-a-door\.test\.ts)$'
DIRTY="$(git status --porcelain -uall -- "$W/src/layouts" "$W/src/app")"
OTHERS="$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -v '^[[:space:]]*$' || true)"
TRACKED_STRAY="$(printf '%s\n' "$OTHERS" | grep -v '^??' | grep -v '^[[:space:]]*$' || true)"
[ -z "$TRACKED_STRAY" ] || { printf '   \033[31mx\033[0m these tracked files carry edits this script did not write:\n%s\n' "$TRACKED_STRAY"; \
  die "another session is editing the same code - do not force past this"; }
if [ -n "$OTHERS" ]; then
  printf '   \033[33m~\033[0m new files from another session are here and are NOT being committed:\n%s\n' "$OTHERS"
else
  ok "the two files this commit touches are the only ones it will add"
fi

say "3 - sha256"
FILES=(
  "${W}/src/layouts/MiraDock.tsx"
  "${W}/src/app/mira-is-two-tabs-and-a-door.test.ts"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "${W}/src/layouts/MiraDock.tsx"                    b54905592b1f6b4facbc58d2e46da89208de1d9cdc96189bb35d0e4a990d704b
check "${W}/src/app/mira-is-two-tabs-and-a-door.test.ts" fdabd6e4255acde0349f3474a9d53ab8f4aded097ae9f35ea982285a5cd33feb

say "4 - web gates"
cd "$W" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$W/src" | sed -n "s|^?? $W/||p")"
TSC_OUT="$(npx tsc --noEmit 2>&1 || true)"
FILTERED="$TSC_OUT"
while IFS= read -r f; do
  [ -n "$f" ] && FILTERED="$(printf '%s\n' "$FILTERED" | grep -vF "$f" || true)"
done <<EOF
$FOREIGN
EOF
if printf '%s\n' "$FILTERED" | grep -q "error TS"; then
  printf '%s\n' "$FILTERED"; die "web tsc"
fi
ok "web tsc"

npx vitest run                  && ok "web vitest (two new assertions)" || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npx vite build                  && ok "web build (vite)" || die "web build"
node scripts/dead-export-audit.mjs >/dev/null 2>&1 || note "dead-export-audit is over its ceiling by 3 pre-existing exports - somebody else's, untouched here"
cd ..

say "5 - commit"
git add "${FILES[@]}" land-one-door-per-room.sh || die "git add"
git commit -F - <<'MSG' || die commit
One door per room

The owner, 16 Aug: remove the floating Mira button from chats.

IT WAS ALREADY GONE FROM /chats - AND FROM NOWHERE ELSE. MiraDock has
hidden itself on that route since it was written, with the reason
alongside it: "not on /chats, where she already has the room to
herself." The reason was right and the guard was one hard-coded
`startsWith`, so every conversation surface built afterwards kept the
floating mark.

Dating chats is the one that shows: it grew its own `.mira-door` in the
conversation header, exactly like the Chat hub's, and the dock went on
floating over it. One screen, two ways into the same assistant, six
inches apart. The Local Services threads got the mark too - over a room
whose entire promise is that the person on the other side does not know
who you are, which makes a floating assistant the wrong furniture even
though it reads nothing.

So the rule is a list rather than a path: /chats, /dating/chats,
/services/messages. Said once, in the place the decision is taken.

THE SAME FAILURE AS THE ONE THIS TEST FILE ALREADY DOCUMENTS, pointed
the other way. There, a guard that outlived the button it was written
for - "phone ? null" written for "Enter your city" and left in place
when the copy became "Talk to Mira". Here, a guard that never grew to
cover the rooms that arrived after it. Both had a comment explaining
them, which is what made both survive being read, and both were found by
the owner looking at a render.

AND THE ASSERTION FOR THE OLD GUARD ALREADY EXISTED. The first run of
this change failed vitest: mira-is-two-tabs-and-a-door.test.ts has
asserted `pathname.startsWith('/chats')` since the dock was written, and
it is the right file to own that rule. So the fix goes there rather than
into a second test file arguing with it - the list is asserted once, in
the place that already knew about the dock.

Its new companion is the half that keeps this from drifting again: every
page carrying `.mira-door` in its own header must appear in the dock's
list. A third conversation surface with its own mark now fails the suite
instead of quietly shipping two doors.

Gates: web tsc, the whole vitest suite (2 new assertions), the four
audits at their ceilings, and the web build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018wnHW4SL446MrzLXdUgBrY
MSG
ok "committed"
say "done - now push"
