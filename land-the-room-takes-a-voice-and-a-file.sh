#!/usr/bin/env bash
# land-the-room-takes-a-voice-and-a-file.sh  ·  run from the REPO ROOT
#
# Voice notes and file transfer in chat.
#
# THE BACKEND WAS ALREADY THERE, WHICH IS THE STORY. MessageType has carried
# VOICE and FILE since the schema was written, Attachment has carried duration
# and size, SendMessageSchema explicitly permits a message with no text so long
# as it has an attachment, SocketSendSchema IS that schema, and every upload in
# the city already goes through mediaApi — the chokepoint where a photo's
# coordinates are stripped before the bytes leave the browser. Nothing could
# reach any of it: the composer sent a string, and the thread rendered `body`
# and `share` and ignored `media` entirely.
#
# Two real gaps in the API, both small:
#   · Attachment gains `name` (+ migration). Storage keys are uuids by design;
#     a recipient needs to be told they were sent "lease-agreement.pdf".
#   · serialize() folded audio into 'file' and dropped every column but the
#     URL, so a voice note arrived with no duration and a document with no name
#     or size — the three facts that make either renderable.
#
# Verified through the bridge: both tscs clean, lint 0, nav/a11y/motion at
# their ceilings, no chromatic hex or surface literal added to relief.css.
# `prisma validate` cannot run here (no network for engines) and is a gate
# below, before generate and tsc, as the API's own land scripts do.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] && [ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"; rm -f .git/index.lock
fi

NEEDS="The room takes a voice and a file"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
case "$LOG" in
  *"The built day takes its paper"*) ;;
  *) echo "!! Run land-the-built-day-takes-its-paper.sh first — this lands on top of it."; exit 1 ;;
esac

ALLOWED='^((M |MM| M) (together-city-chat/(prisma/schema\.prisma|src/messages/(dto/messages\.dto\.ts|messages\.service\.ts))|together-city-react/src/(api/(schemas|chat\.api|index)\.ts|types/index\.ts|styles/relief\.css|features/chat/components/(Composer|MessageThread)\.tsx))|\?\? together-city-chat/prisma/migrations/20260813230000_attachment_name/)$'
PKG='together-city-(chat|react)/'
STATUS="$(git status --porcelain)"

IN_SCOPE="$(printf '%s\n' "$STATUS" | grep -E "$PKG" | grep -Ev "$ALLOWED" || true)"
if [ -n "$IN_SCOPE" ]; then
  echo "!! The packages carry changes this script did not expect:"; echo "$IN_SCOPE"
  echo "   Another session may be working here. Do not force past this."; exit 1
fi
TRACKED_ELSEWHERE="$(printf '%s\n' "$STATUS" | grep -Ev '^\?\?' | grep -Ev "$PKG" || true)"
if [ -n "$TRACKED_ELSEWHERE" ]; then
  echo "!! Tracked files outside the packages have uncommitted changes:"; echo "$TRACKED_ELSEWHERE"; exit 1
fi
echo "== the tree is what this script expects"

verify() {
  local want="$1" path="$2" got
  [ -f "$path" ] || { echo "!! Missing: $path"; exit 1; }
  got="$(shasum -a 256 "$path" | awk '{print $1}')"
  [ "$got" = "$want" ] || { echo "!! $path is not the file this script was written against."; echo "   want $want"; echo "   got  $got"; exit 1; }
}
verify d6c53e1734e5a763180db342ef0ac4312228a0fce610f1be0c0aaa48fa2a81bb together-city-chat/prisma/schema.prisma
verify 63bdbdbf0979e4ba1b795d2c04cde966f3eab45ef43bf441f1ee6a632d51525d together-city-chat/prisma/migrations/20260813230000_attachment_name/migration.sql
verify 359368c3eb689736a0afbd82b25f101e79b3a724365281f68784b8513480a951 together-city-chat/src/messages/dto/messages.dto.ts
verify f29cd879fee7b68776991cff3b1588f224e893f107e28567eb2814fe0fa50851 together-city-chat/src/messages/messages.service.ts
verify 6e8a79aafad6827be08da35e8ca6aa8fed10637c5b4a58e24e7fa53bc1e6c9f3 together-city-react/src/api/schemas.ts
verify 8710c81bac667bf9f050ea32c21ac070c48b53c840c280d66af4f256d6efe182 together-city-react/src/api/chat.api.ts
verify 029343073fac4c47d4b91a5f97759cad6539bad8459877b096337048cc99d504 together-city-react/src/api/index.ts
verify d7d4692acffa485b99eb9a3f3c22bcdf1fe1479c75dc93e5c9144b99a1769b0f together-city-react/src/types/index.ts
verify 9abdafa33cdd449eedce37c5751134439a5fa40523565a80d57d5717f27bf7cf together-city-react/src/features/chat/components/Composer.tsx
verify 8a160d285f1e87e98530328a70da21d5f7e6fd58905e2645ebbf3dec60bb7fe1 together-city-react/src/features/chat/components/MessageThread.tsx
verify f8b41de0d00fe4e83012c55328412a6b2c4e30f1c1e1ebc9280bb6245ded579a together-city-react/src/styles/relief.css
echo "== all eleven files verified"

