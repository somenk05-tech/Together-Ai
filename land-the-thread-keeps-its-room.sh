#!/usr/bin/env bash
# land-the-thread-keeps-its-room.sh  ·  run from the REPO ROOT
#
# Round two on the mail thread, from the owner's screenshots an hour after the
# first round deployed. Three faults, web only:
#
# THE SIDEBAR FORGOT THE ROOM. Open a message from a project's inbox and the
# rail showed the whole mailbox's folders — /mail/message/<id> carries no
# project in its URL, so the rail's room detection had nothing to read. The
# message itself knows: it is already in the query cache, and its projectId
# resolves to a key through the projects list. Both lookups are disabled off
# the mail message routes.
#
# THE BLANK DOZEN WERE STILL ON SCREEN. Deletable one bin at a time was not
# the ask — "removed" was. They are hidden from the trail (still in Sent with
# their bins; the server refuses new ones), except the one the citizen
# deep-linked into, which must render or the page is about nothing.
#
# THE REPLY WAS HALF A COMPOSER. "The reply needs to be the full stack
# instead of half" — so the inline box now carries the whole desk: editable
# To, Cc/Bcc behind a press, files from Drive, partial-failure reporting,
# exactly Compose's manners. The collapsed state is a full-width reply row,
# not a chip in a corner. Only the subject stays behind the full-composer
# door: changing it is starting a new message.
#
# Verified through the bridge: tsc clean, lint 0, a11y 0, nav clean, motion
# at ceiling, source-guards green (20 assertions in the thread guard alone).
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
printf '%s\n' "$LOG" | grep 'The thread keeps its room' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'A reply happens in the thread' >/dev/null
[ $? -eq 0 ] || die "base commit 'A reply happens in the thread' is not here - this lands on top of it"
ok "base is here, the fix is not"

say "2 - scope"
# Only the four files below may be dirty on the mail surface and layouts.
STRAY="$(git status --porcelain -- "$W/src/features/mail/" "$W/src/layouts/" "$W/src/app/a-reply-happens-in-the-thread.test.ts" \
  | grep -Ev '(src/features/mail/pages/MessageView\.tsx|src/layouts/Sidebar\.tsx|src/features/mail/api\.ts|src/app/a-reply-happens-in-the-thread\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the surface carries only this change, or nothing"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/features/mail/pages/MessageView.tsx"        31eba926d55d7bac9a84929ac44d5a9222c5ec62106656763168acfb4cca2e3f
check "$W/src/layouts/Sidebar.tsx"                        7c93578f5f4b3303fa39396cf4ab4415f6b6a546832c6302967b397ac225808d
check "$W/src/features/mail/api.ts"                       2a883b374cbb11158dc89243d087b96ba7c0341cc83f8784980f0eb8bb0db5a2
check "$W/src/app/a-reply-happens-in-the-thread.test.ts"  a87a8ad451d973fb47a9bab516f725b3490de34151c7cb33bf03ec018add6686

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
git add "$W/src/features/mail/pages/MessageView.tsx" \
        "$W/src/layouts/Sidebar.tsx" \
        "$W/src/features/mail/api.ts" \
        "$W/src/app/a-reply-happens-in-the-thread.test.ts" \
        land-the-thread-keeps-its-room.sh

git commit -F - <<'MSG'
The thread keeps its room

Round two on the mail thread, from the owner's screenshots an hour after
round one deployed. Three faults, all web, all in or around MessageView.

THE SIDEBAR FORGOT THE ROOM. Open a message from a project's inbox and the
rail showed the whole mailbox's folders. The rail's room detection reads the
URL, and /mail/message/<id> says nothing about a project - so standing inside
"together", reading its own mail, the sidebar claimed you had left. The rule
that fixed this for /mail/p/ and for the composer ("the rail belongs to the
room") now covers the third door: the message itself knows its room. It is
already in the query cache - the page fetched it - and its projectId resolves
to a key through the projects list. Both lookups are disabled everywhere but
a mail message route, so the other twenty-four hubs fetch nothing;
useMailProjects grew an `enabled` parameter for exactly this caller.

THE BLANK DOZEN WERE STILL ON SCREEN. Round one made them deletable, one bin
each; the ask was "removed". A message whose body strips to nothing is not
part of a conversation - it renders as a wall of "You (no text)" between the
words that were actually exchanged - so the trail no longer shows them.
Hidden, not destroyed: the rows still exist in Sent, where each has its own
bin, and the server now refuses to create new ones, so the set can only
shrink. The one exception is the message the citizen deep-linked into, which
must stay visible or the page appears to be about something else entirely.
The count, the byte meter, the reply target and the quote all follow the
visible trail.

THE REPLY WAS HALF A COMPOSER. "The reply needs to be the full stack instead
of half" - the owner, 15 Aug. The inline box now carries the whole desk:

  - To, editable and re-seeded when the thread's other party changes
  - Cc and Bcc behind the same "Add Cc or Bcc" press as Compose
  - files from Drive, attached without leaving the thread
  - partial-failure reporting, verbatim Compose's - a reply to three people
    where one is refused stays on the page and names the refused address
  - the quoted trail behind the ... control, joined at send

The collapsed state is a full-width reply row at the foot of the thread -
Gmail's shape - rather than a chip in a corner. The one thing still behind
the full-composer door is the subject, because changing the subject is
starting a new message, and that is what the full composer is for.

The thread guard grew from twelve assertions to twenty and pins all three:
the sidebar resolution, the blank filter with its deep-link exception, and
the full desk.
MSG

ok committed
say "review, then:  git push"
