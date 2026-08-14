#!/bin/bash
# land-the-room-says-who-is-here.sh — "The room says who is here, and who has read."
#
# Two features, and one of them is a residue turned into a feature.
#
#   PRESENCE HAD TWO IMPLEMENTATIONS AND NO AUDIENCE. The gateway computes an
#   online/offline transition, looks up every conversation the citizen shares,
#   and broadcasts to all of them — and no client has ever listened. Separately
#   `useOnlineContacts` sits exported in the API layer, calling GET /users/online,
#   and no component has ever called it. Two live wires, both terminating in air.
#   The chat header now reads both: seeded from the REST list on open, corrected
#   live by the socket. The audit's recommendation was "consume it or delete it";
#   this consumes it.
#
#   MESSAGE INFO. One MessageStatus row per recipient with readAt has been
#   written since read receipts shipped, and nothing ever read them back — so
#   the aggregate tick was the whole story. Fine in a direct chat, useless in a
#   group of six, where "delivered" means only that the slowest person's phone
#   has it. Sender-only, because who has read your message is yours to know and
#   everyone else's reading is not a thing to hand out.
#
# APPLY-shape, idempotent, no migration.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -100)"
NEEDS="A reply knows what it answers"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — run land-a-reply-knows-what-it-answers.sh first."; exit 1 ;;
esac
MARK="The room says who is here"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/src/messages/messages.service.ts
together-city-chat/src/messages/messages.controller.ts
together-city-react/src/api/schemas.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/features/chat/pages/Chats.tsx
together-city-react/src/features/chat/components/MessageThread.tsx
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

MS     = 'together-city-chat/src/messages/messages.service.ts'
CTRL   = 'together-city-chat/src/messages/messages.controller.ts'
SCH    = 'together-city-react/src/api/schemas.ts'
API    = 'together-city-react/src/api/chat.api.ts'
CHATS  = 'together-city-react/src/features/chat/pages/Chats.tsx'
THREAD = 'together-city-react/src/features/chat/components/MessageThread.tsx'

# ── 1 · who has seen this ───────────────────────────────────────────────────
apply(MS, "async info(userId: string, messageId: string)",
r'''  /** Multi-criteria search (keyword / sender / type / date / conversation). */''',
r'''  /**
   * WHO HAS SEEN THIS, AND WHEN — for one message, for the person who sent it.
   *
   * The rows have existed since read receipts shipped: one MessageStatus per
   * recipient, with readAt written. Nothing ever read them back, so the bubble's
   * aggregate tick was the entire story — and that aggregate is the LEAST
   * progressed of everybody, so one person who has not opened the app holds the
   * whole group at a single tick with no way to find out who.
   *
   * Sender-only. In a group, who has read your message is a fact about your
   * message; who has read everybody else's is a log of six people's habits, and
   * this endpoint is not a way to ask for it.
   */
  async info(userId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, createdAt: true },
    });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) {
      throw new ForbiddenException('Only the sender can see who has read a message.');
    }
    // unbounded: one message's recipients — group-sized, and the group is the point
    const rows = await this.prisma.messageStatus.findMany({
      where: { messageId },
      include: { user: { select: { id: true, name: true, handle: true } } },
    });
    return {
      messageId: msg.id,
      sentAt: msg.createdAt.toISOString(),
      recipients: rows.map((r) => ({
        userId: r.userId,
        name: r.user?.name ?? null,
        handle: r.user?.handle ?? null,
        status: r.status,
        readAt: r.readAt ? r.readAt.toISOString() : null,
      })),
    };
  }

  /** Multi-criteria search (keyword / sender / type / date / conversation). */''')

