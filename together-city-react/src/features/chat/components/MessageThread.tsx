import { useEffect, useRef, useState } from 'react';
import type { Message, MediaAttachment } from '@/types';
import { ShareCardView } from '../share';

const fmtSize = (n?: number): string =>
  !n ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const fmtClock = (sec?: number): string =>
  typeof sec === 'number' && sec > 0
    ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
    : '';

/**
 * WHAT ARRIVED, RENDERED AS WHAT IT IS.
 *
 * A voice note is a player with its length on it; a photo is the photo; a file
 * is a row you can read the name and the weight of before deciding to open it.
 * All three used to be the same thing — nothing at all, because the thread
 * rendered `body` and `share` and ignored `media` entirely, on a schema that
 * has carried attachments since it was written.
 *
 * The audio element is the browser's own. A hand-drawn waveform here would be
 * a picture of a sound nobody has decoded — and the native player brings
 * keyboard control, scrubbing and the platform's own accessibility for free.
 */
function Attachment({ a, mine }: { a: MediaAttachment; mine: boolean }) {
  const name = a.name ?? 'Attachment';
  const sub = [a.name ? fmtSize(a.sizeBytes) : '', fmtClock(a.durationSec)].filter(Boolean).join(' · ');

  if (a.kind === 'image') {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', maxWidth: 260 }}>
        <img src={a.thumbUrl || a.url} alt={a.name ?? 'Shared photo'} loading="lazy"
          style={{ width: '100%', borderRadius: 14, display: 'block', background: 'var(--stage-tile)' }} />
      </a>
    );
  }
  if (a.kind === 'video') {
    return <video src={a.url} controls preload="metadata" style={{ maxWidth: 260, width: '100%', borderRadius: 14, display: 'block' }} />;
  }
  if (a.kind === 'audio') {
    return (
      <div className={mine ? 'csb me' : 'csb'} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 232 }}>
        {/* No caption track: a voice note is speech nobody has transcribed, and
            an empty <track> would be a promise of subtitles that do not exist.
            The duration is stated below instead, and the native player brings
            the platform's own keyboard and screen-reader handling. */}
        <audio src={a.url} controls preload="metadata" style={{ width: '100%', height: 34 }} />
        <span style={{ fontSize: 11, opacity: .75 }}>
          Voice note{fmtClock(a.durationSec) ? ` · ${fmtClock(a.durationSec)}` : ''}
        </span>
      </div>
    );
  }
  return (
    <a href={a.url} target="_blank" rel="noreferrer" download={a.name}
      className={mine ? 'csb me' : 'csb'}
      style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', maxWidth: 280 }}>
      <span aria-hidden style={{ fontSize: 20, flex: 'none' }}>📄</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, opacity: .75 }}>{sub}</span>}
      </span>
    </a>
  );
}

/** WhatsApp-style delivery ticks (shown on your own messages only). */
function Ticks({ status }: { status?: Message['status'] }) {
  if (!status) return null;
  const read = status === 'READ';
  const double = status === 'DELIVERED' || status === 'READ';
  /* On the stage there is no info-blue to read against black. Read is the
     bright ink, delivered is the soft one. */
  const color = read ? 'var(--on-stage)' : 'var(--on-stage-faint)';
  return (
    <span aria-label={status.toLowerCase()} style={{ color, marginLeft: 4, letterSpacing: -2, fontSize: 12, fontWeight: 700 }}>
      {double ? '✓✓' : '✓'}
    </span>
  );
}