echo "== gates: the API"
cd together-city-chat
npx prisma validate
npx prisma generate
npx tsc --noEmit
npx jest src/messages src/chat src/shared --silent
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || { echo "!! ESLint produced no readable report."; exit 1; }
if [ "$API_LINT" -gt "$API_BASELINE" ]; then
  echo "!! API lint went UP: $API_LINT, main is at $API_BASELINE:"; npx eslint 'src/messages/**/*.ts' || true; exit 1
fi
echo "   API lint errors: $API_LINT (main: $API_BASELINE). Nothing added."
npm run build
cd ..

echo "== gates: the web app"
cd together-city-react
npx tsc --noEmit
npx vitest run
node scripts/lint-ceiling.mjs
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
echo "== reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

git add together-city-chat/prisma/schema.prisma \
        together-city-chat/prisma/migrations/20260813230000_attachment_name \
        together-city-chat/src/messages/dto/messages.dto.ts \
        together-city-chat/src/messages/messages.service.ts \
        together-city-react/src/api/schemas.ts \
        together-city-react/src/api/chat.api.ts \
        together-city-react/src/api/index.ts \
        together-city-react/src/types/index.ts \
        together-city-react/src/styles/relief.css \
        together-city-react/src/features/chat/components/Composer.tsx \
        together-city-react/src/features/chat/components/MessageThread.tsx \
        land-the-room-takes-a-voice-and-a-file.sh

git commit -F - <<'MSG'
The room takes a voice and a file

Chat can send a voice note and a file, and show what arrives.

THE BACKEND WAS ALREADY THERE, which is most of the story and the reason this
is a small commit for a large-sounding feature. MessageType has carried VOICE
and FILE since the schema was written. Attachment has carried duration, size
and mimeType just as long. SendMessageSchema explicitly permits a message with
no text so long as it carries an attachment, and SocketSendSchema IS that
schema - so the live socket has accepted attachments the whole time. Every
upload in the city already goes through mediaApi, the chokepoint where a
photo's coordinates are stripped before the bytes leave the browser.

Nothing could reach any of it. The composer sent a string, and the thread
rendered `body` and `share` and ignored `media` entirely. A feature that
exists in the table, the DTO, the gateway and the upload path, and nowhere a
citizen can touch, is not a feature - it is a plan somebody stopped halfway
through, and it had been sitting that way long enough to look deliberate.

TWO REAL GAPS IN THE API, BOTH SMALL. Attachment gains `name`, with a
migration: storage keys are `uploads/<user>/<uuid>.<ext>` by design, which is
right for storage and useless to a recipient, who needs to be told they were
sent "lease-agreement.pdf". And serialize() folded audio into 'file' and
dropped every column but the URL - so a voice note arrived with no duration
and a document with no name and no size, the three facts that make either
renderable as anything better than a link.

THE BYTES GO FIRST, THE MESSAGE SECOND. A row that points at a file still
uploading renders as a broken link for as long as the upload takes, and
forever if it fails - so the composer uploads, says what it is doing, and
leaves the typed text where it is if the upload fails. Over the size limit is
refused before the presign, with the size and the limit both named.

WHAT ARRIVES IS RENDERED AS WHAT IT IS: a photo as the photo, a video and a
voice note in the browser's own player - which brings scrubbing, keyboard
control and the platform's accessibility for free, where a hand-drawn waveform
would be a picture of a sound nobody has decoded - and a file as a row
carrying its name and its weight, so somebody can decide whether to open it
before they do. The voice note has no caption track and says so in a comment
rather than shipping an empty <track>: it is speech nobody has transcribed,
and the duration is stated instead.

TWO QUIET KEYS AND ONE RAISED ONE. The paperclip and the microphone are flat,
in the stage's soft ink; the send stays the only raised key in the capsule,
and the microphone gives way to it the moment there is text - one key in that
corner, doing the thing the box is holding. Recording shows a single pulsing
dot and a clock, with discard beside send, and under a second is treated as a
slip of the finger rather than a message. Reduced motion holds the dot steady
rather than removing it: the dot IS the state, and a state you can only
perceive by watching it move is not one. A refused microphone says how to
turn it back on instead of failing silently, and a recorder left running when
the room closes stops its tracks - a microphone light that stays on after you
leave is the worst bug this feature could have.
MSG

echo "== committed"
cat <<'DONE'

===============================================================
 Landed: The room takes a voice and a file
 Push — Railway applies the Attachment.name migration on boot,
 Vercel rebuilds the web app. Then open a chat: paperclip to
 send a file, microphone to record.
===============================================================

DONE