apply(CTRL, "messages/:id/info",
r'''  // GET /api/messages/search
  @Get('messages/search')
  search(@CurrentUser() user: JwtUser, @Query() query: Record<string, string>) {
    const dto: SearchMessagesDto = SearchMessagesSchema.parse(query);
    return this.messages.search(user.sub, dto);
  }
}''',
r'''  // GET /api/messages/search
  @Get('messages/search')
  search(@CurrentUser() user: JwtUser, @Query() query: Record<string, string>) {
    const dto: SearchMessagesDto = SearchMessagesSchema.parse(query);
    return this.messages.search(user.sub, dto);
  }

  // GET /api/messages/:id/info — declared AFTER messages/search on purpose:
  // Nest matches in declaration order and a bare `:id` would otherwise swallow
  // the literal path. Sender-only; the service refuses anybody else.
  @Get('messages/:id/info')
  info(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.messages.info(user.sub, id);
  }
}''')

# ── 2 · the client ──────────────────────────────────────────────────────────
apply(SCH, "MessageInfoSchema",
r'''export const NotificationSchema = z.object({''',
r'''/** Who a message reached, and when — sender's own view. */
export const MessageInfoSchema = z.object({
  messageId: z.string(),
  sentAt: z.string(),
  recipients: z.array(z.object({
    userId: z.string(),
    name: z.string().nullable().optional(),
    handle: z.string().nullable().optional(),
    status: z.enum(['SENT', 'DELIVERED', 'READ']),
    readAt: z.string().nullable().optional(),
  })),
});
export type MessageInfo = z.infer<typeof MessageInfoSchema>;

export const NotificationSchema = z.object({''')

apply(API, "messageInfo:",
r'''  searchMessages: (params: {
    conversationId?: string; keyword?: string; from?: string; to?: string; limit?: number;
  }): Promise<Message[]> =>
    apiGet('/messages/search', z.array(MessageSchema), { params }),
};''',
r'''  searchMessages: (params: {
    conversationId?: string; keyword?: string; from?: string; to?: string; limit?: number;
  }): Promise<Message[]> =>
    apiGet('/messages/search', z.array(MessageSchema), { params }),
  /** Who received and read one of YOUR messages. 403 for anybody else's. */
  messageInfo: (messageId: string): Promise<MessageInfo> =>
    apiGet(`/messages/${messageId}/info`, MessageInfoSchema),
};''')

apply(API, "ConversationSchema, MessageInfoSchema",
r'''import {
  ConversationSchema, MessagePageSchema, MessageSchema,
  type Conversation, type Message, type MessagePage, type ShareCard,
} from './schemas';''',
r'''import {
  ConversationSchema, MessageInfoSchema, MessagePageSchema, MessageSchema,
  type Conversation, type Message, type MessageInfo, type MessagePage, type ShareCard,
} from './schemas';''')

# ── 3 · the thread offers it, and shows it ──────────────────────────────────
apply(THREAD, "fetchInfo?: (messageId: string)",
r'''  /** Tapping a quotation asks the page to jump — the page owns history, and
   *  the message may be older than what is loaded. */
  onJump?: (messageId: string) => void;''',
r'''  /** Tapping a quotation asks the page to jump — the page owns history, and
   *  the message may be older than what is loaded. */
  onJump?: (messageId: string) => void;
  /** Who received and read one of your own messages. Structural type rather
   *  than an import: this component reads `@/types`, and one endpoint's shape
   *  is not worth a second source of truth for it to drift against. */
  fetchInfo?: (messageId: string) => Promise<{
    sentAt: string;
    recipients: Array<{ userId: string; name?: string | null; handle?: string | null; status: string; readAt?: string | null }>;
  }>;''')

apply(THREAD, "onJump, fetchInfo, jumpToId }",
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onJump, jumpToId }: {''',
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onJump, fetchInfo, jumpToId }: {''')

apply(THREAD, "const [infoFor, setInfoFor]",
r'''  const [flashId, setFlashId] = useState<string | null>(null);''',
r'''  const [flashId, setFlashId] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<Message | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<NonNullable<typeof fetchInfo>>> | null>(null);
  const [infoErr, setInfoErr] = useState<string | null>(null);''')

