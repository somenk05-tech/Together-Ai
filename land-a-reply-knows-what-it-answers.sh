#!/bin/bash
# land-a-reply-knows-what-it-answers.sh — "A reply knows what it answers."
#
# Batch 1 of WhatsApp parity: the two features that were already paid for
# server-side and could not be reached from a chat.
#
#   REPLY. `replyToMessageId` has been in the schema, the DTO, `messageInclude`
#   and the send path since replies were designed. Two things stopped it being a
#   feature: the serializer never emitted the quoted message, and the frontend's
#   MessageSchema never declared the field — so zod stripped it off every message
#   on arrival. Both fixed, plus the surface: reply from the message actions, a
#   quoted block above the bubble, and tapping the quote jumps to the original.
#
#   SEARCH INSIDE A CONVERSATION, WITH DATES. The endpoint takes keyword, sender,
#   type and a date range and has done for months; the only caller is the command
#   palette, which asks for keyword-only, globally, five results. So the filters
#   that make search useful in a long thread were unreachable. A search bar in the
#   thread header now scopes to this conversation and takes a from/to range —
#   and a result you tap loads its way back through history until it can show you
#   the message rather than saying it cannot.
#
# Also carries a one-word fix to the audit commit: disconnectSockets() → local.
#
# APPLY-shape (anchored python edits, idempotent) so it queues safely behind the
# mail work in flight. No new API routes, no migration.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -100)"
NEEDS="The room stops repeating itself"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — run land-chat-audit-fixes.sh first."; exit 1 ;;
esac
MARK="A reply knows what it answers"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/src/messages/messages.service.ts
together-city-chat/src/shared/redis/redis-io.adapter.ts
together-city-react/src/api/schemas.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/api/index.ts
together-city-react/src/types/index.ts
together-city-react/src/features/chat/pages/Chats.tsx
together-city-react/src/features/chat/components/MessageThread.tsx
together-city-react/src/features/chat/components/Composer.tsx
EOF
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch|apply-.*\.py)$' || true)"
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
        sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x (need 1). The file moved under this script.\n--- anchor:\n{anchor[:200]}")
    p.write_text(s.replace(anchor, replacement)); print(f"   + {path}")

TYPES = 'together-city-react/src/types/index.ts'
MS    = 'together-city-chat/src/messages/messages.service.ts'
RA    = 'together-city-chat/src/shared/redis/redis-io.adapter.ts'
SCH   = 'together-city-react/src/api/schemas.ts'
API   = 'together-city-react/src/api/chat.api.ts'
CHATS = 'together-city-react/src/features/chat/pages/Chats.tsx'
THREAD= 'together-city-react/src/features/chat/components/MessageThread.tsx'
COMP  = 'together-city-react/src/features/chat/components/Composer.tsx'

# ── 1 · the server sends the quoted message ─────────────────────────────────
apply(MS, "replyTo?: { id: string;",
r'''    sender?: unknown;
    statuses?: Array<{ status: string }>;
  }) {''',
r'''    sender?: unknown;
    statuses?: Array<{ status: string }>;
    replyTo?: { id: string; text: string | null; messageType: string; senderId: string; deleted: boolean } | null;
  }) {''')

apply(MS, "THE QUOTED MESSAGE TRAVELS WITH THE REPLY",
r'''      replyToMessageId: m.replyToMessageId ?? null,''',
r'''      replyToMessageId: m.replyToMessageId ?? null,
      /* THE QUOTED MESSAGE TRAVELS WITH THE REPLY. `messageInclude` has
         fetched replyTo since replies were designed and the serializer dropped
         it on the floor — so a client held the id of the message being
         answered and could not show a word of it without a second fetch per
         bubble. Tombstoned like any other body: answering a message somebody
         later deleted quotes the deletion, never the text. */
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            senderId: m.replyTo.senderId,
            messageType: m.replyTo.messageType,
            deleted: m.replyTo.deleted,
            body: m.replyTo.deleted ? '' : (m.replyTo.text ?? ''),
          }
        : null,''')