const CSS = `
.tc-msg-row{position:relative}
.tc-msg-actions{opacity:0;pointer-events:none;transition:opacity var(--dur-fast) var(--ease);position:absolute;top:-16px;display:flex;gap:2px;background:var(--stage-solid);border:1px solid var(--stage-line);border-radius:999px;padding:3px 5px;box-shadow:var(--soft-out);z-index:5}
.tc-msg-row:hover .tc-msg-actions,.tc-msg-row.touch-open .tc-msg-actions{opacity:1;pointer-events:auto}
.tc-msg-actions button{border:none;background:none;cursor:pointer;font-size:12px;padding:4px 7px;border-radius:999px;font-family:inherit;color:var(--on-stage-soft);line-height:1}
.tc-msg-actions button:hover{background:var(--stage-tile)}
.tc-msg-actions button.danger{color:var(--on-stage)}
/* Was max-height: 2000px -> 0 over 250ms. A message is ~60px, so 97% of the
   duration passed with nothing visible and the collapse happened in the last
   7ms. grid-template-rows: 1fr -> 0fr collapses to the row's *actual* height
   with no magic number and no measurement. The opacity leg is --dur-fast so the
   message is gone before the gap finishes closing at --dur-base. */
.tc-msg-collapse{display:grid;grid-template-rows:1fr;transition:grid-template-rows var(--dur-base) var(--ease-out),opacity var(--dur-fast) var(--ease-out)}
.tc-msg-collapse > *{overflow:hidden;min-height:0}
.tc-msg-collapsing{grid-template-rows:0fr;opacity:0}
/* A chip is small on purpose — it sits under a bubble and must not compete
   with it — so it borrows the repo's own answer to that: a transparent 44px
   pseudo-element centred behind the label, so the TARGET meets the standard
   while the paint stays 22px. Same trick as .btn-sm::after in relief.css,
   which tap-targets.test.ts exists to stop anybody removing. */
.tc-react{position:relative;display:inline-flex;align-items:center;gap:3px;border:1px solid var(--stage-line);background:var(--stage-tile);color:var(--on-stage-soft);border-radius:999px;padding:1px 8px;font-size:11.5px;font-family:inherit;line-height:1.7;cursor:pointer}
.tc-react.mine{border-color:var(--on-stage-faint);color:var(--on-stage)}
.tc-react::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:44px;min-height:44px;z-index:0}
.tc-react > span{position:relative;z-index:1}
.tc-msg-actions button.tc-emoji{font-size:15px;padding:2px 5px}
`;

/**
 * THE SIX.
 *
 * A closed set, and the same closed set the API enforces in
 * messages/dto/messages.dto.ts — the two packages share no code, so this is a
 * copy and the guard pins both ends of it. Six is what fits on one row of a
 * phone beside the other actions, which is the reason there is no picker to
 * open: the picker IS the row.
 */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

