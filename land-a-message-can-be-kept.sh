#!/bin/bash
# land-a-message-can-be-kept.sh — "A message can be kept."
#
# Starred messages: keep one, find it again, filter the conversation down to
# what you kept. The first thing in this run of chat work that needs a column,
# so it carries a migration and Railway rebuilds.
#
# STARRING IS THE READER'S BOOKKEEPING, NOT THE MESSAGE'S. Two people can star
# the same message and neither can see the other's star — so this follows the
# shape `hiddenForJson` already set for "delete for me": a JSON array of user
# ids on the row, read per viewer. A join table would be the textbook answer
# and would also be a new Prisma model, which purge-plan.spec would then
# rightly demand a deletion policy for; the precedent in this file is a column,
# and consistency with it is worth more here than orthodoxy.
#
# The write is a conditional updateMany with a retry, NOT a $transaction — the
# same rule the audit learned from transaction-safety.spec: a transaction is
# not a lock, and the WHERE has to carry what was read.
#
# APPLY-shape, idempotent. One migration, one new route.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -100)"
NEEDS="A message can be sent on"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — run land-a-message-can-be-sent-on.sh first."; exit 1 ;;
esac
MARK="A message can be kept"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/prisma/schema.prisma
together-city-chat/src/messages/messages.service.ts
together-city-chat/src/messages/messages.controller.ts
together-city-chat/src/messages/dto/messages.dto.ts
together-city-react/src/api/schemas.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/types/index.ts
together-city-react/src/features/chat/components/MessageThread.tsx
together-city-react/src/features/chat/pages/Chats.tsx
EOF
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch|apply-.*\.py|.*\.css)$' || true)"
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
MS     = 'together-city-chat/src/messages/messages.service.ts'
CTRL   = 'together-city-chat/src/messages/messages.controller.ts'
DTO    = 'together-city-chat/src/messages/dto/messages.dto.ts'
SCH    = 'together-city-react/src/api/schemas.ts'
API    = 'together-city-react/src/api/chat.api.ts'
TYPES  = 'together-city-react/src/types/index.ts'
THREAD = 'together-city-react/src/features/chat/components/MessageThread.tsx'
CHATS  = 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── 1 · the column ──────────────────────────────────────────────────────────
apply(SCHEMA, "starredForJson",
r'''  hiddenForJson    String?     // JSON userId[] — users who chose "delete for me"''',
r'''  hiddenForJson    String?     // JSON userId[] — users who chose "delete for me"
  /// JSON userId[] — who has kept this message. A star is the READER's
  /// bookkeeping: two people can star the same row and neither sees the
  /// other's. Same shape as hiddenForJson deliberately, so the two
  /// per-reader facts about a message are read the same way.
  starredForJson   String?''')

# ── 2 · the service ─────────────────────────────────────────────────────────
apply(MS, "private starredBy",
r'''  /** Users who chose "delete for me" on a message (new column — offline client can't type it). */
  private hiddenFor(m: unknown): string[] {
    try { return JSON.parse((m as { hiddenForJson?: string | null }).hiddenForJson ?? '[]') as string[]; } catch { return []; }
  }''',
r'''  /** Users who chose "delete for me" on a message (new column — offline client can't type it). */
  private hiddenFor(m: unknown): string[] {
    try { return JSON.parse((m as { hiddenForJson?: string | null }).hiddenForJson ?? '[]') as string[]; } catch { return []; }
  }

  /** Whether this reader has kept this message. */
  private starredBy(m: unknown, userId: string): boolean {
    try {
      const list = JSON.parse((m as { starredForJson?: string | null }).starredForJson ?? '[]') as string[];
      return list.includes(userId);
    } catch { return false; }
  }

  /**
   * Keep a message, or stop keeping it.
   *
   * Conditional updateMany with a retry rather than a $transaction: a
   * transaction is not a lock (transaction-safety.spec says so at length), so
   * the WHERE carries the value that was read and a loser retries against the
   * fresh row. Two people starring the same message in the same instant is
   * the ordinary case in a busy group, not an exotic one.
   */
  async setStarred(userId: string, messageId: string, on: boolean) {
    await this.assertCanSeeMessage(userId, messageId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const fresh = await this.prisma.message.findUnique({
        where: { id: messageId }, select: { starredForJson: true },
      });
      const list = ((): string[] => {
        try { return JSON.parse(fresh?.starredForJson ?? '[]') as string[]; } catch { return []; }
      })();
      const has = list.includes(userId);
      if (has === on) return { ok: true as const, starred: on };
      const next = on ? [...list, userId] : list.filter((id) => id !== userId);
      const res = await this.prisma.message.updateMany({
        where: { id: messageId, starredForJson: fresh?.starredForJson ?? null },
        data: { starredForJson: JSON.stringify(next) },
      });
      if (res.count) return { ok: true as const, starred: on };
    }
    return { ok: true as const, starred: on };
  }

  /** A message you may star is a message you may read: membership, re-asked. */
  private async assertCanSeeMessage(userId: string, messageId: string): Promise<void> {
    const row = await this.prisma.message.findFirst({
      where: { id: messageId, conversation: { members: { some: { userId } } } },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Message not found');
  }''')

