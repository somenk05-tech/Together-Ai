#!/bin/bash
# land-a-handful-of-messages-at-once.sh — "A handful of messages can be moved at once."
#
# Multi-select in a chat thread: pick several messages, forward them all to one
# room, or delete them together. No backend, no migration, no new route —
# everything this needs already exists one message at a time.
#
# THE SELECTION LIVES IN THE PAGE, NOT THE THREAD. The bulk bar replaces the
# conversation header, which Chats.tsx owns; a selection held inside
# MessageThread would have to be lifted out again on the first render of that
# bar. The thread is told what is picked and how to toggle it, and nothing else.
#
# AND THE BAR REPLACES THE HEADER RATHER THAN FLOATING. The composer is fixed to
# a locked visual viewport on a phone (see the viewport-lock work) and anything
# hovering above it is the one piece of chrome guaranteed to end up under a
# keyboard. While you are picking messages the room's name and its call buttons
# are not what that row is for.
#
# NO SECOND GESTURE. Long-press already opens the per-message action bar and
# hover already shows it, so selection is entered from a button inside that bar
# rather than from a gesture of its own. That keeps the 450ms timer doing one
# thing, keeps Reply / Keep / Copy / Edit / Info reachable on a phone — which
# repurposing the long-press would have taken away — and makes the mode
# discoverable on a desk, where nobody long-presses anything.
#
# DELETE FOR EVERYONE IS ALL OR NOTHING: offered only when every picked message
# is yours and still inside the 15-minute window. `withinWindow` is imported
# from MessageThread rather than restated, because two copies of that number
# would go on looking correct for exactly as long as they happened to agree.
#
# APPLY-shape, idempotent. Frontend only.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -100)"
NEEDS="A chat can be left unread"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — that commit is not in the last 100."; exit 1 ;;
esac
MARK="A handful of messages can be moved at once"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
cat > "$OWNED_TMP" <<'EOF'
together-city-react/src/features/chat/components/MessageThread.tsx
together-city-react/src/features/chat/components/ForwardPanel.tsx
together-city-react/src/features/chat/pages/Chats.tsx
together-city-react/src/app/a-handful-of-messages-at-once.test.ts
EOF

# A PARALLEL SESSION IS WORKING IN THIS TREE. It owns src/mail on both sides and
# it owns index.css this evening; those are tolerated rather than stashed,
# because `git stash` is one stack shared by every session in the repo and the
# last time two runs shared it one of them popped entries it had not pushed.
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch|apply-.*\.py|.*\.css|.*\.log)$' || true)"
if [ -n "$DIRTY" ]; then
  BAD="$(echo "$DIRTY" | awk '{print $NF}' \
    | grep -Ev '(together-city-chat/src/mail/|together-city-react/src/features/mail/|^together-city-react/src/index\.css$)' \
    | grep -Fxv -f "$OWNED_TMP" || true)"
  if [ -n "$BAD" ]; then
    echo "!! Working tree has changes outside this script's scope and outside the mail session's. Commit first:"
    echo "$BAD"; exit 1
  fi
  echo "== Continuing over the mail session's files and this script's own."
fi

echo "== Applying anchored edits"
python3 <<'PYEOF'
import pathlib, sys

def apply(path, present, anchor, replacement):
    p = pathlib.Path(path); s = p.read_text(encoding='utf-8')
    if present in s:
        print(f"   = {path}: already applied"); return
    if s.count(anchor) != 1:
        sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x (need 1).\n--- anchor:\n{anchor[:240]}")
    if present not in replacement:
        sys.exit(f"!! {path}: idempotence marker is not in the text it inserts — this would apply twice.\n--- marker: {present}")
    p.write_text(s.replace(anchor, replacement), encoding='utf-8'); print(f"   + {path}")

