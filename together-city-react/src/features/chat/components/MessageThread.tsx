import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '@/types';
import { MessageBody } from './MessageBody';
import { MessageSpotlight, type SpotlightAction } from './MessageSpotlight';
import { HOLD_MS, MORE_REACTIONS, REACTIONS, SLOP, withinWindow } from './messageRules';

/** The fallback under a missing face: at most two letters, from whatever the
 *  room is called. The same shape ConversationList draws on the rows outside,
 *  so a chat with no picture reads the same in both places. */
const initials = (name?: string): string =>
  (name ?? 'Them').split(/[\s·]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const CSS = `
.tc-msg-row{position:relative}
/* WHAT USED TO BE HERE: .tc-msg-actions, a nine-button pill positioned
   inside this row. It was wider than a phone, so it overflowed onto the
   messages either side of it, and it scrolled with the thread because it was
   part of the thread. It is now MessageSpotlight — a fixed overlay anchored to
   the pressed message, outside this scroll container.

   THE CHEVRON IS WHAT A MOUSE HAS INSTEAD OF A LONG PRESS. A pointer cannot
   press and hold, and right-click alone is not discoverable, so a single small
   button appears on hover and opens the same overlay. It is gated on a device
   that actually has a pointer — a phone must never see it, because a phone has
   the gesture. */
@media (hover:hover) and (pointer:fine){
  .tc-msg-more{opacity:0;pointer-events:none;transition:opacity var(--dur-fast) var(--ease);position:absolute;top:2px;width:26px;height:26px;border-radius:999px;border:1px solid var(--stage-line);background:var(--stage-solid);color:var(--on-stage-soft);cursor:pointer;font-family:inherit;font-size:13px;line-height:1;padding:0;z-index:5}
  .tc-msg-row:hover .tc-msg-more,.tc-msg-more:focus-visible{opacity:1;pointer-events:auto}
}
@media not all and (hover:hover){ .tc-msg-more{display:none} }
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
`;

/**
 * Shared with the bulk bar, for the same reason `withinWindow` is. The wording
 * of a delete is the safety-critical part of it — what it promises about other
 * people's copies — and a bulk delete that invented its own phrasing is how the
 * two drift apart.
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

export function MessageThread({ messages, currentUserId, typing, peerName, peerPhoto, onDelete, onEdit, onReply, onForward, onStar, onJump, fetchInfo, jumpToId, selectedIds, onSelect, onReact, onPin, onAnswerLiveSnap, pinnedId }: {
  messages: Message[]; currentUserId?: string; typing?: boolean;
  /** Whose thread this is, for the attribution line above each run. */
  peerName?: string;
  /** Their face, if the room has one — the SAME picture the conversation list
   *  outside is showing, handed down rather than fetched again: the roster is
   *  one cached call for the whole screen and a second one here would be the
   *  same data:URL downloaded twice. Null is not a failure, it is the ordinary
   *  case, and the initials below are what it draws instead. */
  peerPhoto?: string | null;
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
  /** Answering a "send me a Live Snap": the page opens the camera. Forwarded
   *  to MessageBody, which draws the card that offers it. */
  onAnswerLiveSnap?: () => void;
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
  /* THE PRESSED MESSAGE, AND WHERE IT WAS WHEN IT WAS PRESSED.
     The rect is captured at press time and not recomputed: the overlay draws a
     copy at those coordinates, and the thread underneath is frozen for as long
     as it is up (the scroll listener below closes on any movement), so a rect
     that went stale would mean the copy had drifted off the message it is a
     copy of. */
  const [spot, setSpot] = useState<{ m: Message; rect: DOMRect } | null>(null);
  /** Whether the rail is showing the tray. Resets with each press. */
  const [tray, setTray] = useState(false);
  /** The overflow half of the menu — Pin, Edit, Info, Select — behind "More". */
  const [more, setMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  /* THE LAST JUMP THIS COMPONENT ACTUALLY MADE. The jump effect below has
     `messages.length` in its deps and nothing cleared `jumpToId`, so every new
     message re-ran it: the reader was dragged back to a message they had
     finished with, outline flashing, and it WON, because it runs after the
     bottom-scroll effect above. The page clears the prop after the jump; this
     is the same fact held here, so the component is right on its own terms. */
  const jumped = useRef<string | null>(null);
  const [infoFor, setInfoFor] = useState<Message | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<NonNullable<typeof fetchInfo>>> | null>(null);
  const [infoErr, setInfoErr] = useState<string | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* WHERE THE READER HAD THIS BOX, AS OF THE LAST TIME ANYTHING LOOKED.
     `h` and `top` are what the scroll anchoring below subtracts against; `first`
     is how a PREPENDED page of older messages is told apart from a new message
     at the bottom, since both only ever grew `messages.length`. */
  const seen = useRef({ len: 0, first: undefined as string | undefined, top: 0, h: 0, atBottom: true });
  /* A SMOOTH SCROLL IS STILL MOVING AFTER THE COMMIT THAT STARTED IT, and it
     fires scroll events the whole way down. Read literally, those events say
     the reader is somewhere in the middle of the thread — so the glide's own
     movement was being mistaken for a reader who had scrolled away, and the
     next message would then decline to chase. This is the window in which the
     box's position is the browser's business and not the reader's. */
  const chaseUntil = useRef(0);
  const gliding = () => Date.now() < chaseUntil.current;

  /* Kept true between commits as well as across them: a message can arrive
     seconds after the reader last scrolled. */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const note = () => {
      if (gliding()) return;
      seen.current.top = el.scrollTop;
      seen.current.h = el.scrollHeight;
      seen.current.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener('scroll', note, { passive: true });
    return () => el.removeEventListener('scroll', note);
  }, []);

  /* THE LIST SCROLLS ITSELF — BUT ONLY TOWARDS THE READER'S OWN INTENT.
     scrollIntoView asks EVERY scrollable ancestor to move, and on a phone the
     outermost one is the page beneath a fixed room — so a message arriving
     could slide the whole screen while it was politely bringing the newest
     bubble into view. This moves one box, and it is this one.

     TWO THINGS THIS USED TO GET WRONG, both because it fired on
     `messages.length` and did nothing else with it.

     ONE — "Load earlier messages" appeared to do nothing. `useMessages`
     PREPENDS the older page, so the length grew, so this yanked the box back
     to the newest message: the button loaded thirty messages and showed you
     none of them. The fix is arithmetic, not a flag — everything above the
     reader just got taller by `scrollHeight - h`, so add exactly that to
     `scrollTop` and the message they were reading has not moved a pixel.

     TWO — a reader who had scrolled up to read something was dragged to the
     bottom by somebody else's incoming message. So the bottom is chased only
     when the reader was already near it. */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const was = seen.current;
    const first = messages[0]?.id;
    /* A PREPEND, and not merely a longer list. The message the reader was on
       has to still BE here: opening a different conversation also arrives as
       "longer, with a new first message", and anchoring to a scroll height
       measured in another thread would land nowhere in this one. */
    const prepended = messages.length > was.len && was.first !== undefined
      && first !== was.first && messages.some((m) => m.id === was.first);
    if (prepended) { el.scrollTop = was.top + (el.scrollHeight - was.h); return; }
    /* A DIFFERENT THREAD ARRIVES AS "LONGER, WITH A NEW FIRST MESSAGE" TOO, and
       the reader's position in the last one means nothing here. Land at the
       bottom, immediately — a conversation opens at its newest message. */
    const switched = was.first !== undefined && first !== was.first
      && !messages.some((m) => m.id === was.first);
    /* AND YOUR OWN MESSAGE ALWAYS WINS. "Only chase when the reader was near
       the bottom" is right for somebody else's message and wrong for yours:
       pressing Send while scrolled up used to append the message off-screen and
       leave the thread exactly where it was, which reads as not having sent. */
    const last = messages[messages.length - 1];
    const mineArrived = messages.length > was.len && last?.senderId === currentUserId;
    if (switched) { el.scrollTop = el.scrollHeight; return; }
    if (!was.atBottom && !mineArrived) return;
    chaseUntil.current = Date.now() + 600;
    seen.current.atBottom = true;
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
  }, [messages, typing, currentUserId]);

  /* And the box as it now stands, recorded for the NEXT commit to compare
     against. No dependency array on purpose: every render must leave this
     accurate, because the effect above reads it as "where the reader was
     before this happened". Declared after that effect so it runs after it. */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    seen.current = {
      len: messages.length,
      first: messages[0]?.id,
      top: el.scrollTop,
      h: el.scrollHeight,
      /* A smooth scroll started microseconds ago has not arrived, so the box
         still measures as "not at the bottom" while it is on its way there —
         and a second message landing mid-glide would be read as a reader who
         had scrolled away. */
      atBottom: el.scrollHeight - el.scrollTop - el.clientHeight < 120 || gliding(),
    };
  });

  /* Bring one message into view and mark it, briefly. `el.scrollIntoView`
     would ask every scrollable ancestor to move — which on a phone is the page
     under a fixed room, the exact bug the viewport-lock commit removed. So the
     box scrolls itself, by offset, and jumpToId is the whole reason this
     component takes a prop rather than owning a ref somebody outside reaches
     into. */
  useEffect(() => {
    /* Cleared when the prop goes back to null, which is how the page asks for
       the SAME message twice — tapping one search hit, scrolling off, tapping
       it again. Without this, `jumped` was a one-way latch and the second tap
       did nothing at all. */
    if (!jumpToId) { jumped.current = null; return; }
    if (jumped.current === jumpToId) return;
    const box0 = box.current;
    // `window.CSS`, not `CSS`: this module declares its own `const CSS` for the
    // style block a few lines up, which shadows the global and turns
    // CSS.escape into a property of a string. tsc caught it; nothing else would.
    const el = box0?.querySelector<HTMLElement>(`[data-mid="${window.CSS.escape(jumpToId)}"]`);
    // Not loaded yet — `messages.length` stays in the deps so a page arriving
    // later still honours the jump. `jumped` is only set once it is HONOURED.
    if (!box0 || !el) return;
    jumped.current = jumpToId;
    box0.scrollTo({ top: Math.max(0, el.offsetTop - 48), behavior: 'smooth' });
    setFlashId(jumpToId);
    const t = window.setTimeout(() => setFlashId(null), 1600);
    return () => window.clearTimeout(t);
  }, [jumpToId, messages.length]);

  /* AN OVERLAY BELONGS TO THE MESSAGE IT OPENED ON, AND TO WHERE THAT MESSAGE
     WAS. When the thread changes underneath it — a message arrives and the box
     scrolls itself to the bottom, one is deleted — the row it was anchored to
     is no longer under the copy, so it closes rather than hovering over
     whatever moved into its place. */
  useEffect(() => { setSpot(null); }, [messages.length]);

  /* And the same for a scroll. A citizen who starts scrolling has stopped
     looking at the message they pressed; leaving a copy pinned to coordinates
     the original has left is the one way this overlay can lie. */
  useEffect(() => {
    if (!spot) return;
    const el = box.current;
    if (!el) return;
    const close = () => setSpot(null);
    el.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => { el.removeEventListener('scroll', close); window.removeEventListener('resize', close); };
  }, [spot]);

  /* One press, one set of choices. Opening on a different message must not
     inherit the tray the last one was left showing. */
  useEffect(() => { setTray(false); setMore(false); }, [spot?.m.id]);

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

  /* WHERE THE MESSAGE IS, MEASURED FROM THE ROW ITSELF. The overlay is a
     fixed layer over the viewport, so it needs viewport coordinates — and the
     row is the right element to measure rather than the bubble inside it,
     because the row is what carries the alignment that decides which side the
     rail and the menu hang off. */
  const open = (m: Message, el: HTMLElement | null) => {
    if (!el) return;
    setSpot({ m, rect: el.getBoundingClientRect() });
  };

  const startEdit = (m: Message) => { setEditingId(m.id); setEditText(m.body); setSpot(null); };
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
                  : <>
                      {/* THEIR FACE, ONCE PER RUN. `aria-hidden` because the
                          name is right beside it and a reader that announced
                          both would say the person twice. */}
                      <span className="csav csface" aria-hidden>
                        {peerPhoto
                          ? <img className="no-case" src={peerPhoto} alt="" loading="lazy" />
                          : initials(peerName)}
                      </span>
                      <b>{peerName ?? 'Them'}</b><i>{at(m.createdAt)}</i>
                    </>}
              </div>
            )}
            <div
              data-mid={m.id}
              className={`tc-msg-row tc-msg-collapse${isCollapsing ? ' tc-msg-collapsing' : ''}`}
              role={pickable ? 'button' : undefined}
              tabIndex={pickable ? 0 : undefined}
              aria-pressed={pickable ? picked : undefined}
              aria-label={pickable ? (picked ? 'Deselect this message' : 'Select this message') : undefined}
              /* THE MEASURE IS THE STYLESHEET'S, AND `100%` WAS TAKING IT AWAY.
                 An inline style outranks every rule in the cascade, so
                 `maxWidth: '100%'` beat `.csmsgs > div > .tc-msg-row`'s
                 `min(66%, 560px)` on a desk AND its 86% on a phone, and every
                 long message — sent or received — ran the full width of the
                 stage. A row that wide cannot read as right-aligned no matter
                 what `align-self` says, which is why the owner's phone showed
                 outgoing bubbles going edge to edge. A share card still states
                 its own 320, because that is a card of a fixed size rather
                 than a measure for prose. */
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', ...(m.share ? { maxWidth: 320 } : null),
                ...(pickable ? { cursor: 'pointer' } : null),
                /* THREE STATES, ONE OUTLINE. Picked is the bright ink; a
                   selectable-but-unpicked row gets a dashed hint, so the mode
                   is legible without a checkbox column that would re-flow every
                   bubble on the stage the moment somebody long-pressed. The
                   search flash keeps the middle tone and yields while picking —
                   two outlines on one row is a row saying two things. */
                ...(pickable
                  ? (picked
                      ? { outline: '2px solid var(--on-stage)', outlineOffset: 4, borderRadius: 'var(--r-2)' }
                      : { outline: '1px dashed var(--on-stage-faint)', outlineOffset: 4, borderRadius: 'var(--r-2)' })
                  : flashId === m.id
                    ? { outline: '2px solid var(--on-stage-faint)', outlineOffset: 4, borderRadius: 'var(--r-2)' }
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
              /* ── PRESS AND HOLD ────────────────────────────────────────
                 Pointer events rather than touch events, so one code path
                 serves a finger, a stylus and a mouse held down. A tombstone
                 has nothing to offer and selection mode has already claimed
                 the tap, so neither arms the timer.

                 A SCROLL IS NOT A PRESS, and telling them apart is the whole
                 reason this is not a naive setTimeout: a citizen flicking the
                 thread has their finger down for well over 450ms. The press is
                 abandoned the moment the finger travels more than SLOP in any
                 direction, which is the number the platform pickers use and
                 large enough to forgive the wobble of holding still. */
              onPointerDown={(e) => {
                if (selecting || deleted) return;
                /* Secondary buttons are the desktop's own gesture — handled by
                   onContextMenu below, which fires without a wait. */
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                const startX = e.clientX, startY = e.clientY;
                const el = e.currentTarget;
                const cancel = () => {
                  if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', cancel);
                  window.removeEventListener('pointercancel', cancel);
                };
                function onMove(ev: PointerEvent) {
                  if (Math.abs(ev.clientX - startX) > SLOP || Math.abs(ev.clientY - startY) > SLOP) cancel();
                }
                window.addEventListener('pointermove', onMove, { passive: true });
                window.addEventListener('pointerup', cancel);
                window.addEventListener('pointercancel', cancel);
                longPress.current = setTimeout(() => {
                  cancel();
                  open(m, el);
                }, HOLD_MS);
              }}
              /* The OS menu is the wrong menu. Suppressing it on a phone also
                 stops the browser's own text-selection callout landing on top
                 of ours; on a desktop, right-click IS the way in. */
              onContextMenu={(e) => {
                if (selecting || deleted) return;
                e.preventDefault();
                open(m, e.currentTarget);
              }}>

              {/* THE MOUSE'S WAY IN. One 26px chevron, on hover only, on a
                  device that has a pointer — see the media query in CSS. A
                  finger never sees it and does not need to: it has the press. */}
              {!deleted && !selecting && (
                <button
                  type="button"
                  className="tc-msg-more"
                  aria-label="Message actions"
                  aria-haspopup="dialog"
                  style={mine ? { right: -32 } : { left: -32 }}
                  onClick={(e) => { e.stopPropagation(); open(m, e.currentTarget.parentElement as HTMLElement); }}
                >
                  <span aria-hidden>⋯</span>
                </button>
              )}

              {/* single in-flow child: the grid row that collapses 1fr -> 0fr */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {editingId === m.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input autoFocus aria-label="Edit your message" value={editText} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(m); if (e.key === 'Escape') setEditingId(null); }}
                      className="csb" style={{ minWidth: 240, boxShadow: 'var(--soft-in)' }} />
                    <button type="button" className="cstab on" onClick={() => void saveEdit(m)}>Save</button>
                    <button type="button" className="cstab" aria-label="Cancel editing" onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <MessageBody m={m} mine={mine} currentUserId={currentUserId} peerName={peerName}
                    onJump={onJump} onReact={onReact} onAnswerLiveSnap={onAnswerLiveSnap} />
                )}
              </div>
            </div>
          </div>
        );
      })}
      {typing && <div className="csatt"><i>{peerName ?? 'They'} is typing…</i></div>}

      {/* ── THE PRESSED MESSAGE ───────────────────────────────────────────
          Built here rather than inside the overlay because only this component
          knows what a given message may be asked to do: a tombstone offers
          nothing, somebody else's message cannot be edited, and "Unpin" is the
          honest word on exactly one message in the room.

          THE ORDER IS THE OWNER'S: Reply, Copy, Forward, Keep, Delete, More.
          Everything else — Pin, Edit, Info, Select — is behind More, because a
          menu long enough to need a scroller is a menu that has stopped being
          faster than the thing it replaced. */}
      {spot && (() => {
        const m = spot.m;
        const mine = m.senderId === currentUserId;
        const isPinned = Boolean(pinnedId && pinnedId === m.id);
        const myReaction = currentUserId
          ? (m.reactions ?? []).find((r) => r.userIds.includes(currentUserId))?.emoji ?? null
          : null;
        const canEdit = mine && Boolean(m.body) && withinWindow(m) && Boolean(onEdit);

        const primary: SpotlightAction[] = [];
        if (onReply) primary.push({ key: 'reply', label: 'Reply', glyph: '↩', onSelect: () => onReply(m) });
        if (m.body) primary.push({ key: 'copy', label: 'Copy', glyph: '⧉', onSelect: () => { void navigator.clipboard?.writeText(m.body); } });
        if (onForward) primary.push({ key: 'forward', label: 'Forward', glyph: '⤳', onSelect: () => onForward(m) });
        if (onStar) primary.push({ key: 'star', label: m.starred ? 'Remove from Kept' : 'Keep', glyph: m.starred ? '★' : '☆', onSelect: () => onStar(m, !m.starred) });

        const overflow: SpotlightAction[] = [];
        if (onPin) overflow.push({ key: 'pin', label: isPinned ? 'Unpin from chat' : 'Pin in chat', glyph: '📌', onSelect: () => onPin(m, !isPinned) });
        if (canEdit) overflow.push({ key: 'edit', label: 'Edit', glyph: '✎', onSelect: () => startEdit(m) });
        if (mine && fetchInfo) overflow.push({ key: 'info', label: 'Message info', glyph: 'ⓘ', onSelect: () => setInfoFor(m) });
        if (onSelect) overflow.push({ key: 'select', label: 'Select messages', glyph: '☑', onSelect: () => onSelect(m) });

        const actions: SpotlightAction[] = [...primary];
        if (onDelete) actions.push({ key: 'delete', label: 'Delete', glyph: '🗑', destructive: true, onSelect: () => setConfirmFor(m) });
        if (overflow.length) {
          if (more) actions.push(...overflow);
          /* `keepOpen` is what stops the overlay dismissing on this one: it
             grows the menu it is in rather than doing anything to the message. */
          else actions.push({ key: 'more', label: 'More…', glyph: '⋯', keepOpen: true, onSelect: () => setMore(true) });
        }

        return (
          <MessageSpotlight
            rect={spot.rect}
            mine={mine}
            body={<MessageBody m={m} mine={mine} currentUserId={currentUserId} peerName={peerName} inert />}
            reactions={tray ? MORE_REACTIONS : REACTIONS}
            myReaction={myReaction}
            onReact={onReact ? (emoji) => onReact(m, emoji) : undefined}
            onMore={onReact ? () => setTray((t) => !t) : undefined}
            moreOpen={tray}
            actions={actions}
            onDismiss={() => setSpot(null)}
          />
        );
      })()}

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
