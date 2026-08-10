import { useEffect } from 'react';
import { useScaleLock } from './useScaleLock';

/**
 * AN OPEN CONVERSATION IS THE WHOLE SCREEN.
 *
 * This is the city chat's rule, and it stopped being the city chat's the
 * moment a second conversation existed. A thread is a room you are inside,
 * not a panel inside a website: while you are reading one, the city's header
 * and its dock are two rows of chrome charging rent, the page behind is
 * something to fall through, and a keyboard turns the whole arrangement into
 * a scroll position. Wherever the city holds a conversation — Chats, Dating,
 * an enquiry to a business — it holds it the same way, because it is the same
 * act.
 *
 * What the hook does, and the order matters:
 *
 *   · IT FLAGS <html>, because what has to go — the header, the dock, the
 *     floating search — all live outside whichever component called this. The
 *     flag comes off on close and on unmount, so no other screen can inherit
 *     a hidden header.
 *   · IT MEASURES THE VISIBLE PART. 100dvh is the WINDOW, and iOS leaves the
 *     window the same height when the keyboard opens — the page just scrolls
 *     underneath, which is what throws a header off the top of the screen.
 *     visualViewport is the part you can actually see: --tc-vvh is its
 *     height, and --tc-vvt is where it BEGINS, because `position: fixed` is
 *     fixed to the LAYOUT viewport and iOS scrolls that up to reveal a
 *     focused input. Offset by the same number, the room does not move.
 *   · AND IT REFUSES A SCALE, via useScaleLock — a room pinched to 1.4x is a
 *     web page again.
 *
 * Phones only, decided when the conversation opens. A desk shows a list
 * beside a thread and has room for both.
 */
export function useChatRoom(open: boolean) {
  useScaleLock(open);

  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 899px)').matches) return;

    const root = document.documentElement;
    root.classList.add('tc-immersive');

    const vv = window.visualViewport;
    const sync = () => {
      root.style.setProperty('--tc-vvh', `${vv ? vv.height : window.innerHeight}px`);
      root.style.setProperty('--tc-vvt', `${vv ? vv.offsetTop : 0}px`);
    };
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    // wherever the page was scrolled to on the way in, the room starts at the top
    window.scrollTo(0, 0);

    return () => {
      root.classList.remove('tc-immersive');
      root.style.removeProperty('--tc-vvh');
      root.style.removeProperty('--tc-vvt');
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
    };
  }, [open]);
}