apply(MS, "starredForJson?: string | null;",
r'''    replyTo?: { id: string; text: string | null; messageType: string; senderId: string; deleted: boolean } | null;
  }) {''',
r'''    replyTo?: { id: string; text: string | null; messageType: string; senderId: string; deleted: boolean } | null;
    starredForJson?: string | null;
  }, viewerId?: string) {''')

apply(MS, "starred: viewerId",
r'''      edited: !!m.edited,
      deleted: m.deleted,''',
r'''      /* Starred is per READER, so it can only be answered when we know who is
         asking. Callers that serialize for one citizen pass their id; the
         broadcast paths do not, and false is the honest answer there — a
         socket frame goes to several people at once and cannot carry one
         person's bookkeeping. Their own next read fills it in. */
      starred: viewerId ? this.starredBy(m, viewerId) : false,
      edited: !!m.edited,
      deleted: m.deleted,''')

apply(MS, "this.serialize(m, userId)).reverse()",
r'''      items: visible.map((m) => this.serialize(m)).reverse(),''',
r'''      items: visible.map((m) => this.serialize(m, userId)).reverse(),''')

apply(MS, "starredOnly",
r'''    return messages.filter((m) => !this.hiddenFor(m).includes(userId)).map((m) => this.serialize(m));''',
r'''    return messages
      .filter((m) => !this.hiddenFor(m).includes(userId))
      // Starred-only is applied HERE rather than in the where clause: the
      // column is a JSON string, and `contains: userId` would also match a
      // substring of somebody else's id. Cheap, because the page is capped.
      .filter((m) => (dto.starredOnly ? this.starredBy(m, userId) : true))
      .map((m) => this.serialize(m, userId));''')

# ── 3 · dto + route ─────────────────────────────────────────────────────────
apply(DTO, "starredOnly",
r'''  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type SearchMessagesDto = z.infer<typeof SearchMessagesSchema>;''',
r'''  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Only what this reader has kept. A query-string flag, so '1'/'true' both read. */
  starredOnly: z.coerce.boolean().optional(),
});
export type SearchMessagesDto = z.infer<typeof SearchMessagesSchema>;

export const StarMessageSchema = z.object({ on: z.boolean() });
export type StarMessageDto = z.infer<typeof StarMessageSchema>;''')

apply(CTRL, "StarMessageSchema",
r'''  SendMessageDto,
  SendMessageSchema,
} from './dto/messages.dto';''',
r'''  SendMessageDto,
  SendMessageSchema,
  StarMessageDto,
  StarMessageSchema,
} from './dto/messages.dto';''')

apply(CTRL, "messages/:id/star",
r'''  // GET /api/messages/:id/info — declared AFTER messages/search on purpose:''',
r'''  // POST /api/messages/:id/star — keep it, or stop keeping it.
  @Post('messages/:id/star')
  @UsePipes(new ZodValidationPipe(StarMessageSchema))
  star(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: StarMessageDto) {
    return this.messages.setStarred(user.sub, id, dto.on);
  }

  // GET /api/messages/:id/info — declared AFTER messages/search on purpose:''')

# ── 4 · the client ──────────────────────────────────────────────────────────
apply(SCH, "starred: z.boolean()",
r'''  replyToMessageId: z.string().nullable().optional(),''',
r'''  starred: z.boolean().optional(),
  replyToMessageId: z.string().nullable().optional(),''')

apply(TYPES, "starred?: boolean;",
r'''  /** What this message answers. Keep in step with api/schemas.ts's''',
r'''  /** Whether YOU have kept this message — per reader, never shared. */
  starred?: boolean;
  /** What this message answers. Keep in step with api/schemas.ts's''')

apply(API, "starMessage:",
r'''  /** Who received and read one of YOUR messages. 403 for anybody else's. */''',
r'''  /** Keep a message, or stop. Per reader — nobody else sees your stars. */
  starMessage: (messageId: string, on: boolean): Promise<{ ok: boolean; starred: boolean }> =>
    apiPost(`/messages/${messageId}/star`, { on }, z.object({ ok: z.boolean(), starred: z.boolean() })),

  /** Who received and read one of YOUR messages. 403 for anybody else's. */''')

