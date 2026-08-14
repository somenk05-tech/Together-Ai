import { useEffect, useRef, type TouchEvent } from 'react';

/**
 * HOW THE MOBILE DRAWER IS DISMISSED — one file, because it is four things
 * done together and a second copy would still LOOK correct while one of them
 * quietly stopped working (the Fold argument, applied to a drawer).
 *
 * The drawer slid in over the page and there was no way back that was not
 * the burger: a tap on the page behind it went THROUGH to the page — buttons
 * pressed, links followed — while the drawer stayed open on top of the
 * damage. Every drawer on every platform closes on an outside tap; this one
 * now does, and every way out goes through the same `toggleSidebar(false)`
 * the burger and the nav links already use.
 *
 * THE SCRIM IS A SIBLING OF THE DRAWER, NOT A WRAPPER. A tap inside the
 * drawer never touches it, so no handler here has to intercept an event on
 * its way anywhere — the mechanism that cannot misfire beats the one that
 * must be remembered. The guard test bans the interception call by name.
 * It is deliberately TRANSPARENT: dimming the page would be a visual
 * redesign, and the ask was behaviour only.
 *
 * The slide itself is untouched — `.tc-side` has animated its transform
 * over 280ms, both directions, since the drawer was built, and the aside
 * stays mounted through the close, so the exit animates.
 */
export function DrawerScrim({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Escape is the keyboard's outside tap. Subscribed only while open, so a
  // closed drawer costs the page nothing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return <button type="button" className="tc-scrim" aria-label="Close the menu" onClick={onClose} />;
}

/**
 * A leftward swipe on the open drawer closes it — the gesture that opened
 * nothing should still put it away. Decided at touchend, from the whole
 * gesture, so scrolling INSIDE the drawer is never eaten: a vertical drag
 * fails the horizontal-dominance test and nothing happens.
 */
export function useSwipeClose(onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      // Far enough to be meant, and clearly sideways rather than a scroll.
      if (dx < -48 && Math.abs(dx) > Math.abs(dy) * 1.5) onClose();
    },
  };
}