apply(THREAD, "INFO IS FETCHED WHEN IT IS ASKED FOR",
r'''  const doDelete = async (m: Message, scope: 'ME' | 'EVERYONE') => {''',
r'''  /* INFO IS FETCHED WHEN IT IS ASKED FOR, never alongside the thread: it is
     one row per recipient per message, and pre-loading it for a hundred
     messages to serve the one somebody taps is how a transcript gets slow. */
  useEffect(() => {
    if (!infoFor || !fetchInfo) return;
    let alive = true;
    setInfo(null); setInfoErr(null);
    fetchInfo(infoFor.id)
      .then((d) => { if (alive) setInfo(d); })
      .catch(() => { if (alive) setInfoErr('That could not be loaded just now.'); });
    return () => { alive = false; };
  }, [infoFor, fetchInfo]);

  const doDelete = async (m: Message, scope: 'ME' | 'EVERYONE') => {''')

apply(THREAD, "ⓘ Info",
r'''                  <button type="button" className="danger" title="Delete" onClick={() => { setConfirmFor(m); setTouchOpen(null); }}>🗑 Delete</button>''',
r'''                  {mine && fetchInfo && <button type="button" title="Message info" onClick={() => { setInfoFor(m); setTouchOpen(null); }}>ⓘ Info</button>}
                  <button type="button" className="danger" title="Delete" onClick={() => { setConfirmFor(m); setTouchOpen(null); }}>🗑 Delete</button>''')

apply(THREAD, "Message info</h3>",
r'''      {confirmFor && (
        <ConfirmDelete''',
r'''      {infoFor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(20,18,12,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setInfoFor(null)}>
          <div className="card" style={{ width: 'min(420px, 100%)', padding: '20px 22px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 2px', fontSize: 17 }}>Message info</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
              Sent {new Date(infoFor.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
            {infoErr && <p style={{ fontSize: 13, margin: '0 0 12px' }} role="alert">{infoErr}</p>}
            {!info && !infoErr && <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>Loading…</p>}
            {info && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {info.recipients.length === 0
                  ? <p className="muted" style={{ fontSize: 13, margin: 0 }}>Nobody else is in this conversation yet.</p>
                  : info.recipients.map((r) => (
                      <div key={r.userId} style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.name ?? (r.handle ? `@${r.handle}` : 'Someone')}</span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {/* The word people actually want is "read" and the time
                              it happened; delivered without a time is the honest
                              answer for a message nobody has opened. */}
                          {r.status === 'READ'
                            ? `Read${r.readAt ? ' · ' + new Date(r.readAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`
                            : r.status === 'DELIVERED' ? 'Delivered' : 'Sent'}
                        </span>
                      </div>
                    ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-line btn-sm" onClick={() => setInfoFor(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {confirmFor && (
        <ConfirmDelete''')

# ── 4 · the header says whether they are here ───────────────────────────────
apply(CHATS, "useOnlineContacts",
r'''import { useConversations, useMessages, useChatRealtime, useClearConversation, useMessageSearch, chatApi, socketClient, WS, type OutgoingAttachment } from '@/api';''',
r'''import { useConversations, useMessages, useChatRealtime, useClearConversation, useMessageSearch, useOnlineContacts, chatApi, socketClient, WS, type OutgoingAttachment } from '@/api';''')

