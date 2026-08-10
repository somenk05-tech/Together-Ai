import { useEffect } from 'react';

/**
 * A SCREEN THAT DOES NOT SCALE.
 *
 * Some screens in this city are pages — you read them, you zoom into the one
 * paragraph you care about, and that is a browser doing its job. Others are
 * APPLICATIONS: a thread, a mailbox, a message, the composer. Scaled to 1.4x
 * they come apart — the header slides off, the send key parks under the
 * keyboard, and the citizen has to pinch back before they can type a word.
 * This is what those screens ask for, and only while they are open.
 *
 * Three locks, because no single one holds on both phones —
 *
 *   · THE VIEWPORT TAG, rewritten while the screen is open and put back
 *     EXACTLY as it was found on the way out. Android and the installed app
 *     honour maximum-scale, and because it is restored, every other page in
 *     the city keeps the zoom somebody may genuinely need. That restoration
 *     is the whole reason this is a hook and not a line in index.html.
 *   · TOUCH-ACTION, which the stylesheet hangs on the flag this sets, and
 *     which is what refuses the pinch and the double tap in Chrome.
 *   · THE GESTURE EVENTS, which are what refuse them in SAFARI. iOS has
 *     ignored user-scalable since iOS 10 and answers to nothing else.
 *
 * NONE OF IT TOUCHES SCROLLING. A one-finger drag still goes up, down and
 * sideways; two fingers are a pinch, and there is nothing on these screens
 * that two fingers do.
 *
 * Phones only, decided when the screen opens — the same branch every other
 * phone decision in this app makes, and for the same reason: a desk has a
 * mouse, a keyboard that does not cover half the window, and a citizen who
 * may be zoomed in for their own reasons.
 */
const LOCKED = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';

/* THE LOCK IS COUNTED, NOT TOGGLED.
   Two things on one screen can want it at once — the Chats page wants it for
   the list, and the thread it opens wants it for the room — and they do not
   mount or unmount together. Toggled, whichever released first would put the
   viewport tag back while the other was still standing there holding it, and
   the screen would quietly become pinchable again halfway through being used.
   Counted, the tag is written by the FIRST holder and restored by the LAST,
   for the same reason a file has a reference count. */
let holders = 0;
let wasViewport: string | null = null;
const noGesture = (e: Event) => e.preventDefault();
const noPinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };

function acquire() {
  holders += 1;
  if (holders > 1) return;
  const root = document.documentElement;
  root.classList.add('tc-noscale');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  wasViewport = meta ? meta.getAttribute('content') : null;
  meta?.setAttribute('content', LOCKED);
  document.addEventListener('gesturestart', noGesture, { passive: false });
  document.addEventListener('gesturechange', noGesture, { passive: false });
  document.addEventListener('gestureend', noGesture, { passive: false });
  document.addEventListener('touchmove', noPinch, { passive: false });
}

function release() {
  holders = Math.max(0, holders - 1);
  if (holders > 0) return;
  const root = document.documentElement;
  root.classList.remove('tc-noscale');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && wasViewport !== null) meta.setAttribute('content', wasViewport);
  wasViewport = null;
  document.removeEventListener('gesturestart', noGesture);
  document.removeEventListener('gesturechange', noGesture);
  document.removeEventListener('gestureend', noGesture);
  document.removeEventListener('touchmove', noPinch);
}

export function useScaleLock(when: boolean = true) {
  useEffect(() => {
    if (!when) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 899px)').matches) return;
    acquire();
    return release;
  }, [when]);
}
