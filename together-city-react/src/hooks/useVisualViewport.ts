import { useEffect } from 'react';

/**
 * WHAT THE CITIZEN CAN ACTUALLY SEE, AS TWO CSS VARIABLES.
 *
 * `100dvh` is the WINDOW. iOS leaves the window exactly as tall when the
 * keyboard opens — the page simply scrolls underneath it — so anything sized
 * to `vh` keeps a few hundred pixels that are now behind a keyboard, and
 * anything `position: fixed` is fixed to the LAYOUT viewport, which iOS has
 * just scrolled up to reveal the focused input.
 *
 * `visualViewport` is the part still on screen. `--tc-vvh` is its height and
 * `--tc-vvt` is where it BEGINS; offset by the same number, a fixed surface
 * does not move.
 *
 * THIS WAS THE SECOND HALF OF `useChatRoom` AND IS NOW ITS OWN THING. That
 * hook does three jobs — flag the document immersive, measure the visible
 * part, refuse a pinch — and its own comment lists them separately. Mira's
 * floating panel needs exactly the middle one: it is a panel OVER a page, so
 * hiding the city's header and locking the scale would be taking a room's
 * treatment and giving it to a card. Splitting at a seam the file already
 * described costs nothing and stops the third caller writing this again.
 *
 * Phones only, like the hook it came out of. A desk has no keyboard that eats
 * half the screen.
 */
export function useVisualViewport(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 899px)').matches) return;

    const root = document.documentElement;
    const vv = window.visualViewport;
    const sync = () => {
      root.style.setProperty('--tc-vvh', `${vv ? vv.height : window.innerHeight}px`);
      root.style.setProperty('--tc-vvt', `${vv ? vv.offsetTop : 0}px`);
    };
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);

    return () => {
      root.style.removeProperty('--tc-vvh');
      root.style.removeProperty('--tc-vvt');
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, [active]);
}