THREAD = 'together-city-react/src/features/chat/components/MessageThread.tsx'
FWD    = 'together-city-react/src/features/chat/components/ForwardPanel.tsx'
CHATS  = 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── 1 · the window rule and the delete wording become shared ────────────────
apply(THREAD, "export const withinWindow",
r'''/** 15-minute edit / delete-for-everyone window (matches the server policy). */
const WINDOW_MS = 15 * 60 * 1000;
const withinWindow = (m: Message) => Date.now() - new Date(m.createdAt).getTime() < WINDOW_MS;

function ConfirmDelete({ mine, canEveryone, onCancel, onDelete }: {
  mine: boolean; canEveryone: boolean;
  onCancel: () => void; onDelete: (scope: 'ME' | 'EVERYONE') => void;
}) {
  return (''',
r'''/**
 * 15-minute edit / delete-for-everyone window (matches the server policy).
 *
 * EXPORTED because the bulk bar has to ask the same question of a whole
 * selection: "for everyone" is offered only when every message in it is yours
 * and still inside the window. A second copy of the rule in the page would go
 * on looking correct for exactly as long as the two numbers happened to agree,
 * which is the kind of duplication this repo does factor out — the test is
 * whether it can fail SILENTLY, not whether there are two callers.
 */
const WINDOW_MS = 15 * 60 * 1000;
export const withinWindow = (m: Message) => Date.now() - new Date(m.createdAt).getTime() < WINDOW_MS;

/**
 * Exported for the same reason. The wording of a delete is the safety-critical
 * part of it — what it promises about other people's copies — and a bulk delete
 * that invented its own phrasing is how the two drift apart.
 */
export function ConfirmDelete({ mine, canEveryone, count = 1, onCancel, onDelete }: {
  mine: boolean; canEveryone: boolean;
  /** How many messages this is about: 1 from the thread, the selection size from the bulk bar. */
  count?: number;
  onCancel: () => void; onDelete: (scope: 'ME' | 'EVERYONE') => void;
}) {
  const these = count > 1 ? `these ${count} messages` : 'this message';
  return (''')

apply(THREAD, "Delete {these}?",
r'''        <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Delete this message?</h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
          {canEveryone
            ? 'Delete just from your history, or for everyone in the conversation.'
            : mine
              ? 'The delete-for-everyone window (15 min) has passed — this will remove it from your history only.'
              : 'This will be permanently removed from your chat history. Others still see the original.'}
        </p>''',
r'''        <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Delete {these}?</h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
          {canEveryone
            ? 'Delete just from your history, or for everyone in the conversation.'
            : mine
              ? `The delete-for-everyone window (15 min) has passed — this will remove ${count > 1 ? 'them' : 'it'} from your history only.`
              : `This will be permanently removed from your chat history. Others still see the ${count > 1 ? 'originals' : 'original'}.`}
        </p>''')

# ── 2 · the thread learns what is picked ───────────────────────────────────
apply(THREAD, "selectedIds?: Set<string>;",
r'''  onForward?: (m: Message) => void;
  onStar?: (m: Message, on: boolean) => void;''',
r'''  onForward?: (m: Message) => void;
  onStar?: (m: Message, on: boolean) => void;
  /** Which messages the page currently has selected. SELECTION MODE IS A
   *  NON-EMPTY SET — there is no second boolean to keep in step with it, and
   *  the disagreement that would matter is an empty selection still swallowing
   *  every tap. "Cancel" is the page emptying the set. */
  selectedIds?: Set<string>;
  /** Toggle one message in the selection. The first call is what enters
   *  selection mode, which is why the way in is a button in the action bar
   *  rather than a gesture: long-press already belongs to that bar, and taking
   *  it would put Reply, Keep, Copy, Edit and Info out of reach on a phone. */
  onSelect?: (m: Message) => void;''')

