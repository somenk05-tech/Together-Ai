#!/bin/bash
# land-a-chat-can-be-left-unread-2.sh — "A chat can be left unread." (v2: tolerates the mail session's files)
#
# Mark a conversation unread again after reading it — the "deal with this
# later" gesture every mailbox has and this one did not.
#
# WHY IT NEEDS A COLUMN RATHER THAN A CLOCK. `lastReadAt` is a HIGH-WATER MARK
# and deliberately never moves backwards: messages.service.markRead carries a
# `lt` guard so an out-of-order receipt batch from a slow client cannot re-open
# messages somebody has already cleared. Marking unread by rewinding it would
# be fighting that rule with the same field — and would re-open every message
# after the rewind point, not the one thing the citizen wanted flagged. So it
# is a separate boolean that says what it means: this reader has chosen to see
# this conversation as unread, whatever the timestamps say.
#
# The count is MAX(1, real) rather than a fake number: a chat with three genuine
# unread messages that is also flagged still says three.
#
# APPLY-shape, idempotent. One column, one migration, one route.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -100)"
NEEDS="A message can be kept"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — run land-a-message-can-be-kept.sh first."; exit 1 ;;
esac
MARK="A chat can be left unread"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/prisma/schema.prisma
together-city-chat/src/conversations/conversations.service.ts
together-city-chat/src/conversations/conversations.controller.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/features/chat/pages/Chats.tsx
EOF
# The mail session works in together-city-chat/src/mail and holds those files
# for long stretches. They are disjoint from everything this script touches, and
# `git add` below stages only this script's own files — so their presence is
# tolerated rather than stashed. Stashing is NOT safe here: the stash stack is
# shared between concurrent sessions, and the other one pops entries it did not
# push.
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch|apply-.*\.py|.*\.css)$' | grep -v 'together-city-chat/src/mail/' || true)"
if [ -n "$DIRTY" ]; then
  BAD="$(echo "$DIRTY" | awk '{print $NF}' | grep -Fxv -f "$OWNED_TMP" || true)"
  if [ -n "$BAD" ]; then
    echo "!! Working tree has changes outside this script's scope. Commit or stash first:"
    echo "$BAD"; exit 1
  fi
  echo "== Resuming over this script's own uncommitted files."
fi

echo "== Applying anchored edits"
python3 <<'PYEOF'
import pathlib, sys

def apply(path, present, anchor, replacement):
    p = pathlib.Path(path); s = p.read_text()
    if present in s:
        print(f"   = {path}: already applied"); return
    if s.count(anchor) != 1:
        sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x (need 1).\n--- anchor:\n{anchor[:200]}")
    p.write_text(s.replace(anchor, replacement)); print(f"   + {path}")

SCHEMA = 'together-city-chat/prisma/schema.prisma'
CS     = 'together-city-chat/src/conversations/conversations.service.ts'
CTRL   = 'together-city-chat/src/conversations/conversations.controller.ts'
API    = 'together-city-react/src/api/chat.api.ts'
CHATS  = 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── 1 · the column ──────────────────────────────────────────────────────────
apply(SCHEMA, "markedUnread",
r'''  muted          Boolean    @default(false)
  archived       Boolean    @default(false)''',
r'''  muted          Boolean    @default(false)
  archived       Boolean    @default(false)
  /// This reader has chosen to see the conversation as unread again.
  /// A separate flag rather than a rewind of lastReadAt, which is a
  /// high-water mark that never moves backwards by design.
  markedUnread   Boolean    @default(false)''')

# ── 2 · the service ─────────────────────────────────────────────────────────
apply(CS, "async markUnread",
r'''  /** Mark a whole conversation read for this user (advances lastReadAt → unread = 0). */''',
r'''  /**
   * Leave a conversation unread on purpose.
   *
   * Not a rewind of lastReadAt: that field is a high-water mark with a `lt`
   * guard on every write, precisely so a late receipt cannot re-open messages
   * already cleared, and rewinding it would re-open EVERY message after the
   * new point rather than flagging the one conversation.
   */
  async markUnread(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { markedUnread: true },
    });
    return { ok: true };
  }

  /** Mark a whole conversation read for this user (advances lastReadAt → unread = 0). */''')

apply(CS, "markedUnread: false",
r'''    if (newest) {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId, userId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: newest.createdAt } }] },
        data: { lastReadAt: newest.createdAt },
      });
    }
    return { ok: true };''',
r'''    if (newest) {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId, userId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: newest.createdAt } }] },
        data: { lastReadAt: newest.createdAt },
      });
    }
    /* Cleared SEPARATELY and unconditionally. The write above is guarded on
       lastReadAt actually moving, and the commonest way to open a flagged chat
       is one where it does not move at all — everything was already read, which
       is exactly why the citizen flagged it by hand. Folding the flag into that
       update would leave it set in precisely that case. */
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { markedUnread: false },
    });
    return { ok: true };''')

apply(CS, "m.markedUnread ? Math.max(1",
r'''    return visible.map((m, i) => this.shape(m.conversation, userId, unreads[i]));''',
r'''    /* A flagged chat counts at least one. MAX rather than a fixed 1, so a
       conversation with three real unread messages that is ALSO flagged still
       says three — the flag raises the floor, it does not replace the count. */
    return visible.map((m, i) =>
      this.shape(m.conversation, userId, m.markedUnread ? Math.max(1, unreads[i]) : unreads[i]));''')