# ── 2 · the late-attach kick stays on this instance ─────────────────────────
apply(RA, "this.server.local.disconnectSockets()",
r'''    try {
      this.server.disconnectSockets();
    } catch { /* no namespace initialised yet — nobody to kick */ }''',
r'''    try {
      /* `.local`, and the word is load-bearing. Bare disconnectSockets() is a
         CLUSTER-WIDE instruction once the adapter is attached: instance A
         finishing a late connect would kick every socket on instances B and C,
         which had attached cleanly at boot and were fine. Only this process's
         sockets lost their rooms, so only this process's sockets are kicked. */
      this.server.local.disconnectSockets();
    } catch { /* no namespace initialised yet — nobody to kick */ }''')

# ── 3 · the client stops throwing the field away ────────────────────────────
apply(SCH, "QUOTED REPLIES ARRIVED AND WERE THROWN AWAY HERE",
r'''  editedAt: z.string().nullable().optional(),
  media: z.array(MediaAttachmentSchema).optional(),
});''',
r'''  editedAt: z.string().nullable().optional(),
  media: z.array(MediaAttachmentSchema).optional(),
  /* QUOTED REPLIES ARRIVED AND WERE THROWN AWAY HERE. zod strips what a schema
     does not declare, so every reply the server sent lost the one thing that
     made it a reply somewhere between the wire and the component. */
  replyToMessageId: z.string().nullable().optional(),
  replyTo: z.object({
    id: z.string(),
    senderId: z.string(),
    body: z.string(),
    messageType: z.string().optional(),
    deleted: z.boolean().optional(),
  }).nullable().optional(),
});''')

# ── 3b · the hand-written domain type carries it too ───────────────────────
# `@/types` is not generated from the zod schemas — it is written by hand and
# the two are kept in step by eye (see MediaAttachment's own note saying so).
# The components read this one, so a field missing here is a field the thread
# cannot render however correctly the wire is parsed.
apply(TYPES, "replyTo?: {",
r'''  deleted?: boolean; // soft-deleted for everyone → render tombstone
  media?: MediaAttachment[];
}''',
r'''  deleted?: boolean; // soft-deleted for everyone → render tombstone
  media?: MediaAttachment[];
  /** What this message answers. Keep in step with api/schemas.ts's
   *  MessageSchema, which is what parses the wire — the server has always
   *  sent the id, and now sends enough of the original to quote it. */
  replyToMessageId?: string | null;
  replyTo?: {
    id: string;
    senderId: string;
    body: string;
    messageType?: string;
    deleted?: boolean;
  } | null;
}''')

# ── 4 · search that can be pointed at one conversation, and at dates ────────
apply(API, "searchMessages:",
r'''  editMessage: (messageId: string, body: string): Promise<Message> =>
    apiPut(`/messages/${messageId}`, { text: body }, MessageSchema),
};''',
r'''  editMessage: (messageId: string, body: string): Promise<Message> =>
    apiPut(`/messages/${messageId}`, { text: body }, MessageSchema),
  /**
   * Search, scoped and filtered.
   *
   * The endpoint has taken conversationId, senderId, attachmentType and a
   * from/to date range since it was written. Its only caller until now was the
   * command palette, which asks for a keyword across everything and takes five
   * results — so inside a long thread, where scoping and dates are the whole
   * point, none of it was reachable.
   */
  searchMessages: (params: {
    conversationId?: string; keyword?: string; from?: string; to?: string; limit?: number;
  }): Promise<Message[]> =>
    apiGet('/messages/search', z.array(MessageSchema), { params }),
};''')

