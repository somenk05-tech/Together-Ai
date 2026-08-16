#!/usr/bin/env bash
# land-a-face-on-the-row.sh  ·  run from the REPO ROOT
#
# Owner, 16 Aug: real pictures in the chats list, not initials - and a way to
# change the picture there, independent of the platform profile photo.
#
# THE PHOTOS WERE ALREADY BEING LOADED FOR THESE ROWS AND THROWN AWAY.
# `listForUser` selects `profileImage` for every member and `shape()` drops it,
# so the list has drawn initials over data it already had since it was written.
#
# TWO CALLS, AND THE SPLIT IS THE WHOLE ENGINEERING DECISION. `profileImage` is
# a `data:` URL of tens of kilobytes, and /chat/conversations is polled every
# fifteen seconds by every open client. Putting faces in that payload - the
# obvious three-line fix - would re-download every face four times a minute for
# something that changes about twice a year. /chat/roster carries ids and
# pictures only, is cached for five minutes, and is written through on a change
# so the new picture is instant.
#
# WHOSE FACE, IN ORDER: the picture this reader chose; else, for a direct chat,
# the other person's own account photo; else nothing and the row keeps its
# initials. A GROUP GETS NO FACE - there is no group photo in this schema and
# borrowing one member's for a room of six invents a fact. AN ANONYMOUS MATCH
# GETS NOTHING, EVER: that conversation's promise is that the face is not shown
# yet, and sending it for the client to hide is the identity disclosed anyway.
# Both are pinned server-side and again on the surface that would draw it.
#
# THE PICTURE IS A CONTACT PHOTO, in the sense a phone address book means one.
# It is the reader's own note, private to them, and it never touches the other
# citizen's account - which the panel says out loud, because a control that
# might be editing somebody else's profile is one nobody presses. It lives on
# ConversationMember beside markedUnread, clearedAt and pinned: the other things
# one person decides about a conversation without the other one finding out.
#
# ONE MIGRATION, ONE NULLABLE COLUMN, EVERY LINE ADDITIVE. Nothing existing is
# altered and nothing is backfilled, so a rollback leaves every row as it was.
#
# `prisma generate` RUNS FIRST BELOW, and is a gate rather than a pre-check: a
# new column means the generated client is stale until it runs, and that step
# cannot run in the sandbox this was written in - the engine download is 403 on
# linux-arm64. So the API tsc below is the FIRST typecheck this change gets;
# the spec was verified with ts-jest diagnostics off, which is honest about
# what was and was not proved before it reached your machine.
#
# SEVEN API SUITES ARE RED ON MAIN and none of them is this commit's; the gate
# is that the failing SET is unchanged.
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
git log --oneline -40 | grep 'A face on the row' >/dev/null \
  && die "already landed - re-running is a no-op by design"
ok "not landed yet"

say "2 - the edit is already in the tree"
SCH="$A/prisma/schema.prisma"
MIG="$A/prisma/migrations/20260817000000_a_face_on_the_row/migration.sql"
CS="$A/src/conversations/conversations.service.ts"
CC="$A/src/conversations/conversations.controller.ts"
CD="$A/src/conversations/dto/conversations.dto.ts"
CSP="$A/src/conversations/a-face-on-the-row.spec.ts"
RZ="$W/src/lib/resizeAvatar.ts"
CA="$W/src/api/chat.api.ts"
CI="$W/src/api/index.ts"
CL="$W/src/features/chat/components/ConversationList.tsx"
CH="$W/src/features/chat/pages/Chats.tsx"
PR="$W/src/features/profile/pages/Profile.tsx"
RE="$W/src/styles/relief.css"
CT="$W/src/app/a-face-on-the-row.test.ts"
for f in "$SCH" "$MIG" "$CS" "$CC" "$CD" "$CSP" "$RZ" "$CA" "$CI" "$CL" "$CH" "$PR" "$RE" "$CT"; do
  [ -f "$f" ] || die "missing $f"
done
grep -q 'photo          String?' "$SCH" || die "the column is not on ConversationMember"
grep -q 'async roster(userId: string)' "$CS" || die "no roster on the service"
grep -q "@Get('roster')" "$CC" || die "no /chat/roster route"
grep -q "@Put(':id/photo')" "$CC" || die "no way to set the picture"
grep -q 'cspic' "$CL" || die "the row has no picture control"
grep -q "from '@/lib/resizeAvatar'" "$CL" || die "the row does not use the shared resizer"
grep -q 'function resizeAvatar(' "$PR" && die "the profile page still carries its own copy of the crop"
ok "all fourteen files carry it"

STRAY="$(git status --porcelain -uall | grep -Ev '(prisma/schema\.prisma|migrations/20260817000000_a_face_on_the_row|conversations/conversations\.service\.ts|conversations/conversations\.controller\.ts|conversations/dto/conversations\.dto\.ts|conversations/a-face-on-the-row\.spec\.ts|lib/resizeAvatar\.ts|api/chat\.api\.ts|api/index\.ts|chat/components/ConversationList\.tsx|chat/pages/Chats\.tsx|profile/pages/Profile\.tsx|styles/relief\.css|app/a-face-on-the-row\.test\.ts|land-a-face-on-the-row\.sh)' | grep -v '^[[:space:]]*$' || true)"
if [ -n "$STRAY" ]; then
  note "files outside this change are dirty and are NOT being committed:"
  printf '%s\n' "$STRAY" | sed 's/^/       /'