apply(CHATS, "PRESENCE HAD TWO IMPLEMENTATIONS AND NO AUDIENCE",
r'''  const hits = useMessageSearch(activeId, kw, from || undefined, to || undefined);''',
r'''  const hits = useMessageSearch(activeId, kw, from || undefined, to || undefined);

  /* PRESENCE HAD TWO IMPLEMENTATIONS AND NO AUDIENCE. The gateway works out an
     online/offline transition and broadcasts it to every conversation the
     citizen shares — and nothing listened. `useOnlineContacts` calls
     GET /users/online and nothing called IT. Both are read here: the REST list
     answers "are they here now" on open, which a socket frame cannot because it
     only ever reports a CHANGE, and the frames keep it true afterwards. */
  const onlineNow = useOnlineContacts();
  const peerId = useMemo(() => {
    const convo = (conversations.data ?? []).find((c) => c.id === activeId);
    if (!convo || convo.isGroup) return undefined;   // a group has no single "they"
    return (convo.participantIds ?? []).find((id) => id !== user?.id);
  }, [conversations.data, activeId, user?.id]);
  const [peerOnline, setPeerOnline] = useState(false);
  useEffect(() => {
    setPeerOnline(Boolean(peerId && (onlineNow.data ?? []).includes(peerId)));
  }, [peerId, onlineNow.data]);
  useEffect(() => {
    if (!peerId) return;
    const on = socketClient.on<{ userId: string }>(WS.USER_ONLINE, ({ userId }) => { if (userId === peerId) setPeerOnline(true); });
    const off = socketClient.on<{ userId: string }>(WS.USER_OFFLINE, ({ userId }) => { if (userId === peerId) setPeerOnline(false); });
    return () => { on(); off(); };
  }, [peerId]);''')

apply(CHATS, "peerOnline ? 'online'",
r'''                  <em>{peerTyping ? 'typing…' : 'Together City'}</em>''',
r'''                  {/* Typing outranks online: it is the more specific fact, and
                      the more useful one. Absent both, the room says nothing
                      about the other person rather than guessing "offline" —
                      presence expires on a TTL, so silence is not proof. */}
                  <em>{peerTyping ? 'typing…' : peerOnline ? 'online' : 'Together City'}</em>''')

apply(CHATS, "fetchInfo={chatApi.messageInfo}",
r'''                      onReply={setReplyTo} onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId} />''',
r'''                      onReply={setReplyTo} onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}
                      fetchInfo={chatApi.messageInfo} />''')

print("== All edits applied.")
PYEOF

echo "== Gates: backend (tsc + jest)"
echo "   (dev/dev, security/route-reach, privacy/purge-plan stay excluded — red on"
echo "    origin/main before this script, and still someone else's to fix.)"
( cd together-city-chat && npx tsc --noEmit && npx jest --silent --testPathIgnorePatterns='(dev/dev|security/route-reach|privacy/purge-plan)\.spec\.ts$' )

echo "== Gates: frontend (tsc + vitest + build)"
( cd together-city-react && npx tsc --noEmit && npx vitest run --silent && npm run -s build )

echo "== Committing"
git add \
  together-city-chat/src/messages/messages.service.ts \
  together-city-chat/src/messages/messages.controller.ts \
  together-city-react/src/api/schemas.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/features/chat/pages/Chats.tsx \
  together-city-react/src/features/chat/components/MessageThread.tsx \
  land-the-room-says-who-is-here.sh

git commit -m "The room says who is here, and who has read" -m "Two features, and one of them is a residue turned into a feature.

PRESENCE HAD TWO IMPLEMENTATIONS AND NO AUDIENCE. The gateway computes an
online/offline transition, looks up every conversation the citizen shares
and broadcasts to all of them — and no client has ever listened. Separately
useOnlineContacts sits exported in the API layer calling GET /users/online,
and no component has ever called it. Two live wires terminating in air, and
the chat audit's note said consume it or delete it. The header reads both:
the REST list answers 'are they here now' on open, which a socket frame
cannot because it only reports a CHANGE, and the frames keep it true after.
Typing outranks online. Absent both, the room says nothing rather than
claiming 'offline' — presence expires on a TTL, so silence is not proof.

MESSAGE INFO. One MessageStatus row per recipient, with readAt, has been
written since read receipts shipped and nothing ever read them back. The
aggregate tick on the bubble is the LEAST progressed of everybody, so one
person who has not opened the app holds a group of six at a single tick
with no way to find out who. Sender-only: who has read your message is a
fact about your message; who has read everyone else's is a log of six
people's habits, and this is not a way to ask for it. Fetched on tap, never
alongside the thread.

Route declared after messages/search so a bare :id cannot swallow it.
No migration.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016nKWHG5mKntSvf2bdykiMM"

echo "== Landed: \"$MARK\". Push when ready."