/**
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
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(20,18,12,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onCancel}>
      <div className="card" style={{ width: 'min(400px, 100%)', padding: '22px 24px' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Delete {these}?</h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
          {canEveryone
            ? 'Delete just from your history, or for everyone in the conversation.'
            : mine
              ? `The delete-for-everyone window (15 min) has passed — this will remove ${count > 1 ? 'them' : 'it'} from your history only.`
              : `This will be permanently removed from your chat history. Others still see the ${count > 1 ? 'originals' : 'original'}.`}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-line btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-line btn-sm" style={{ color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' }} onClick={() => onDelete('ME')}>Delete for me</button>
          {canEveryone && (
            <button type="button" className="btn btn-sm" style={{ background: 'var(--danger-ink)', color: 'var(--on-accent)', border: 'none' }} onClick={() => onDelete('EVERYONE')}>Delete for everyone</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageThread({ messages, currentUserId, typing, peerName, onDelete, onEdit, onReply, onForward, onStar, onJump, fetchInfo, jumpToId, selectedIds, onSelect, onReact, onPin, pinnedId }: {
  messages: Message[]; currentUserId?: string; typing?: boolean;
  /** Whose thread this is, for the attribution line above each run. */
  peerName?: string;
  onDelete?: (messageId: string, scope: 'ME' | 'EVERYONE') => Promise<void> | void;
  onEdit?: (messageId: string, body: string) => Promise<void> | void;
  onReply?: (m: Message) => void;
  onForward?: (m: Message) => void;
  onStar?: (m: Message, on: boolean) => void;
  /** Which messages the page currently has selected. SELECTION MODE IS A
   *  NON-EMPTY SET — there is no second boolean to keep in step with it, and
   *  the disagreement that would matter is an empty selection still swallowing
   *  every tap. "Cancel" is the page emptying the set. */
  selectedIds?: Set<string>;
  /** Answer a message with one of THE SIX, or clear yours by passing null —
   *  which is also what tapping your own chip does. One per person, so the
   *  page never has to work out which of several to remove. */
  onReact?: (m: Message, emoji: string | null) => void;
  /** Pin this message for the whole room, or unpin it. One per conversation,
   *  so pinning anything is also unpinning whatever was there. */
  onPin?: (m: Message, on: boolean) => void;
  /** The id of the room's pinned message, so the action bar can offer "Unpin"
   *  on the one message where that is the honest word. */
  pinnedId?: string | null;
  /** Toggle one message in the selection. The first call is what enters
   *  selection mode, which is why the way in is a button in the action bar
   *  rather than a gesture: long-press already belongs to that bar, and taking
   *  it would put Reply, Keep, Copy, Edit and Info out of reach on a phone. */
  onSelect?: (m: Message) => void;
  /** Tapping a quotation asks the page to jump — the page owns history, and
   *  the message may be older than what is loaded. */
  onJump?: (messageId: string) => void;
  /** Who received and read one of your own messages. Structural type rather
   *  than an import: this component reads `@/types`, and one endpoint's shape
   *  is not worth a second source of truth for it to drift against. */
  fetchInfo?: (messageId: string) => Promise<{
    sentAt: string;
    recipients: Array<{ userId: string; name?: string | null; handle?: string | null; status: string; readAt?: string | null }>;
  }>;
  /** A message to bring into view — from a search result, or from tapping a
   *  quotation. Scrolls THIS box only, never an ancestor: see the note on the
   *  auto-scroll below, which is the same lesson learned the same way. */
  jumpToId?: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [confirmFor, setConfirmFor] = useState<Message | null>(null);
  const [collapsing, setCollapsing] = useState<Set<string>>(new Set());
  const [touchOpen, setTouchOpen] = useState<string | null>(null);
  /* Which message's action bar is currently showing the six instead of its
     buttons. One bar with two faces rather than a second floating row: the
     stage is a locked viewport and every new floating thing on it is another
     element that can land under a keyboard. */
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<Message | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<NonNullable<typeof fetchInfo>>> | null>(null);
  const [infoErr, setInfoErr] = useState<string | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* THE LIST SCROLLS ITSELF.
     scrollIntoView asks EVERY scrollable ancestor to move, and on a phone the
     outermost one is the page beneath a fixed room — so a message arriving
     could slide the whole screen while it was politely bringing the newest
     bubble into view. This moves one box, and it is this one. */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  /* Bring one message into view and mark it, briefly. `el.scrollIntoView`
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

  /* A bar that is showing the six belongs to the message it opened on. When
     the thread changes underneath it — a message arrives, one is deleted — the
     row it was anchored to may not be where it was, so it closes rather than
     hovering over whatever moved into its place. */
  useEffect(() => { setReactFor(null); }, [messages.length]);

  /* INFO IS FETCHED WHEN IT IS ASKED FOR, never alongside the thread: it is
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

  const doDelete = async (m: Message, scope: 'ME' | 'EVERYONE') => {
    setConfirmFor(null);
    if (scope === 'ME') {
      // Collapse smoothly, then let the parent drop it from the list.
      setCollapsing((s) => new Set(s).add(m.id));
      window.setTimeout(() => { void onDelete?.(m.id, scope); }, 220); // --dur-base
    } else {
      await onDelete?.(m.id, scope); // tombstones in place — no collapse
    }
  };

  const startEdit = (m: Message) => { setEditingId(m.id); setEditText(m.body); setTouchOpen(null); };
  const saveEdit = async (m: Message) => {
    const next = editText.trim();
    setEditingId(null);
    if (next && next !== m.body) await onEdit?.(m.id, next);
  };

  const at = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /* The mode is derived, never stored. `onSelect` is in the condition too, so a
     caller that passes ids without a handler gets a thread that reads normally
     rather than one whose every tap does nothing. */
  const selecting = Boolean(onSelect && selectedIds && selectedIds.size > 0);

  return (
    <div className="csmsgs" ref={box}>
      <style>{CSS}</style>
      {messages.map((m, i) => {
        const mine = m.senderId === currentUserId;
        const deleted = Boolean(m.deleted);
        const isCollapsing = collapsing.has(m.id);
        const picked = Boolean(selectedIds?.has(m.id));
        /* A tombstone cannot be picked: forwarding it would send "this message
           was deleted" to somebody, and deleting it again is a no-op. */
        const pickable = selecting && !deleted;
        const isPinned = Boolean(pinnedId && pinnedId === m.id);
        /* At most one, by construction on the server — so this is a find, not a
           filter, and the picker can light the one you already chose. */
        const myReaction = currentUserId
          ? (m.reactions ?? []).find((r) => r.userIds.includes(currentUserId))?.emoji ?? null
          : null;
        const canEdit = mine && !deleted && Boolean(m.body) && withinWindow(m) && Boolean(onEdit);
        /* THE ATTRIBUTION LINE PRINTS ONCE PER RUN. Four messages from one
           person do not need the name and the clock four times — that is the
           thing that makes a long thread look like a form. */
        const prev = messages[i - 1];
        const opens = !prev || prev.senderId !== m.senderId;
        return (
          <div key={m.id} style={{ display: 'contents' }}>
            {opens && (
              <div className={mine ? 'csatt me' : 'csatt'}>
                {mine
                  ? <><i>{at(m.createdAt)}</i><b>You</b></>
                  : <><b>{peerName ?? 'Them'}</b><i>{at(m.createdAt)}</i></>}
              </div>
            )}
            <div
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
              {!deleted && !selecting && onDelete && (
                <div className="tc-msg-actions" style={mine ? { right: 0 } : { left: 0 }}>
                  {/* THE BAR HAS TWO FACES. Asked for the six, it shows the
                      six and nothing else — there is no room on a phone for a
                      picker beside eight other controls, and a second floating
                      row on a locked viewport is a thing that lands under a
                      keyboard. Choosing one, or tapping away, puts it back. */}
                  {onReact && reactFor === m.id ? (
                    <>
                      {REACTIONS.map((e) => (
                        <button key={e} type="button" className="tc-emoji" title={`React ${e}`}
                          aria-label={`React with ${e}`}
                          onClick={() => { onReact(m, myReaction === e ? null : e); setReactFor(null); setTouchOpen(null); }}>
                          <span style={myReaction === e ? { filter: 'none' } : undefined}>{e}</span>
                        </button>
                      ))}
                      <button type="button" aria-label="Close reactions" onClick={() => setReactFor(null)}>✕</button>
                    </>
                  ) : (
                  <>
                  {onReact && <button type="button" title="React" onClick={() => setReactFor(m.id)}>☺ React</button>}
                  {onReply && <button type="button" title="Reply" onClick={() => { onReply(m); setTouchOpen(null); }}>↩ Reply</button>}
                  {/* THE WAY IN. No new gesture: this bar is already what a
                      long-press opens and what a hover shows, and a button in
                      it is also the only version of "select" that a mouse can
                      find. */}
                  {onSelect && !deleted && (
                    <button type="button" title="Select messages"
                      onClick={() => { onSelect(m); setTouchOpen(null); }}>☑ Select</button>
                  )}
                  {onStar && !deleted && (
                    <button type="button" title={m.starred ? 'Remove star' : 'Keep this message'}
                      onClick={() => { onStar(m, !m.starred); setTouchOpen(null); }}>
                      {m.starred ? '★ Kept' : '☆ Keep'}
                    </button>
                  )}
                  {onForward && !deleted && <button type="button" title="Forward" onClick={() => { onForward(m); setTouchOpen(null); }}>⤳ Forward</button>}
                  {m.body && <button type="button" title="Copy" onClick={() => { void navigator.clipboard?.writeText(m.body); setTouchOpen(null); }}>⧉ Copy</button>}
                  {canEdit && <button type="button" title="Edit" onClick={() => startEdit(m)}>✎ Edit</button>}
                  {mine && fetchInfo && <button type="button" title="Message info" onClick={() => { setInfoFor(m); setTouchOpen(null); }}>ⓘ Info</button>}
                  {onPin && (
                    <button type="button" title={isPinned ? 'Unpin' : 'Pin'}
                      onClick={() => { onPin(m, !isPinned); setTouchOpen(null); }}>
                      {isPinned ? '📌 Unpin' : '📌 Pin'}
                    </button>
                  )}
                  <button type="button" className="danger" title="Delete" onClick={() => { setConfirmFor(m); setTouchOpen(null); }}>🗑 Delete</button>
                  </>
                  )}
                </div>
              )}

              {/* single in-flow child: the grid row that collapses 1fr -> 0fr */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {deleted ? (
                  <div className="csb gone">🚫 This message was deleted</div>
                ) : editingId === m.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input autoFocus aria-label="Edit your message" value={editText} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(m); if (e.key === 'Escape') setEditingId(null); }}
                      className="csb" style={{ minWidth: 240, boxShadow: 'var(--soft-in)' }} />
                    <button type="button" className="cstab on" onClick={() => void saveEdit(m)}>Save</button>
                    <button type="button" className="cstab" aria-label="Cancel editing" onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <>
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
                    {m.body && <div className={mine ? 'csb me' : 'csb'}>{m.body}</div>}
                    {(m.media ?? []).map((a, i) => (
                      <div key={a.id} style={{ marginTop: m.body || i ? 6 : 0 }}>
                        <Attachment a={a} mine={mine} />
                      </div>
                    ))}
                    {m.share && <div style={{ marginTop: m.body || (m.media ?? []).length ? 6 : 0 }}><ShareCardView card={m.share} compact clickable /></div>}
                  </>
                )}

                {/* WHAT THE ROOM ANSWERED. Under the bubble rather than over
                    its corner: a chip laid on the bubble covers the last line
                    of a short message, and every count in this app that hides
                    a word has been a bug report. Tapping your own chip clears
                    it, which is the only gesture people try. */}
                {!deleted && (m.reactions ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4,
                    justifyContent: mine ? 'flex-end' : 'flex-start', maxWidth: 260 }}>
                    {(m.reactions ?? []).map((r) => {
                      const isMine = Boolean(currentUserId && r.userIds.includes(currentUserId));
                      return (
                        <button key={r.emoji} type="button"
                          className={isMine ? 'tc-react mine' : 'tc-react'}
                          aria-pressed={isMine}
                          aria-label={`${r.emoji} · ${r.userIds.length}${isMine ? ', including you — tap to remove yours' : ''}`}
                          onClick={() => onReact?.(m, isMine ? null : r.emoji)}
                          disabled={!onReact}>
                          <span aria-hidden>{r.emoji}</span>
                          <span aria-hidden>{r.userIds.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Only the facts the attribution line does not already carry:
                    an edit, and how far a message of yours has got. */}
                {(m.edited || m.starred || (mine && !deleted && m.status)) && !deleted && (
                  <div style={{ fontSize: 10.5, marginTop: 3, color: 'var(--on-stage-faint)' }}>
                    {m.starred && <span aria-label="You kept this message" style={{ marginRight: 4 }}>★</span>}
                    {m.edited && <span style={{ marginRight: 4 }}>edited</span>}
                    {mine && <Ticks status={m.status} />}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {typing && <div className="csatt"><i>{peerName ?? 'They'} is typing…</i></div>}

      {infoFor && (
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
        <ConfirmDelete
          mine={confirmFor.senderId === currentUserId}
          canEveryone={confirmFor.senderId === currentUserId && !confirmFor.deleted && withinWindow(confirmFor)}
          onCancel={() => setConfirmFor(null)}
          onDelete={(scope) => void doDelete(confirmFor, scope)}
        />
      )}
    </div>
  );
}