fi

say "3 - the API gates"
cd "$A"
# FIRST, because a new column leaves the generated client stale and every
# typecheck below is meaningless against the old one.
npx prisma generate || die "prisma generate - the new column needs it before anything typechecks"
ok "prisma client regenerated"
npx tsc --noEmit || die "api tsc"
ok "api tsc clean"
npx jest src/conversations/a-face-on-the-row.spec.ts || die "the roster spec"
ok "the roster spec passes (8 tests: whose face, and whose it is never)"
npx jest src/conversations src/security 2>&1 | tail -5
npx jest src/conversations/chat-delete.spec.ts || die "chat-delete"
ok "the conversation specs still pass"
EXPECTED_RED="src/dev/dev.spec.ts src/security/query-scoping.spec.ts src/security/route-reach.spec.ts src/security/runtime-isolation.spec.ts src/shared/swallow.spec.ts src/shared/unbounded-reads.spec.ts src/shared/voice-scan.spec.ts "
OUT="$(npx jest 2>&1 || true)"
RED="$(printf '%s\n' "$OUT" | grep -E '^[[:space:]]*FAIL ' | awk '{print $2}' | sort -u | tr '\n' ' ')"
if [ "$RED" != "$EXPECTED_RED" ]; then
  printf '%s\n' "$OUT" | tail -60
  printf '\n   expected red: %s\n   actually red: %s\n' "$EXPECTED_RED" "$RED"
  die "the API suite's failing set changed - this commit is answerable for the difference"
fi
note "7 suites red on main, and still exactly those 7"
ok "API suite green apart from main's own backlog"
cd ..

say "4 - the web gates"
cd "$W"
npx tsc --noEmit || die "web tsc"
ok "web tsc clean"
npx vitest run src/app/a-face-on-the-row.test.ts || die "the face guard"
# The specs that read this row, its classes or its copy as source text.
npx vitest run src/app/remove-chat-not-delete.test.ts src/app/no-borrowed-class-names.test.ts \
               src/app/a-stage-does-not-export-its-ink.test.ts src/app/the-stage-lies-flat.test.ts \
               src/app/the-chat-stage-on-a-phone.test.ts src/app/relief.spec.ts \
               src/app/citizen-facing-copy.test.ts \
  || die "the chat-row / stage / copy guards"
ok "the face guard and all seven neighbours pass"
npx vitest run || die "web suite"
ok "web suite green"
node scripts/lint-ceiling.mjs   || die "lint ceiling"
node scripts/nav-audit.mjs      || die "nav audit"
node scripts/a11y-audit.mjs     || die "a11y ceiling"
node scripts/motion-ceiling.mjs || die "motion ceiling"
ok "lint, nav, a11y, motion all at ceiling"
DEAD="$(node scripts/dead-export-audit.mjs --list 2>&1 | grep -E '^\s+features/' | awk '{print $2}' | sort | tr '\n' ' ')"
[ "$DEAD" = "MedicalAdvisories PlanGuidanceBanner useGemCommission " ] || die "dead exports changed: $DEAD"
npm run build >/dev/null 2>&1 || die "vite build"
ok "build clean"
cd ..

say "5 - commit"
git add "$SCH" "$MIG" "$CS" "$CC" "$CD" "$CSP" "$RZ" "$CA" "$CI" "$CL" "$CH" "$PR" "$RE" "$CT" land-a-face-on-the-row.sh
git commit -q -m "A face on the row

The chats list drew initials over data it already had: listForUser selects
profileImage for every member and shape() dropped it. Real pictures now, with
initials as the fallback rather than the default.

TWO CALLS, ON PURPOSE. profileImage is a data: URL and /chat/conversations is
polled every fifteen seconds by every open client; faces in that payload would
be re-downloaded four times a minute for something that changes about twice a
year. /chat/roster carries ids and pictures, is cached five minutes, and is
written through on a change.

Whose face, in order: the picture this reader chose, then the other person's own
photo on a direct chat, then nothing. A group gets none - there is no group
photo in this schema and borrowing one member's for a room of six invents a
fact. An anonymous match gets none ever: that conversation's promise is that the
face is not shown yet, and sending it for the client to hide discloses it
anyway. Both pinned server-side and again where the drawing happens.

And the picture is the reader's to change - a contact photo in the sense a phone
address book means one. Private to them, and it never touches the other
citizen's account, which the panel says out loud. It lives on ConversationMember
beside markedUnread and clearedAt: the things one person decides about a
conversation without the other one finding out. One nullable column, additive.

The picker is a third sibling of the row, never inside its open button; the crop
leaves the profile page for lib/resizeAvatar so two surfaces share one square." \
  || die "commit"
ok "committed"
git log --oneline -1

say "done - now: git push"
say "NOTE: this one adds a column. Railway must run the migration on deploy."
