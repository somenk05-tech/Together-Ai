import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * ── ONE MESSAGE, LIFTED OUT OF THE ROOM ─────────────────────────────────────
 *
 * Press and hold a message and it detaches: the room goes dark behind it, the
 * message stays exactly where it was, a row of reactions floats above it and a
 * short menu of what you can do sits underneath. Tap anywhere else and it all
 * goes away.
 *
 * WHAT THIS REPLACES, AND WHY. The actions used to be a pill absolutely
 * positioned inside the message row — shown on hover, and on a phone by a
 * long-press. Nine buttons in a row is wider than a phone, so it overflowed
 * the row it belonged to, sat across the messages either side of it, and
 * SCROLLED WITH THE THREAD, because it was part of it. The owner's word for
 * what that produced was "a persistent scrolling action bar", and that is a
 * fair description of a bar that lives inside a scroll container.
 *
 * ── WHY A COPY OF THE MESSAGE AND NOT THE MESSAGE ITSELF ───────────────────
 *
 * Raising the real row above a full-screen scrim means winning a z-index
 * argument against every ancestor between the bubble and the document — and
 * `.csmsgs` is a scroll container inside `.cstage`, which is `overflow:
 * hidden` with a radius. Any of those growing a `transform` later (a slide-in,
 * a reduced-motion tweak) would silently start clipping the raised message,
 * and the failure would be a message that vanishes when you press it.
 *
 * So the overlay draws its own copy, from the same `MessageBody` the thread
 * renders, at the coordinates the real one occupies. The copy is inert —
 * `pointer-events: none`, no handlers — because it is a picture of a message,
 * and a second set of live reaction chips is two places to tap for one fact.
 *
 * ── POSITION IS COMPUTED, NEVER GUESSED ────────────────────────────────────
 *
 * The whole group — reactions, message, menu — is laid out from the pressed
 * row's rect and then pushed, as one, into the safe area. It only moves when
 * it has to: a message in the middle of the screen does not shift a pixel,
 * which is the thing that makes this feel like the message rose rather than a
 * dialog opened.
 */

/** The quick row. Seven, and the same seven the API's enum accepts — see
 *  REACTIONS in MessageThread, which is the copy this file reads. */
const RAIL_H = 52;
const GAP = 10;
const EDGE = 12;

export interface SpotlightAction {
  key: string;
  label: string;
  glyph: string;
  /** Delete, and nothing else so far. Drawn in the danger ink. */
  destructive?: boolean;
  /** "More…", and nothing else so far: it grows the menu it is in rather than
   *  doing something to the message, so choosing it must not dismiss. */
  keepOpen?: boolean;
  onSelect: () => void;
}