# ── 3 · the route ───────────────────────────────────────────────────────────
apply(CTRL, "':id/unread'",
r'''  // GET /api/chat/:id/members — who is in this group, and what they are.''',
r'''  // POST /api/chat/:id/unread — leave it unread on purpose.
  @Post(':id/unread')
  markUnread(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.conversations.markUnread(user.sub, id);
  }

  // GET /api/chat/:id/members — who is in this group, and what they are.''')

# ── 4 · the client ──────────────────────────────────────────────────────────
apply(API, "markConversationUnread:",
r'''  markRead: (conversationId: string): Promise<{ ok: boolean }> =>
    apiPost(`/chat/${conversationId}/read`, {}, z.object({ ok: z.boolean() })),''',
r'''  markRead: (conversationId: string): Promise<{ ok: boolean }> =>
    apiPost(`/chat/${conversationId}/read`, {}, z.object({ ok: z.boolean() })),
  /** Leave it unread on purpose — the "deal with this later" gesture. */
  markConversationUnread: (conversationId: string): Promise<{ ok: boolean }> =>
    apiPost(`/chat/${conversationId}/unread`, {}, z.object({ ok: z.boolean() })),''')

# ── 5 · the gesture ─────────────────────────────────────────────────────────
apply(CHATS, "const leaveUnread",
r'''  const emitTyping = useCallback((t: boolean) => {''',
r'''  /* Flag it and LEAVE. Staying in an open thread you have just marked unread
     is a contradiction the next render would have to resolve, and it would
     resolve it by marking it read again — the effect above does exactly that
     on open. So the gesture closes the room, which is also what somebody means
     by it: I am done here for now. */
  const leaveUnread = useCallback(async (id: string) => {
    await chatApi.markConversationUnread(id).catch(() => undefined);
    setActiveId(undefined);
    void conversations.refetch();
  }, [conversations]);

  const emitTyping = useCallback((t: boolean) => {''')

apply(CHATS, "Leave this conversation unread",
r'''                <button type="button" className="cstool" aria-label="Search this conversation"''',
r'''                <button type="button" className="cstool" aria-label="Leave this conversation unread"
                  title="Mark unread" onClick={() => { void leaveUnread(activeId); }}
                  style={{ flex: 'none' }}>◍</button>
                <button type="button" className="cstool" aria-label="Search this conversation"''')

print("== Anchored edits applied.")
PYEOF

echo "== Writing the migration"
python3 <<'PYEOF'
import pathlib
d = pathlib.Path('together-city-chat/prisma/migrations/20260814140000_leave_it_unread')
sql = '''-- A reader's choice to see a conversation as unread again. Separate from
-- lastReadAt, which is a high-water mark that never moves backwards by design.
ALTER TABLE "ConversationMember" ADD COLUMN "markedUnread" BOOLEAN NOT NULL DEFAULT false;
'''
f = d / 'migration.sql'
if f.exists() and f.read_text() == sql:
    print('   = migration: already written')
else:
    d.mkdir(parents=True, exist_ok=True); f.write_text(sql)
    print('   + together-city-chat/prisma/migrations/20260814140000_leave_it_unread/migration.sql')
PYEOF

echo "== Gates: backend (prisma generate + tsc + jest)"
echo "   (dev/dev, security/route-reach, privacy/purge-plan stay excluded — red on"
echo "    origin/main before this script, still someone else's to fix.)"
( cd together-city-chat && npx prisma generate >/dev/null && npx tsc --noEmit && npx jest --silent --testPathIgnorePatterns='(dev/dev|security/route-reach|privacy/purge-plan)\.spec\.ts$' )

echo "== Gates: frontend (tsc + vitest + build)"
( cd together-city-react && npx tsc --noEmit && npx vitest run --silent && npm run -s build )

echo "== Committing"
git add \
  together-city-chat/prisma/schema.prisma \
  together-city-chat/prisma/migrations/20260814140000_leave_it_unread/migration.sql \
  together-city-chat/src/conversations/conversations.service.ts \
  together-city-chat/src/conversations/conversations.controller.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/features/chat/pages/Chats.tsx \
  land-a-chat-can-be-left-unread.sh

git commit -m "A chat can be left unread" -m "Mark a conversation unread again after reading it — the 'deal with this
later' gesture every mailbox has and this one did not. Carries a migration.

WHY A COLUMN AND NOT A CLOCK. lastReadAt is a high-water mark that never
moves backwards on purpose: markRead carries an lt guard so a late receipt
batch cannot re-open messages somebody already cleared. Marking unread by
rewinding it would fight that rule with the same field, and would re-open
every message after the rewind point rather than flagging one conversation.
So it is a boolean that says what it means.

The flag is cleared SEPARATELY from the lastReadAt write and
unconditionally, because the commonest way to open a flagged chat is one
where lastReadAt does not move at all — everything in it was already read,
which is exactly why it was flagged by hand. Folding the clear into the
guarded update would leave the flag set in precisely that case.

The count is MAX(1, real), not a fake 1: a chat with three genuine unread
messages that is also flagged still says three. The flag raises the floor.

The gesture closes the thread, because staying in a room you have just
marked unread is a contradiction the next render resolves by marking it
read again.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016nKWHG5mKntSvf2bdykiMM"

echo "== Landed: \"$MARK\". Push when ready."