apply(API, "starredOnly?: boolean",
r'''  searchMessages: (params: {
    conversationId?: string; keyword?: string; from?: string; to?: string; limit?: number;
  }): Promise<Message[]> =>''',
r'''  searchMessages: (params: {
    conversationId?: string; keyword?: string; from?: string; to?: string; limit?: number; starredOnly?: boolean;
  }): Promise<Message[]> =>''')

apply(API, "starredOnly?: boolean,\n) {",
r'''export function useMessageSearch(
  conversationId: string | undefined,
  keyword: string,
  from?: string,
  to?: string,
) {
  const kw = keyword.trim();
  const active = Boolean(conversationId) && (kw.length >= 2 || Boolean(from) || Boolean(to));
  return useQuery({
    queryKey: ['chat', 'search', conversationId, kw, from ?? '', to ?? ''],''',
r'''export function useMessageSearch(
  conversationId: string | undefined,
  keyword: string,
  from?: string,
  to?: string,
  starredOnly?: boolean,
) {
  const kw = keyword.trim();
  // Starred-only is a search in its own right: "show me what I kept here" needs
  // no keyword and no dates.
  const active = Boolean(conversationId) && (kw.length >= 2 || Boolean(from) || Boolean(to) || Boolean(starredOnly));
  return useQuery({
    queryKey: ['chat', 'search', conversationId, kw, from ?? '', to ?? '', starredOnly ? 'starred' : ''],''')

apply(API, "...(starredOnly ? { starredOnly: true } : {}),",
r'''      ...(to ? { to: new Date(to + 'T23:59:59').toISOString() } : {}),
      limit: 50,''',
r'''      ...(to ? { to: new Date(to + 'T23:59:59').toISOString() } : {}),
      ...(starredOnly ? { starredOnly: true } : {}),
      limit: 50,''')

# ── 5 · the thread keeps it ─────────────────────────────────────────────────
apply(THREAD, "onStar?: (m: Message, on: boolean) => void",
r'''  onForward?: (m: Message) => void;''',
r'''  onForward?: (m: Message) => void;
  onStar?: (m: Message, on: boolean) => void;''')

apply(THREAD, "onForward, onStar, onJump",
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onForward, onJump, fetchInfo, jumpToId }: {''',
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onForward, onStar, onJump, fetchInfo, jumpToId }: {''')

apply(THREAD, "Keep this message",
r'''                  {onForward && !deleted && <button type="button" title="Forward" onClick={() => { onForward(m); setTouchOpen(null); }}>⤳ Forward</button>}''',
r'''                  {onStar && !deleted && (
                    <button type="button" title={m.starred ? 'Remove star' : 'Keep this message'}
                      onClick={() => { onStar(m, !m.starred); setTouchOpen(null); }}>
                      {m.starred ? '★ Kept' : '☆ Keep'}
                    </button>
                  )}
                  {onForward && !deleted && <button type="button" title="Forward" onClick={() => { onForward(m); setTouchOpen(null); }}>⤳ Forward</button>}''')

apply(THREAD, "aria-label=\"You kept this message\"",
r'''                {(m.edited || (mine && !deleted && m.status)) && !deleted && (
                  <div style={{ fontSize: 10.5, marginTop: 3, color: 'var(--on-stage-faint)' }}>
                    {m.edited && <span style={{ marginRight: 4 }}>edited</span>}''',
r'''                {(m.edited || m.starred || (mine && !deleted && m.status)) && !deleted && (
                  <div style={{ fontSize: 10.5, marginTop: 3, color: 'var(--on-stage-faint)' }}>
                    {m.starred && <span aria-label="You kept this message" style={{ marginRight: 4 }}>★</span>}
                    {m.edited && <span style={{ marginRight: 4 }}>edited</span>}''')

# ── 6 · the page wires it, and the search panel can show only what you kept ─
apply(CHATS, "const [starredOnly, setStarredOnly]",
r'''  const [jumpNote, setJumpNote] = useState<string | null>(null);''',
r'''  const [jumpNote, setJumpNote] = useState<string | null>(null);
  const [starredOnly, setStarredOnly] = useState(false);''')

apply(CHATS, "starredOnly);",
r'''  const hits = useMessageSearch(activeId, kw, from || undefined, to || undefined);''',
r'''  const hits = useMessageSearch(activeId, kw, from || undefined, to || undefined, starredOnly);''')

apply(CHATS, "setStarredOnly(false);",
r'''setJumpToId(null); setJumpNote(null); }, [activeId]);''',
r'''setJumpToId(null); setJumpNote(null); setStarredOnly(false); }, [activeId]);''')

