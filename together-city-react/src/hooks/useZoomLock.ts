import { useEffect } from 'react';

/**
 * THE CITY DOES NOT GET PINCHED OUT OF SHAPE.
 *
 * The owner watched the desktop city distort under a trackpad pinch and asked
 * for zoom to be locked. This is what a web page can honestly do about that,
 * and — just as importantly — what it cannot.
 *
 * ── WHAT WORKS, AND WHY ─────────────────────────────────────────────────────
 *
 * 1. `wheel` with ctrlKey, listener NON-PASSIVE.
 *    A trackpad pinch does not arrive as a touch gesture on a desktop browser;
 *    Chrome, Edge and Firefox synthesise a `wheel` event with `ctrlKey: true`.
 *    That event IS cancellable, so this is the one prevention that reliably
 *    holds — and it covers Ctrl/Cmd + mouse wheel at the same time, because
 *    they are the same event.
 *    `{ passive: false }` is the entire trick: React's own onWheel and any
 *    default-registered listener are passive, and a passive listener may not
 *    call preventDefault. Registering by hand is the only way.
 *    NOTHING is prevented unless ctrlKey is set, so ordinary wheel scrolling,
 *    two-finger trackpad scrolling and momentum are untouched.
 *
 * 2. `gesturestart` / `gesturechange` / `gestureend`.
 *    Safari on macOS does not synthesise the ctrl-wheel; it fires these
 *    non-standard events instead. Prevented for the same reason.
 *
 * 3. The viewport meta (index.html) carries `maximum-scale=1, user-scalable=no`.
 *
 * ── WHAT DOES NOT WORK, STATED PLAINLY ──────────────────────────────────────
 *
 * Ctrl/Cmd with +, - or 0 CANNOT be blocked by a web page. Chrome, Safari and
 * Firefox handle browser-zoom shortcuts in the browser itself, above the
 * document, and the keydown either never reaches the page or is not cancellable
 * when it does. The handler below is registered anyway because it is correct in
 * the contexts where it does apply (an Electron shell, a WebView, a kiosk
 * build) and costs nothing elsewhere — but it is NOT a promise, and writing it
 * without saying so would be the kind of code that looks like a feature and is
 * a decoration.
 *
 * iOS Safari has ignored `user-scalable=no` since iOS 10, deliberately, for
 * accessibility. There is no override and there should not be one.
 *
 * ── THE ACCESSIBILITY COST, ON THE RECORD ───────────────────────────────────
 *
 * Blocking pinch-to-zoom fails WCAG 2.1 SC 1.4.4 (Resize Text): people with low
 * vision use it, and on Android Chrome — the one place `user-scalable=no` is
 * honoured — this takes it from them. The owner was asked directly and chose
 * it (10 Aug). It is written here rather than discovered later, and it is one
 * line in index.html to give back.
 *
 * ── WHAT IS DELIBERATELY NOT DONE ───────────────────────────────────────────
 *
 * No `touch-action: none`, no blanket `touchmove` prevention, no scroll
 * locking. Those are the usual way this gets implemented and they break
 * scrolling on touch devices, which is a far worse bug than the one being
 * fixed. Every listener here is scoped to a zoom gesture and to nothing else.
 */
export function useZoomLock(): void {
  useEffect(() => {
    // A pinch on a trackpad, and Ctrl/Cmd + wheel. One event, one guard.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    // Safari/macOS pinch.
    const onGesture = (e: Event) => e.preventDefault();
    // Honest about its reach — see the note above.
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (['+', '=', '-', '_', '0'].includes(e.key)) e.preventDefault();
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('gesturestart', onGesture as EventListener);
    window.addEventListener('gesturechange', onGesture as EventListener);
    window.addEventListener('gestureend', onGesture as EventListener);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('gesturestart', onGesture as EventListener);
      window.removeEventListener('gesturechange', onGesture as EventListener);
      window.removeEventListener('gestureend', onGesture as EventListener);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