apply(API, "replyToMessageId?: string",
r'''  const send = useCallback((body: string, attachments?: OutgoingAttachment[]) => {
    if (!conversationId) return;
    const list = attachments?.length ? attachments : undefined;
    socketClient.emit(WS.SEND_MESSAGE, {
      conversationId,
      body,
      clientId: crypto.randomUUID(),
      ...(list ? { attachments: list, messageType: messageTypeFor(list) } : null),
    });
  }, [conversationId]);''',
r'''  const send = useCallback((body: string, attachments?: OutgoingAttachment[], replyToMessageId?: string) => {
    if (!conversationId) return;
    const list = attachments?.length ? attachments : undefined;
    socketClient.emit(WS.SEND_MESSAGE, {
      conversationId,
      body,
      clientId: crypto.randomUUID(),
      ...(list ? { attachments: list, messageType: messageTypeFor(list) } : null),
      // SocketSendSchema has accepted this since it was written.
      ...(replyToMessageId ? { replyToMessageId } : null),
    });
  }, [conversationId]);''')

apply(API, "export function useMessageSearch",
r'''export function useChatContacts() {''',
r'''/** In-conversation search. Idle until there is something to look for — a
 *  keyword, or a date range on its own ("what did we say that Tuesday"). */
export function useMessageSearch(
  conversationId: string | undefined,
  keyword: string,
  from?: string,
  to?: string,
) {
  const kw = keyword.trim();
  const active = Boolean(conversationId) && (kw.length >= 2 || Boolean(from) || Boolean(to));
  return useQuery({
    queryKey: ['chat', 'search', conversationId, kw, from ?? '', to ?? ''],
    queryFn: () => chatApi.searchMessages({
      conversationId,
      ...(kw ? { keyword: kw } : {}),
      ...(from ? { from: new Date(from + 'T00:00:00').toISOString() } : {}),
      ...(to ? { to: new Date(to + 'T23:59:59').toISOString() } : {}),
      limit: 50,
    }),
    enabled: active,
    staleTime: 10_000,
  });
}

export function useChatContacts() {''')

# ── 5 · the composer says what it is answering ──────────────────────────────
apply(COMP, "replyTo?: { name: string; body: string }",
r'''export function Composer({ onSend, onTyping }: {
  onSend: (body: string, attachments?: OutgoingAttachment[]) => void;
  onTyping: (t: boolean) => void;
}) {''',
r'''export function Composer({ onSend, onTyping, replyTo, onCancelReply }: {
  onSend: (body: string, attachments?: OutgoingAttachment[]) => void;
  onTyping: (t: boolean) => void;
  /** The message being answered, if any — shown above the capsule so nobody
   *  sends a reply into the wrong thread of a conversation. */
  replyTo?: { name: string; body: string } | null;
  onCancelReply?: () => void;
}) {''')

apply(COMP, "Replying to {replyTo.name}",
r'''      <form className="cscomposer" onSubmit={submit} style={{ margin: 0 }}>''',
r'''      {/* No class name: this bar is styled inline because a `cs`-prefixed name
          with no rule in index.css is a promise to a stylesheet that never
          answers — the failure no-borrowed-class-names.test.ts exists to catch,
          pointed the other way. */}
      {replyTo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px',
          padding: '8px 12px', borderRadius: 12,
          background: 'var(--stage-tile)', borderLeft: '3px solid var(--on-stage-faint)',
        }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--on-stage-soft)' }}>
              Replying to {replyTo.name}
            </span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--on-stage-faint)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.body || 'Attachment'}
            </span>
          </span>
          <button type="button" className="cstool" aria-label="Cancel reply"
            onClick={() => onCancelReply?.()} style={{ flex: 'none' }}>✕</button>
        </div>
      )}
      <form className="cscomposer" onSubmit={submit} style={{ margin: 0 }}>''')

