import { useEffect } from 'react';

/**
 * ONE COUNTED LOCK FOR THE PAGE BEHIND AN OVERLAY.
 *
 * Three surfaces each wrote their own `document.body.style.overflow = 'hidden'`
 * and every copy had the same three holes: iOS Safari keeps touch-scrolling a
 * body whose overflow is hidden; restoring to `''` forgets what was there and
 * loses the scroll position; and two overlays open at once (the post reader
 * over the reels player) meant whichever unmounted first unlocked the page
 * under the one still showing.
 *
 * `position: fixed` on body is the lock iOS actually honours. The count makes
 * nesting safe — the page unlocks when the LAST holder lets go — and the saved
 * scroll offset is put back so closing an overlay does not teleport the page
 * to the top. Scrollbar width is compensated on desktops so nothing shifts.
 */
let locks = 0;
let savedY = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const b = document.body;
    if (locks++ === 0) {
      savedY = window.scrollY;
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      b.style.position = 'fixed';
      b.style.top = `-${savedY}px`;
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
      if (scrollbar > 0) b.style.paddingRight = `${scrollbar}px`;
    }
    return () => {
      if (--locks === 0) {
        b.style.position = ''; b.style.top = ''; b.style.left = '';
        b.style.right = ''; b.style.width = ''; b.style.paddingRight = '';
        window.scrollTo(0, savedY);
      }
    };
  }, [active]);
}