apply(THREAD, "jumpToId, selectedIds, onSelect }",
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onForward, onStar, onJump, fetchInfo, jumpToId }: {''',
r'''export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onForward, onStar, onJump, fetchInfo, jumpToId, selectedIds, onSelect }: {''')

apply(THREAD, "const selecting = Boolean(",
r'''  const at = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });''',
r'''  const at = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /* The mode is derived, never stored. `onSelect` is in the condition too, so a
     caller that passes ids without a handler gets a thread that reads normally
     rather than one whose every tap does nothing. */
  const selecting = Boolean(onSelect && selectedIds && selectedIds.size > 0);''')

apply(THREAD, "const picked = Boolean(selectedIds",
r'''        const isCollapsing = collapsing.has(m.id);''',
r'''        const isCollapsing = collapsing.has(m.id);
        const picked = Boolean(selectedIds?.has(m.id));
        /* A tombstone cannot be picked: forwarding it would send "this message
           was deleted" to somebody, and deleting it again is a no-op. */
        const pickable = selecting && !deleted;''')

apply(THREAD, "onClickCapture={(e)",
r'''            <div
              data-mid={m.id}
              className={`tc-msg-row tc-msg-collapse${isCollapsing ? ' tc-msg-collapsing' : ''}${touchOpen === m.id ? ' touch-open' : ''}`}
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: m.share ? 320 : '100%',
                ...(flashId === m.id ? { outline: '2px solid var(--on-stage-faint)', outlineOffset: 4, borderRadius: 14 } : null) }}
              onTouchStart={() => { longPress.current = setTimeout(() => setTouchOpen((t) => (t === m.id ? null : m.id)), 450); }}
              onTouchEnd={() => { if (longPress.current) clearTimeout(longPress.current); }}
              onTouchMove={() => { if (longPress.current) clearTimeout(longPress.current); }}>

              {/* hover / long-press actions — never on deleted messages */}
              {!deleted && onDelete && (''',
r'''            <div
              data-mid={m.id}
              className={`tc-msg-row tc-msg-collapse${isCollapsing ? ' tc-msg-collapsing' : ''}${touchOpen === m.id ? ' touch-open' : ''}`}
              role={pickable ? 'button' : undefined}
              tabIndex={pickable ? 0 : undefined}
              aria-pressed={pickable ? picked : undefined}
              aria-label={pickable ? (picked ? 'Deselect this message' : 'Select this message') : undefined}
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: m.share ? 320 : '100%',
                ...(pickable ? { cursor: 'pointer' } : null),
                /* THREE STATES, ONE OUTLINE. Picked is the bright ink; a
                   selectable-but-unpicked row gets a dashed hint, so the mode
                   is legible without a checkbox column that would re-flow every
                   bubble on the stage the moment somebody long-pressed. The
                   search flash keeps the middle tone and yields while picking —
                   two outlines on one row is a row saying two things. */
                ...(pickable
                  ? (picked
                      ? { outline: '2px solid var(--on-stage)', outlineOffset: 4, borderRadius: 14 }
                      : { outline: '1px dashed var(--on-stage-faint)', outlineOffset: 4, borderRadius: 14 })
                  : flashId === m.id
                    ? { outline: '2px solid var(--on-stage-faint)', outlineOffset: 4, borderRadius: 14 }
                    : null) }}
              /* CAPTURE, so the tap never reaches what it landed on. A bubbling
                 handler runs AFTER the quotation's own onClick has jumped the
                 thread and after an attachment's <a> has decided to open — so
                 picking a photo would open the photo, and picking a reply would
                 scroll away from the selection being made. */
              onClickCapture={(e) => {
                if (!pickable) return;
                e.preventDefault(); e.stopPropagation();
                onSelect?.(m);
              }}
              onKeyDown={(e) => {
                if (!pickable) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(m); }
              }}
              onTouchStart={() => {
                /* One long-press, one meaning. While picking, the bar it would
                   open is suppressed anyway, so the timer stays home. */
                if (selecting) return;
                longPress.current = setTimeout(() => setTouchOpen((t) => (t === m.id ? null : m.id)), 450);
              }}
              onTouchEnd={() => { if (longPress.current) clearTimeout(longPress.current); }}
              onTouchMove={() => { if (longPress.current) clearTimeout(longPress.current); }}>

              {/* hover / long-press actions — never on deleted messages, and
                  never while picking: in selection mode the row IS the control,
                  and an action bar on top of it is a second thing a tap means. */}
              {!deleted && !selecting && onDelete && (''')

apply(THREAD, 'title="Select messages"',
r'''                  {onReply && <button type="button" title="Reply" onClick={() => { onReply(m); setTouchOpen(null); }}>↩ Reply</button>}''',
r'''                  {onReply && <button type="button" title="Reply" onClick={() => { onReply(m); setTouchOpen(null); }}>↩ Reply</button>}
                  {/* THE WAY IN. No new gesture: this bar is already what a
                      long-press opens and what a hover shows, and a button in
                      it is also the only version of "select" that a mouse can
                      find. */}
                  {onSelect && !deleted && (
                    <button type="button" title="Select messages"
                      onClick={() => { onSelect(m); setTouchOpen(null); }}>☑ Select</button>
                  )}''')

# ── 3 · one destination, any number of messages ────────────────────────────
apply(FWD, "messages: Message[];",
r'''/**
 * WHERE DOES THIS GO.
 *
 * One conversation at a time, deliberately: forwarding to several at once is
 * the same call in a loop, and the thing that makes it safe — being sure which
 * room you just put somebody's message into — is exactly what a multi-select
 * makes fuzzy. The list names the room and says nothing else.
 *
 * The conversation it came FROM is excluded. Forwarding a message into the
 * thread it is already in is never what somebody means, and offering it is how
 * a mis-tap becomes a duplicate.
 */
export function ForwardPanel({ message, fromConversationId, conversations, onClose, onSent }: {
  message: Message;
  fromConversationId?: string;
  conversations: Conversation[];
  onClose: () => void;
  onSent: (toConversationId: string) => void;
}) {''',
r'''/**
 * WHERE DOES THIS GO.
 *
 * ONE DESTINATION, ANY NUMBER OF MESSAGES — and the asymmetry is the point,
 * not a half-finished multi-select. Picking several ROOMS is what makes
 * forwarding unsafe: being sure which thread you just put somebody's words into
 * is the whole of it, and a list of checked destinations is exactly what makes
 * that fuzzy. Picking several MESSAGES costs none of that. The room is still
 * one room, still named once on its own line; only how much goes there changed.
 *
 * The conversation it came FROM is excluded. Forwarding a message into the
 * thread it is already in is never what somebody means, and offering it is how
 * a mis-tap becomes a duplicate.
 *
 * THE SENDS ARE SEQUENTIAL. Awaiting them one at a time keeps the arrival order
 * the same as the reading order — Promise.all would land them in whatever order
 * the server finished, which is how a forwarded exchange stops making sense —
 * and it lets a failure say how many got through and name the one it stopped
 * at, which is the only version of that message a citizen can act on.
 */
export function ForwardPanel({ messages, fromConversationId, conversations, onClose, onSent }: {
  /** In thread order. They arrive in the destination in the same order. */
  messages: Message[];
  fromConversationId?: string;
  conversations: Conversation[];
  onClose: () => void;
  onSent: (toConversationId: string, count: number) => void;
}) {''')

apply(FWD, "const describe = (m: Message)",
r'''  const targets = conversations.filter((c) => c.id !== fromConversationId);
  const preview = message.body
    || (message.share?.title ? `Card · ${message.share.title}` : '')
    || ((message.media ?? []).length ? `${message.media!.length} attachment${message.media!.length > 1 ? 's' : ''}` : 'Message');

  const send = async (to: Conversation) => {
    setBusy(to.id); setErr(null);
    try {
      await chatApi.forwardMessage(to.id, message);
      onSent(to.id);
    } catch (e) {
      setErr((e as { message?: string }).message || 'That could not be forwarded.');
      setBusy(null);
    }
  };''',
r'''  const targets = conversations.filter((c) => c.id !== fromConversationId);
  const [sent, setSent] = useState(0);

  /** One message on one line: the subtitle when there is a single one, and what
   *  a failure names when there are several. */
  const describe = (m: Message) => m.body
    || (m.share?.title ? `Card · ${m.share.title}` : '')
    || ((m.media ?? []).length ? `${m.media!.length} attachment${m.media!.length > 1 ? 's' : ''}` : 'Message');
  const preview = messages.length === 1 ? describe(messages[0]) : `${messages.length} messages`;

  const send = async (to: Conversation) => {
    setBusy(to.id); setErr(null); setSent(0);
    for (let i = 0; i < messages.length; i++) {
      try {
        await chatApi.forwardMessage(to.id, messages[i]);
        setSent(i + 1);
      } catch (e) {
        /* Name what stopped it and how far it got. "That could not be
           forwarded" is a fine answer for one message and a useless one for
           nine, because the citizen still has to decide whether to send the
           rest again — and the copies already delivered are not coming back. */
        const why = (e as { message?: string }).message || 'That could not be forwarded.';
        setErr(messages.length === 1
          ? why
          : `Sent ${i} of ${messages.length}. “${describe(messages[i])}” did not go — ${why}`);
        setBusy(null);
        return;
      }
    }
    onSent(to.id, messages.length);
  };''')

apply(FWD, "Sending ${sent + 1} of",
r'''                  {busy === c.id ? 'Sending…' : (c.title || 'Conversation')}''',
r'''                  {busy === c.id
                    ? (messages.length > 1 ? `Sending ${sent + 1} of ${messages.length}…` : 'Sending…')
                    : (c.title || 'Conversation')}''')

# ── 4 · the page owns the selection and the bar ────────────────────────────
apply(CHATS, "MessageThread, ConfirmDelete, withinWindow",
r'''import { MessageThread } from '../components/MessageThread';''',
r'''import { MessageThread, ConfirmDelete, withinWindow } from '../components/MessageThread';''')

apply(CHATS, "const [selected, setSelected]",
r'''  const [forwarding, setForwarding] = useState<Message | null>(null);''',
r'''  /* Forwarding takes a LIST now, always. One message is a list of one — the
     alternative is a union the panel would have to narrow on every read. */
  const [forwarding, setForwarding] = useState<Message[] | null>(null);
  /* WHAT IS PICKED LIVES HERE. The bulk bar replaces the conversation header,
     which this page owns; a selection held inside MessageThread would have to
     be lifted out again on the first render of that bar. Ids rather than
     messages, so an edit, a receipt or a tombstone arriving mid-selection
     cannot leave a stale copy of a message sitting in the set. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDelete, setBulkDelete] = useState(false);''')

apply(CHATS, "setSelected(new Set()); setBulkDelete(false); }, [activeId]);",
r'''setJumpToId(null); setJumpNote(null); setStarredOnly(false); }, [activeId]);''',
r'''setJumpToId(null); setJumpNote(null); setStarredOnly(false); setSelected(new Set()); setBulkDelete(false); }, [activeId]);''')

apply(CHATS, "const deleteSelected = useCallback",
r'''  /* A RECEIPT IS SENT ONCE, FOR SOMETHING NOT YET READ.''',
r'''  /* The picked messages, in thread order, resolved from the live list on every
     render. Anything that has left the thread while it was picked — deleted for
     me, or cleared with the conversation — simply stops being in here, so the
     bar can never act on a message that is no longer on screen. */
  const picked = useMemo(() => messages.filter((m) => selected.has(m.id)), [messages, selected]);
  const toggleSelect = useCallback((m: Message) => {
    setSelected((s) => {
      const next = new Set(s);
      // delete() reports whether it removed anything, which is the toggle.
      if (!next.delete(m.id)) next.add(m.id);
      return next;
    });
  }, []);

  /* DELETE FOR EVERYONE IS ALL OR NOTHING. It is offered only when every picked
     message is yours and still inside the 15-minute window — the same
     `withinWindow` the thread asks about one message, imported rather than
     restated. Applying it to the eligible half and quietly downgrading the rest
     would be a delete whose outcome nobody could state afterwards, and "some of
     them are gone for everyone" is not a sentence anybody should have to work
     out from a list of bubbles. */
  const allMine = picked.length > 0 && picked.every((m) => m.senderId === user?.id);
  const canDeleteForEveryone = allMine && picked.every((m) => !m.deleted && withinWindow(m));

  /* Sequential, and the selection is emptied FIRST: a bar counting down while
     its own messages disappear underneath it is a control describing something
     that has stopped being true. Each call swallows its own failure exactly as
     the single delete does, so a message the window closed on stays put. */
  const deleteSelected = useCallback(async (scope: 'ME' | 'EVERYONE') => {
    const ids = picked.map((m) => m.id);
    setBulkDelete(false);
    setSelected(new Set());
    for (const id of ids) await deleteMessage(id, scope);
  }, [picked, deleteMessage]);

  /* A RECEIPT IS SENT ONCE, FOR SOMETHING NOT YET READ.''')

apply(CHATS, "{picked.length} selected",
r'''              <div className="cshead-t">
                {phone && (
                  <button type="button" className="csback" aria-label="Back to chats"
                    onClick={() => setActiveId(undefined)}>''',
r'''              <div className="cshead-t">
                {/* THE BULK BAR REPLACES THE HEADER — it does not float. The
                    composer is fixed to a locked visual viewport on a phone,
                    and a bar hovering above it is the one piece of chrome
                    guaranteed to end up under a keyboard. Taking the header's
                    place costs nothing: while you are picking messages, the
                    name of the room and its call buttons are not what this row
                    is for, and it is exactly where somebody is already looking
                    for the way out. */}
                {picked.length > 0 ? (
                  <>
                    <button type="button" className="csback" aria-label="Cancel selection"
                      onClick={() => setSelected(new Set())}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: 'block' }}>{picked.length} selected</b>
                      <em>{picked.length === 1 ? 'Tap another to add it' : 'Tap one again to drop it'}</em>
                    </div>
                    <button type="button" className="cstool" style={{ flex: 'none' }} title="Forward"
                      aria-label={`Forward ${picked.length} selected message${picked.length > 1 ? 's' : ''}`}
                      onClick={() => setForwarding(picked)}>⤳</button>
                    <button type="button" className="cstool" style={{ flex: 'none' }} title="Delete"
                      aria-label={`Delete ${picked.length} selected message${picked.length > 1 ? 's' : ''}`}
                      onClick={() => setBulkDelete(true)}>🗑</button>
                  </>
                ) : (
                <>
                {phone && (
                  <button type="button" className="csback" aria-label="Back to chats"
                    onClick={() => setActiveId(undefined)}>''')

apply(CHATS, "end of the ordinary header",
r'''                <CallButtons conversationId={activeId} compact />
              </div>''',
r'''                <CallButtons conversationId={activeId} compact />
                {/* end of the ordinary header — the bulk bar above takes this
                    whole row when anything is picked. */}
                </>
                )}
              </div>''')

apply(CHATS, "selectedIds={selected} onSelect={toggleSelect}",
r'''                      onReply={setReplyTo} onForward={setForwarding} onStar={(m, on) => { void starMessage(m, on); }}
                      onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}
                      fetchInfo={chatApi.messageInfo} />''',
r'''                      onReply={setReplyTo} onForward={(m) => setForwarding([m])} onStar={(m, on) => { void starMessage(m, on); }}
                      onJump={(id) => { void jumpTo(id); }} jumpToId={jumpToId}
                      selectedIds={selected} onSelect={toggleSelect}
                      fetchInfo={chatApi.messageInfo} />''')

apply(CHATS, "<ForwardPanel messages={forwarding}",
r'''                <ForwardPanel message={forwarding} fromConversationId={activeId}
                  conversations={list}
                  onClose={() => setForwarding(null)}
                  onSent={(toId) => {
                    setForwarding(null);
                    void conversations.refetch();''',
r'''                <ForwardPanel messages={forwarding} fromConversationId={activeId}
                  conversations={list}
                  onClose={() => setForwarding(null)}
                  onSent={(toId) => {
                    setForwarding(null);
                    /* Forwarding is the end of the selection. The messages have
                       gone where they were going, and a bar still standing over
                       them is an invitation to send the lot a second time. */
                    setSelected(new Set());
                    void conversations.refetch();''')

apply(CHATS, "{bulkDelete && picked.length > 0 && (",
r'''              {groupOpen && activeId && (''',
r'''              {bulkDelete && picked.length > 0 && (
                <ConfirmDelete
                  mine={allMine}
                  canEveryone={canDeleteForEveryone}
                  count={picked.length}
                  onCancel={() => setBulkDelete(false)}
                  onDelete={(scope) => { void deleteSelected(scope); }}
                />
              )}
              {groupOpen && activeId && (''')

print("== Anchored edits applied.")
PYEOF

echo "== Writing the guard"
python3 <<'PYEOF'
import pathlib
p = pathlib.Path('together-city-react/src/app/a-handful-of-messages-at-once.test.ts')
src = '''import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
/** Comments explain each trap by naming it, so an absence check that read them
 *  would match its own documentation and never go red. */
const strip = (s: string) =>
  s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ').replace(/(^|[^:])\\/\\/.*$/gm, '$1 ');

const page = strip(read('features', 'chat', 'pages', 'Chats.tsx'));
const thread = strip(read('features', 'chat', 'components', 'MessageThread.tsx'));
const fwd = strip(read('features', 'chat', 'components', 'ForwardPanel.tsx'));

/**
 * A HANDFUL OF MESSAGES CAN BE MOVED AT ONCE.
 *
 * Four things about multi-select are load-bearing and none of them are visible
 * in a screenshot of it working. They are pinned here because each one fails
 * quietly: a floating bar looks fine until a keyboard opens, a bubbling click
 * handler looks fine until somebody picks a photo, a re-stated fifteen minutes
 * looks fine for as long as the two numbers agree, and a partial
 * delete-for-everyone looks fine to everybody except the people who kept a copy.
 */
describe('the bulk bar', () => {
  it('replaces the conversation header rather than floating over the composer', () => {
    // The composer is fixed to a locked visual viewport on a phone. Anything
    // hovering above it is the one piece of chrome a keyboard will cover.
    const head = page.indexOf('className="cshead-t"');
    const composer = page.indexOf('<Composer');
    expect(head).toBeGreaterThan(-1);
    const bar = page.indexOf('{picked.length} selected');
    expect(bar).toBeGreaterThan(head);
    expect(bar).toBeLessThan(composer);
  });

  it('offers a way out of selection mode', () => {
    expect(page).toMatch(/aria-label="Cancel selection"/);
  });

  it('names how many messages each control will act on', () => {
    // "Forward" alone on a bar over nine selected messages is a button that
    // does not say what it is about to do.
    expect(page).toMatch(/Forward \\$\\{picked\\.length\\} selected message/);
    expect(page).toMatch(/Delete \\$\\{picked\\.length\\} selected message/);
  });
});

describe('deleting a selection', () => {
  it('offers "for everyone" only when every picked message is yours and still in the window', () => {
    expect(page).toMatch(/picked\\.every\\(\\(m\\) => m\\.senderId === user\\?\\.id\\)/);
    expect(page).toMatch(/picked\\.every\\(\\(m\\) => !m\\.deleted && withinWindow\\(m\\)\\)/);
  });

  it('asks the thread for the window rather than restating it', () => {
    expect(page).toMatch(/import \\{ MessageThread, ConfirmDelete, withinWindow \\}/);
    // A second copy of the number would look correct for exactly as long as the
    // two happened to agree.
    expect(page).not.toMatch(/15 \\* 60 \\* 1000/);
    expect(thread).toMatch(/export const withinWindow/);
  });

  it('uses the thread\\'s own delete wording, widened for a count', () => {
    expect(thread).toMatch(/export function ConfirmDelete/);
    expect(thread).toMatch(/count = 1/);
    expect(page).toMatch(/count=\\{picked\\.length\\}/);
  });
});

describe('picking a message', () => {
  it('adds no second gesture — the long-press still opens the action bar', () => {
    // One 450ms timer, doing one thing. Repurposing it would have put Reply,
    // Keep, Copy, Edit and Info out of reach on a phone.
    expect(thread.match(/450/g) ?? []).toHaveLength(1);
    expect(thread).toMatch(/title="Select messages"/);
  });

  it('intercepts the tap in the capture phase', () => {
    // A bubbling handler runs after the quotation has already jumped the thread
    // and after an attachment's anchor has decided to open.
    expect(thread).toMatch(/onClickCapture=/);
    expect(thread).toMatch(/e\\.preventDefault\\(\\); e\\.stopPropagation\\(\\);/);
  });

  it('derives the mode from the set instead of storing a second flag', () => {
    expect(thread).toMatch(/const selecting = Boolean\\(onSelect && selectedIds && selectedIds\\.size > 0\\)/);
  });

  it('never picks a deleted message', () => {
    expect(thread).toMatch(/const pickable = selecting && !deleted/);
  });
});

describe('forwarding several', () => {
  it('takes a list, and still sends to exactly one room', () => {
    expect(fwd).toMatch(/messages: Message\\[\\]/);
    expect(fwd).toMatch(/c\\.id !== fromConversationId/);
  });

  it('sends them one after another so they arrive in reading order', () => {
    // Promise.all would land them in whatever order the server finished.
    expect(fwd).not.toMatch(/Promise\\.all/);
    expect(fwd).toMatch(/for \\(let i = 0; i < messages\\.length; i\\+\\+\\)/);
  });

  it('says how many got through when one of them fails', () => {
    expect(fwd).toMatch(/Sent \\$\\{i\\} of \\$\\{messages\\.length\\}/);
  });
});
'''
if p.exists() and p.read_text(encoding='utf-8') == src:
    print('   = guard: already written')
else:
    p.write_text(src, encoding='utf-8')
    print(f'   + {p}')
PYEOF

echo "== Gates: frontend (tsc + vitest + build)"
echo "   Backend is untouched by this change — no schema, no route, no service."
( cd together-city-react && npx tsc --noEmit && npx vitest run --silent && npm run -s build )

echo "== Committing"
git add \
  together-city-react/src/features/chat/components/MessageThread.tsx \
  together-city-react/src/features/chat/components/ForwardPanel.tsx \
  together-city-react/src/features/chat/pages/Chats.tsx \
  together-city-react/src/app/a-handful-of-messages-at-once.test.ts \
  land-a-handful-of-messages-at-once.sh

git commit -m "A handful of messages can be moved at once" -m "Multi-select in a thread: pick several messages, forward them all to one
room, or delete them together. No backend, no migration, no new route —
Forward, Delete, Star and Copy already existed one message at a time, and
this makes two of them bulk.

THE SELECTION LIVES IN THE PAGE. The bulk bar replaces the conversation
header, which Chats.tsx owns; a selection held inside MessageThread would
have to be lifted out again on the first render of that bar. The thread is
told what is picked and how to toggle it, and nothing else. Ids rather than
messages, so an edit or a tombstone arriving mid-selection cannot leave a
stale copy sitting in the set.

AND THE BAR REPLACES THE HEADER RATHER THAN FLOATING. The composer is fixed
to a locked visual viewport on a phone, so anything hovering above it is
the one piece of chrome guaranteed to end up under a keyboard. While you
are picking messages the room's name and its call buttons are not what that
row is for, and the row is where somebody is already looking for the way
out.

NO SECOND GESTURE — and no gesture taken away either. Selection is entered
from a Select button inside the action bar that a long-press already opens
and a hover already shows. Repurposing the 450ms long-press itself, which
was the obvious reading, would have put Reply, Keep, Copy, Edit and Info
out of reach on a phone; a button also gives the mode a way in on a desk,
where nobody long-presses anything. Once picking, a tap toggles and the
action bar is suppressed, because the row is the control now.

The tap is intercepted in the CAPTURE phase. A bubbling handler runs after
the quotation's own onClick has jumped the thread and after an attachment's
anchor has decided to open, so picking a photo would open the photo.

DELETE FOR EVERYONE IS ALL OR NOTHING: offered only when every picked
message is yours and still inside the 15-minute window. withinWindow and
ConfirmDelete are exported from MessageThread rather than restated — the
number and the wording are the safety-critical parts, and two copies would
look correct for exactly as long as they happened to agree. Applying it to
the eligible half and downgrading the rest would be a delete whose outcome
nobody could state afterwards.

ForwardPanel takes a list and still sends to one room. The asymmetry is the
point: picking several destinations is what makes forwarding unsafe, and
picking several messages costs none of that. The sends are sequential so
they arrive in reading order, and a failure names the message it stopped at
and says how many got through.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TvSk8yA3rcp4MtLPLrnCY9"

echo "== Landed: \"$MARK\". Push when ready."