# ── 6 · the thread: reply action, the quoted block, and the jump ────────────
apply(THREAD, "onReply?: (m: Message) => void",
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit }: {
  messages: Message[]; currentUserId?: string; typing?: boolean;
  /** Whose thread this is, for the attribution line above each run. */
  peerName?: string;
  onDelete?: (messageId: string, scope: 'ME' | 'EVERYONE') => Promise<void> | void;
  onEdit?: (messageId: string, body: string) => Promise<void> | void;
}) {''',
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, jumpToId }: {
  messages: Message[]; currentUserId?: string; typing?: boolean;
  /** Whose thread this is, for the attribution line above each run. */
  peerName?: string;
  onDelete?: (messageId: string, scope: 'ME' | 'EVERYONE') => Promise<void> | void;
  onEdit?: (messageId: string, body: string) => Promise<void> | void;
  onReply?: (m: Message) => void;
  /** A message to bring into view — from a search result, or from tapping a
   *  quotation. Scrolls THIS box only, never an ancestor: see the note on the
   *  auto-scroll below, which is the same lesson learned the same way. */
  jumpToId?: string | null;
}) {''')

apply(THREAD, "const [flashId, setFlashId]",
r'''  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');''',
r'''  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);''')

apply(THREAD, "jumpToId is the whole reason",
r'''  const doDelete = async (m: Message, scope: 'ME' | 'EVERYONE') => {''',
r'''  /* Bring one message into view and mark it, briefly. `el.scrollIntoView`
     would ask every scrollable ancestor to move — which on a phone is the page
     under a fixed room, the exact bug the viewport-lock commit removed. So the
     box scrolls itself, by offset, and jumpToId is the whole reason this
     component takes a prop rather than owning a ref somebody outside reaches
     into. */
  useEffect(() => {
    if (!jumpToId) return;
    const box0 = box.current;
    // `window.CSS`, not `CSS`: this module declares its own `const CSS` for the
    // style block a few lines up, which shadows the global and turns
    // CSS.escape into a property of a string. tsc caught it; nothing else would.
    const el = box0?.querySelector<HTMLElement>(`[data-mid="${window.CSS.escape(jumpToId)}"]`);
    if (!box0 || !el) return;
    box0.scrollTo({ top: Math.max(0, el.offsetTop - 48), behavior: 'smooth' });
    setFlashId(jumpToId);
    const t = window.setTimeout(() => setFlashId(null), 1600);
    return () => window.clearTimeout(t);
  }, [jumpToId, messages.length]);

  const doDelete = async (m: Message, scope: 'ME' | 'EVERYONE') => {''')

apply(THREAD, "data-mid={m.id}",
r'''            <div
              className={`tc-msg-row tc-msg-collapse${isCollapsing ? ' tc-msg-collapsing' : ''}${touchOpen === m.id ? ' touch-open' : ''}`}
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: m.share ? 320 : '100%' }}''',
r'''            <div
              data-mid={m.id}
              className={`tc-msg-row tc-msg-collapse${isCollapsing ? ' tc-msg-collapsing' : ''}${touchOpen === m.id ? ' touch-open' : ''}`}
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: m.share ? 320 : '100%',
                ...(flashId === m.id ? { outline: '2px solid var(--on-stage-faint)', outlineOffset: 4, borderRadius: 14 } : null) }}''')

apply(THREAD, "↩ Reply",
r'''                  {m.body && <button type="button" title="Copy" onClick={() => { void navigator.clipboard?.writeText(m.body); setTouchOpen(null); }}>⧉ Copy</button>}''',
r'''                  {onReply && <button type="button" title="Reply" onClick={() => { onReply(m); setTouchOpen(null); }}>↩ Reply</button>}
                  {m.body && <button type="button" title="Copy" onClick={() => { void navigator.clipboard?.writeText(m.body); setTouchOpen(null); }}>⧉ Copy</button>}''')

