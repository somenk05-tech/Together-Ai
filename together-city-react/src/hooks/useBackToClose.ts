import { useEffect, useRef } from 'react';

/**
 * ── THE BACK BUTTON CLOSES THE THING ON TOP ─────────────────────────────────
 *
 * Every full-screen surface in Social Life is a portal driven by component
 * state: the reels player, scroll mode, the post reader, and seven modals.
 * None of them pushed a history entry, so the device Back button — which every
 * other full-screen media viewer on the citizen's phone has trained them to
 * press — threw them out of the hub entirely, to whatever route preceded it.
 * The only way out was a small button in the corner that, on an iPhone, is
 * under the notch (30 Aug audit).
 *
 * WHY A PUSHED ENTRY AND NOT A ROUTE. These overlays are not places: they have
 * no URL anybody should be able to type, and giving them one would mean a
 * shared link that opens a modal over a page that has not loaded. A pushed
 * entry with `{ overlay: true }` in its state is the smallest thing that makes
 * Back mean "close this" — it costs one history entry and no routing.
 *
 * IT UNDOES ITS OWN ENTRY. Closing by the on-screen button pops the entry the
 * hook pushed, so a citizen who opens and closes four reels does not have to
 * press Back four times to leave the feed. `popped` guards the double-fire:
 * when Back is what closed it, the entry is already gone and calling `back()`
 * again would eat the page underneath.
 */
export function useBackToClose(open: boolean, close: () => void): void {
  const popped = useRef(false);
  // The latest close handler, without making the effect depend on its identity
  // — an inline arrow would re-push an entry on every render of the parent.
  const onClose = useRef(close);
  onClose.current = close;

  useEffect(() => {
    if (!open) return;
    popped.current = false;
    window.history.pushState({ overlay: true }, '');
    const onPop = () => { popped.current = true; onClose.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed by its own button: take our entry back out so Back still means
      // "leave this page" rather than "undo the overlay you already closed".
      if (!popped.current) window.history.back();
    };
  }, [open]);
}