export function MessageSpotlight({
  rect, mine, reactions, myReaction, onReact, onMore, moreOpen, actions, body, onDismiss,
}: {
  /** Where the real message is, in viewport coordinates, at the moment of the press. */
  rect: DOMRect;
  mine: boolean;
  reactions: readonly string[];
  myReaction: string | null;
  onReact?: (emoji: string | null) => void;
  /** Opens the wider tray. Absent when the caller has no more to offer. */
  onMore?: () => void;
  moreOpen?: boolean;
  actions: SpotlightAction[];
  /** The inert copy of the pressed message. */
  body: React.ReactNode;
  onDismiss: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuH, setMenuH] = useState(0);
  const [shown, setShown] = useState(false);

  /* Measured rather than counted. The menu's height depends on which actions
     this particular message offers — a tombstone has two, your own recent one
     has seven — and on the reader's own font size, which no arithmetic here
     is entitled to assume. */
  useLayoutEffect(() => {
    if (menuRef.current) setMenuH(menuRef.current.offsetHeight);
  }, [actions.length, moreOpen]);

  /* One frame late, so the transform has something to animate FROM. Setting
     the end state in the same paint as the mount is how a transition silently
     becomes a jump. */
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /* ESCAPE, AND THE PHONE'S BACK GESTURE.
     A history entry is the only hook Android's back button offers a web app,
     so opening pushes one and dismissing pops it — which makes back close the
     menu instead of leaving the conversation, exactly as the owner asked.
     `owned` is what stops the pop firing twice: when back is what closed us,
     the entry is already gone and calling `history.back()` again would take
     the citizen out of the chat. */
  const owned = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    const onPop = () => { owned.current = false; onDismiss(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    try {
      window.history.pushState({ tcSpotlight: 1 }, '');
      owned.current = true;
    } catch {
      /* A browser that refuses the entry (rate-limited pushState) still gets
         the scrim and Escape. Losing the back gesture is not worth an error. */
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      if (owned.current) { owned.current = false; window.history.back(); }
    };
    // onDismiss is stable for the life of the overlay — the thread recreates
    // this component per selection, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── THE LAYOUT ─────────────────────────────────────────────────────────
     TWO ARRANGEMENTS, AND THE POINT OF THE SECOND ONE IS THAT THE MESSAGE
     MOVES AS LITTLE AS POSSIBLE.

       below (the default)   rail · message · menu
       above                 menu · rail · message

     A six-item menu is around 340px on a phone. Keeping it under the message
     means the LAST message in a thread — the one people press most — has to
     travel most of the height of the screen to make room, and a message that
     leaps across the screen when you touch it does not read as the message you
     touched. Putting the menu above instead leaves that message almost exactly
     where it was, which is what WhatsApp does and what the owner asked for:
     "if the selected message is near the bottom, move the menu above it".

     A message too tall for any of this is capped rather than allowed to push
     the menu off the edge — the cap is where the copy stops being a full
     picture of the message, and it is the honest place to lose something. */
  const vh = window.innerHeight;
  const top = EDGE;
  const bottom = vh - EDGE;
  const room = bottom - top;

  const wanted = RAIL_H + GAP + rect.height + GAP + menuH;
  const cloneH = wanted > room ? Math.max(80, room - RAIL_H - GAP - GAP - menuH) : rect.height;

  /* Below, unless there is no room below and there IS room above. Measured
     against where the message actually is, not against the middle of the
     screen: "near the bottom" is a fact about this message, not a region. */
  const roomBelow = bottom - (rect.top + cloneH);
  const roomAbove = rect.top - top;
  const menuAbove = roomBelow < menuH + GAP && roomAbove >= menuH + GAP + RAIL_H + GAP;

  let cloneTop = rect.top;
  if (menuAbove) {
    /* Everything hangs above, so the only clamp that can bite is the top one. */
    const needed = menuH + GAP + RAIL_H + GAP;
    if (cloneTop - needed < top) cloneTop = top + needed;
    if (cloneTop + cloneH > bottom) cloneTop = bottom - cloneH;
  } else {
    if (cloneTop - GAP - RAIL_H < top) cloneTop = top + RAIL_H + GAP;
    if (cloneTop + cloneH + GAP + menuH > bottom) {
      cloneTop = Math.max(top + RAIL_H + GAP, bottom - menuH - GAP - cloneH);
    }
  }

  const railTop = menuAbove ? cloneTop - GAP - RAIL_H : cloneTop - GAP - RAIL_H;
  const menuTop = menuAbove ? railTop - GAP - menuH : cloneTop + cloneH + GAP;

  /* The group hangs off the side the message is on, so it reads as belonging
     to that bubble — and is pulled back inside the frame if the bubble itself
     is near an edge. */
  const side = mine
    ? { right: Math.max(EDGE, window.innerWidth - rect.right) }
    : { left: Math.max(EDGE, rect.left) };

  const ease = { transition: 'transform var(--dur-base) var(--ease-out), opacity var(--dur-fast) var(--ease-out)' };
  const rise = (delay = 0) => ({
    ...ease,
    transitionDelay: `${delay}ms`,
    opacity: shown ? 1 : 0,
    transform: shown ? 'scale(1) translateY(0)' : 'scale(.94) translateY(6px)',
  });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Message actions"
      style={{ position: 'fixed', inset: 0, zIndex: 9400 }}
    >
      {/* THE ROOM, DIMMED BUT STILL THERE. The owner asked that the
          conversation stay visible behind the overlay, which is also what
          makes this read as a message being lifted rather than a screen
          being replaced. */}
      {/* THE DISMISS TARGET IS THE SCRIM ITSELF, not the layer around it.
          Putting `onPointerDown` on the container and testing
          `e.target === e.currentTarget` looks equivalent and is not: this scrim
          covers the container, so the press always lands on the scrim and the
          test never passed. Tapping away did nothing, which is the one thing
          every citizen tries first. */}
      <div
        aria-hidden
        onPointerDown={onDismiss}
        style={{
          position: 'absolute', inset: 0, background: 'var(--scrim-deep)',
          opacity: shown ? 1 : 0, transition: 'opacity var(--dur-base) var(--ease-out)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* ── THE REACTION RAIL ─────────────────────────────────────────── */}
      {onReact && (
        <div
          style={{
            position: 'absolute', top: railTop, ...side, height: RAIL_H,
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '0 6px', borderRadius: 'var(--r-full)',
            background: 'var(--stage-solid)', border: '1px solid var(--stage-line)',
            boxShadow: 'var(--e3)', maxWidth: `calc(100vw - ${EDGE * 2}px)`,
            transformOrigin: mine ? 'right bottom' : 'left bottom',
            ...rise(),
          }}
        >
          {reactions.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={myReaction === e ? `Remove your ${e}` : `React with ${e}`}
              aria-pressed={myReaction === e}
              onClick={() => { onReact(myReaction === e ? null : e); onDismiss(); }}
              style={{
                border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1,
                width: 40, height: 40, borderRadius: 'var(--r-full)', padding: 0,
                background: myReaction === e ? 'var(--stage-tile)' : 'none',
              }}
            >
              <span aria-hidden>{e}</span>
            </button>
          ))}
          {onMore && (
            <button
              type="button"
              aria-label="More reactions"
              aria-expanded={Boolean(moreOpen)}
              onClick={onMore}
              style={{
                border: 'none', cursor: 'pointer', width: 40, height: 40, borderRadius: 'var(--r-full)',
                background: 'var(--stage-tile)', color: 'var(--on-stage-soft)',
                fontSize: 20, lineHeight: 1, padding: 0, fontFamily: 'inherit',
              }}
            >
              <span aria-hidden>{moreOpen ? '×' : '+'}</span>
            </button>
          )}
        </div>
      )}

      {/* ── THE MESSAGE, AS A PICTURE OF ITSELF ───────────────────────── */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: cloneTop, ...side,
          width: rect.width, maxHeight: cloneH, overflow: 'hidden',
          pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start',
          ...rise(),
          transformOrigin: mine ? 'right center' : 'left center',
        }}
      >
        {body}
      </div>

      {/* ── THE MENU ──────────────────────────────────────────────────── */}
      <div
        ref={menuRef}
        style={{
          position: 'absolute', top: menuTop, ...side,
          minWidth: 208, maxWidth: `calc(100vw - ${EDGE * 2}px)`,
          borderRadius: 'var(--r-3)', overflow: 'hidden',
          background: 'var(--stage-solid)', border: '1px solid var(--stage-line)',
          boxShadow: 'var(--e3)',
          transformOrigin: mine ? (menuAbove ? 'right bottom' : 'right top') : (menuAbove ? 'left bottom' : 'left top'),
          ...rise(20),
        }}
      >
        {actions.map((a, i) => (
          <button
            key={a.key}
            type="button"
            onClick={() => { a.onSelect(); if (!a.keepOpen) onDismiss(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              font: 'inherit', fontSize: 15, textAlign: 'left',
              color: a.destructive ? 'var(--danger-ink)' : 'var(--on-stage)',
              borderTop: i ? '1px solid var(--stage-line)' : 'none',
              minHeight: 44,
            }}
          >
            <span aria-hidden style={{ fontSize: 16, width: 20, textAlign: 'center', flex: 'none' }}>{a.glyph}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