apply(THREAD, "WHAT THIS ANSWERS, ABOVE WHAT IT SAYS",
r'''                  <>
                    {m.body && <div className={mine ? 'csb me' : 'csb'}>{m.body}</div>}''',
r'''                  <>
                    {/* WHAT THIS ANSWERS, ABOVE WHAT IT SAYS. Tapping it goes
                        to the original — which is the entire point of a quote
                        and the thing a static blockquote fails to be. */}
                    {m.replyTo && (
                      <button type="button" onClick={() => onJump?.(m.replyTo!.id)}
                        aria-label="Go to the message this answers"
                        style={{
                          display: 'block', textAlign: 'left', width: '100%', maxWidth: 320,
                          border: 'none', cursor: 'pointer', font: 'inherit',
                          background: 'var(--stage-tile)', borderLeft: '3px solid var(--on-stage-faint)',
                          borderRadius: 10, padding: '6px 10px', marginBottom: 4,
                        }}>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--on-stage-soft)' }}>
                          {m.replyTo.senderId === currentUserId ? 'You' : (peerName ?? 'Them')}
                        </span>
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--on-stage-faint)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.replyTo.deleted ? 'This message was deleted' : (m.replyTo.body || 'Attachment')}
                        </span>
                      </button>
                    )}
                    {m.body && <div className={mine ? 'csb me' : 'csb'}>{m.body}</div>}''')

# onJump travels with jumpToId — same prop block, added separately so the two
# reads of this file stay independently anchored.
apply(THREAD, "onJump?: (messageId: string) => void",
r'''  onReply?: (m: Message) => void;''',
r'''  onReply?: (m: Message) => void;
  /** Tapping a quotation asks the page to jump — the page owns history, and
   *  the message may be older than what is loaded. */
  onJump?: (messageId: string) => void;''')

apply(THREAD, "onEdit, onReply, onJump, jumpToId }",
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, jumpToId }: {''',
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onJump, jumpToId }: {''')

# ── 7 · the page: reply state, the search panel, and loading back to a hit ──
apply(CHATS, "const [replyTo, setReplyTo]",
r'''  /** Message ids this session has already asked to mark read — each id is
   *  acknowledged once per opened thread, never per render. */
  const ackedRead = useRef<Set<string>>(new Set());''',
r'''  /** Message ids this session has already asked to mark read — each id is
   *  acknowledged once per opened thread, never per render. */
  const ackedRead = useRef<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [kw, setKw] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [jumpToId, setJumpToId] = useState<string | null>(null);
  const [jumpNote, setJumpNote] = useState<string | null>(null);
  const hits = useMessageSearch(activeId, kw, from || undefined, to || undefined);''')

apply(CHATS, "setReplyTo(null); setSearchOpen(false);",
r'''  useEffect(() => { setLive([]); setPeerTyping(false); setStatusMap({}); setHiddenIds(new Set()); setTombstoned(new Set()); setEditsMap({}); ackedRead.current = new Set(); }, [activeId]);''',
r'''  useEffect(() => { setLive([]); setPeerTyping(false); setStatusMap({}); setHiddenIds(new Set()); setTombstoned(new Set()); setEditsMap({}); ackedRead.current = new Set(); setReplyTo(null); setSearchOpen(false); setKw(''); setFrom(''); setTo(''); setJumpToId(null); setJumpNote(null); }, [activeId]);''')

apply(CHATS, "const sendWithReply",
r'''  const { send, setTyping } = useChatRealtime(activeId, onMessage, onTyping, onDeleted, onEdited);''',
r'''  const { send, setTyping } = useChatRealtime(activeId, onMessage, onTyping, onDeleted, onEdited);

  /* A reply is a send that remembers. The state is cleared BEFORE the emit so
     a slow socket cannot leave the bar sitting over the composer looking like
     the next message will quote it too. */
  const sendWithReply = useCallback((body: string, attachments?: OutgoingAttachment[]) => {
    const answering = replyTo?.id;
    setReplyTo(null);
    send(body, attachments, answering);
  }, [send, replyTo]);

  /* JUMPING TO A MESSAGE THAT IS NOT LOADED YET. A search hit can be a hundred
     messages back, and telling somebody "it is further up" while refusing to
     go there is the kind of answer that makes a feature not worth opening. So
     this walks history backwards a page at a time until the id is on screen —
     bounded, because a thread with thousands of messages should give up rather
     than fetch all night. */
  const jumpTo = useCallback(async (messageId: string) => {
    setJumpNote(null);
    for (let i = 0; i < 12; i++) {
      if (document.querySelector(`[data-mid="${CSS.escape(messageId)}"]`)) {
        setSearchOpen(false);
        setJumpToId(null);
        window.setTimeout(() => setJumpToId(messageId), 0);
        return;
      }
      if (!history.hasNextPage) break;
      await history.fetchNextPage();
      await new Promise((r) => window.setTimeout(r, 80));
    }
    setJumpNote('That message is further back than this conversation will load.');
  }, [history]);''')