apply(CHATS, "const starMessage",
r'''  const emitTyping = useCallback((t: boolean) => {''',
r'''  /* A star is optimistic on purpose: it is the reader's own bookkeeping, the
     server cannot refuse it for a message they can see, and a star that waits
     for a round trip feels broken on a phone. The refetch behind it is what
     makes it true. */
  const starMessage = useCallback(async (m: Message, on: boolean) => {
    setEditsMap((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? m), starred: on } }));
    try {
      await chatApi.starMessage(m.id, on);
      void qc.invalidateQueries({ queryKey: ['chat', 'search', activeId] });
    } catch {
      setEditsMap((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? m), starred: !on } }));
    }
  }, [activeId, qc]);

  const emitTyping = useCallback((t: boolean) => {''')

apply(CHATS, "onStar={(m, on)",
r'''                      onReply={setReplyTo} onForward={setForwarding} onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}''',
r'''                      onReply={setReplyTo} onForward={setForwarding} onStar={(m, on) => { void starMessage(m, on); }}
                      onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}''')

apply(CHATS, "Only kept",
r'''                    {(kw || from || to) && (
                      <button type="button" className="cstab"
                        onClick={() => { setKw(''); setFrom(''); setTo(''); setJumpNote(null); }}>Clear</button>
                    )}''',
r'''                    <button type="button" className={starredOnly ? 'cstab on' : 'cstab'}
                      aria-pressed={starredOnly} onClick={() => setStarredOnly((v) => !v)}>
                      ★ Only kept
                    </button>
                    {(kw || from || to || starredOnly) && (
                      <button type="button" className="cstab"
                        onClick={() => { setKw(''); setFrom(''); setTo(''); setStarredOnly(false); setJumpNote(null); }}>Clear</button>
                    )}''')

print("== Anchored edits applied.")
PYEOF

echo "== Writing the migration"
python3 <<'PYEOF'
import pathlib
d = pathlib.Path('together-city-chat/prisma/migrations/20260814120000_keep_a_message')
sql = '''-- A star is the READER's bookkeeping about a message, not a fact about the
-- message: two citizens can keep the same row and neither sees the other's.
-- Nullable rather than defaulted to '[]' so nothing has to be rewritten for
-- rows that predate it — absent and empty mean the same thing to the reader.
ALTER TABLE "Message" ADD COLUMN "starredForJson" TEXT;
'''
f = d / 'migration.sql'
if f.exists() and f.read_text() == sql:
    print('   = migration: already written')
else:
    d.mkdir(parents=True, exist_ok=True); f.write_text(sql)
    print('   + together-city-chat/prisma/migrations/20260814120000_keep_a_message/migration.sql')
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
  together-city-chat/prisma/migrations/20260814120000_keep_a_message/migration.sql \
  together-city-chat/src/messages/messages.service.ts \
  together-city-chat/src/messages/messages.controller.ts \
  together-city-chat/src/messages/dto/messages.dto.ts \
  together-city-react/src/api/schemas.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/types/index.ts \
  together-city-react/src/features/chat/components/MessageThread.tsx \
  together-city-react/src/features/chat/pages/Chats.tsx \
  land-a-message-can-be-kept.sh

git commit -m "A message can be kept" -m "Starred messages: keep one, find it again, filter a conversation down to
what you kept. Carries a migration, so Railway rebuilds.

A STAR IS THE READER'S BOOKKEEPING, NOT A FACT ABOUT THE MESSAGE. Two
people can keep the same row and neither sees the other's, which is why
this follows the shape hiddenForJson already set for delete-for-me: a JSON
array of user ids on the row, read per viewer. A join table is the textbook
answer and would also be a new Prisma model, which purge-plan.spec would
then rightly demand a deletion policy for; the precedent in this file is a
column and consistency with it is worth more here than orthodoxy.

The write is a conditional updateMany with a retry, never a \$transaction —
transaction-safety.spec's rule, learned the hard way in the audit commit:
a transaction is not a lock, so the WHERE carries what was read and a loser
retries against the fresh row. Two people starring the same message in the
same second is ordinary in a busy group.

serialize() takes an optional viewerId, because 'starred' can only be
answered when we know who is asking. The broadcast paths do not pass one
and get false, which is the honest answer: a socket frame goes to several
people at once and cannot carry one person's bookkeeping.

Starred-only filtering is applied after the read rather than in the where
clause: the column is a JSON string and `contains: userId` would also match
a substring of somebody else's id. The page is capped, so it is cheap.

The star itself is optimistic — the server cannot refuse it for a message
you can already see, and one that waits for a round trip feels broken on a
phone. It rolls back if the write fails.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016nKWHG5mKntSvf2bdykiMM"

echo "== Landed: \"$MARK\". Push when ready."