apply(CHATS, "aria-label=\"Search this conversation\"",
r'''                <CallButtons conversationId={activeId} compact />
              </div>''',
r'''                <button type="button" className="cstool" aria-label="Search this conversation"
                  aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}
                  style={{ flex: 'none' }}>🔍</button>
                <CallButtons conversationId={activeId} compact />
              </div>
              {searchOpen && (
                <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--stage-line)', display: 'grid', gap: 8 }}>
                  <input value={kw} onChange={(e) => setKw(e.target.value)} autoFocus
                    aria-label="Search in this conversation" placeholder="Search in this conversation…"
                    className="csb" style={{ width: '100%', fontSize: 16, boxShadow: 'var(--soft-in)' }} />
                  {/* A date range on its own is a real search: "what did we say
                      that week" is a question people ask without a keyword. */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 11.5, color: 'var(--on-stage-faint)' }}>From
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                        className="csb" style={{ marginLeft: 6, fontSize: 16 }} />
                    </label>
                    <label style={{ fontSize: 11.5, color: 'var(--on-stage-faint)' }}>To
                      <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                        className="csb" style={{ marginLeft: 6, fontSize: 16 }} />
                    </label>
                    {(kw || from || to) && (
                      <button type="button" className="cstab"
                        onClick={() => { setKw(''); setFrom(''); setTo(''); setJumpNote(null); }}>Clear</button>
                    )}
                  </div>
                  {jumpNote && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--on-stage-soft)' }}>{jumpNote}</p>}
                  {hits.isFetching && <p style={{ margin: 0, fontSize: 12, color: 'var(--on-stage-faint)' }}>Searching…</p>}
                  {hits.data && (
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
                      {hits.data.length === 0
                        ? <p style={{ margin: 0, fontSize: 12.5, color: 'var(--on-stage-faint)' }}>Nothing in this conversation matches.</p>
                        : hits.data.map((h) => (
                            <button key={h.id} type="button" onClick={() => { void jumpTo(h.id); }}
                              style={{ textAlign: 'left', border: 'none', background: 'var(--stage-tile)', cursor: 'pointer',
                                borderRadius: 10, padding: '7px 10px', font: 'inherit', color: 'var(--on-stage)' }}>
                              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--on-stage-faint)' }}>
                                {new Date(h.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                {h.senderId === user?.id ? ' · You' : ''}
                              </span>
                              <span style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {h.body || '📎 Attachment'}
                              </span>
                            </button>
                          ))}
                    </div>
                  )}
                </div>
              )}''')

apply(CHATS, "onReply={setReplyTo}",
r'''                    <MessageThread messages={messages} currentUserId={user?.id} typing={peerTyping}
                      peerName={activeTitle} onDelete={deleteMessage} onEdit={editMessage} />''',
r'''                    <MessageThread messages={messages} currentUserId={user?.id} typing={peerTyping}
                      peerName={activeTitle} onDelete={deleteMessage} onEdit={editMessage}
                      onReply={setReplyTo} onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId} />''')

apply(CHATS, "onSend={sendWithReply}",
r'''              <Composer onSend={send} onTyping={emitTyping} />''',
r'''              <Composer onSend={sendWithReply} onTyping={emitTyping}
                replyTo={replyTo ? {
                  name: replyTo.senderId === user?.id ? 'yourself' : activeTitle,
                  body: replyTo.body || 'Attachment',
                } : null}
                onCancelReply={() => setReplyTo(null)} />''')

apply(CHATS, "useMessageSearch, chatApi",
r'''import { useConversations, useMessages, useChatRealtime, useClearConversation, chatApi, socketClient, WS } from '@/api';''',
r'''import { useConversations, useMessages, useChatRealtime, useClearConversation, useMessageSearch, chatApi, socketClient, WS, type OutgoingAttachment } from '@/api';''')

print("== All edits applied.")
PYEOF

echo "== Exporting the new hook"
python3 - <<'PYEOF'
import pathlib
p = pathlib.Path('together-city-react/src/api/index.ts'); s = p.read_text()
if 'useMessageSearch' in s:
    print('   = index.ts: already applied')
else:
    old = 'useClearConversation, type Contact, type OutgoingAttachment }'
    assert s.count(old) == 1, 'index.ts export line moved'
    p.write_text(s.replace(old, 'useClearConversation, useMessageSearch, type Contact, type OutgoingAttachment }'))
    print('   + together-city-react/src/api/index.ts')
PYEOF

echo "== Gates: backend (tsc + jest)"
echo "   (three suites are red on origin/main before this script and stay excluded —"
echo "    dev/dev, security/route-reach, privacy/purge-plan: METAL_RATES_AS_OF,"
echo "    /financial/log, MailProject+SpendLogEntry. Not this script's, still open.)"
( cd together-city-chat && npx tsc --noEmit && npx jest --silent --testPathIgnorePatterns='(dev/dev|security/route-reach|privacy/purge-plan)\.spec\.ts$' )

echo "== Gates: frontend (tsc + vitest + build)"
( cd together-city-react && npx tsc --noEmit && npx vitest run --silent && npm run -s build )

echo "== Committing"
git add \
  together-city-chat/src/messages/messages.service.ts \
  together-city-chat/src/shared/redis/redis-io.adapter.ts \
  together-city-react/src/api/schemas.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/api/index.ts \
  together-city-react/src/types/index.ts \
  together-city-react/src/features/chat/pages/Chats.tsx \
  together-city-react/src/features/chat/components/MessageThread.tsx \
  together-city-react/src/features/chat/components/Composer.tsx \
  land-a-reply-knows-what-it-answers.sh

git commit -m "A reply knows what it answers" -m "Batch 1 of WhatsApp parity: the two features already paid for server-side
and unreachable from a chat.

REPLY was built and thrown away at the door. replyToMessageId has been in
the schema, the DTO, messageInclude and the send path since replies were
designed; the serializer never emitted the quoted message, and the web
client's MessageSchema never declared the field, so zod stripped it off
every message on arrival. The server now sends the quotation (tombstoned
if the original was deleted), the client keeps it, and the surface exists:
reply from the message actions, a quoted block above the bubble, and
tapping the quote goes to the original.

SEARCH INSIDE A CONVERSATION, WITH DATES. The endpoint has taken
conversationId, sender, type and a from/to range for months; its only
caller was the command palette, asking keyword-only, globally, five
results. A search bar in the thread header scopes to this conversation and
takes a date range — and a hit that is not loaded yet walks history
backwards until it can show you the message rather than refusing.

Also: disconnectSockets() -> local.disconnectSockets() in the Redis
adapter. Bare, it is a cluster-wide instruction, so instance A finishing a
late connect would kick sockets on instances B and C that were fine. Only
this process lost its rooms; only this process is kicked. From the audit
commit, found reading it back.

No migration, no new routes.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016nKWHG5mKntSvf2bdykiMM"

echo "== Landed: \"$MARK\". Push when ready."
