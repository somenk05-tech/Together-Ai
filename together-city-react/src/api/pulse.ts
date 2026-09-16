import { http } from './client';

/**
 * ── HOW LONG, AND WHETHER IT BROKE (owner, 16 Sep) ──────────────────────────
 *
 * Two small instruments for the investor dashboard, both fire-and-forget:
 *
 * A SESSION is one opening of the app — this page load. It gets a random id,
 * and the server is told once that it began. If the app then hits an error it
 * cannot recover from (a screen that fell over, or an uncaught exception), the
 * same id is marked once. Nothing else travels: no account, no page, no
 * message — crash-free sessions is a count.
 *
 * A HEARTBEAT, while a member is signed in and the app is actually on screen:
 * every thirty seconds, how many of those seconds the page was visible. The
 * server caps each beat and each day (pulse.service.ts).
 */
const BEAT_EVERY_MS = 30_000;

let sessionId: string | null = null;
let crashed = false;

type Platform = 'web' | 'ios' | 'android';

function platform(): Platform {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = typeof cap?.getPlatform === 'function' ? cap.getPlatform() : 'web';
  return p === 'ios' || p === 'android' ? p : 'web';
}

function newId(): string | null {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null;
}

/** Say that this opening of the app began, and listen for it breaking. Once per load. */
export function startSession(): void {
  if (sessionId || typeof window === 'undefined') return;
  sessionId = newId();
  if (!sessionId) return;
  http.post('/insights/session', { id: sessionId, platform: platform() }).catch(() => undefined);
  window.addEventListener('error', (e) => {
    // A failed image or script load is an ErrorEvent without an error object;
    // only a thrown exception counts.
    if (e.error) reportCrash('uncaught');
  });
}

/** Mark this session as crashed — once, whatever happens after. */
export function reportCrash(kind: 'render' | 'uncaught'): void {
  if (!sessionId || crashed) return;
  crashed = true;
  http.post('/insights/session', { id: sessionId, platform: platform(), crash: kind }).catch(() => undefined);
}

/** While signed in: a beat every half minute with the seconds the app was on screen. Returns a stop. */
export function startHeartbeat(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  let visibleMs = 0;
  let since = document.visibilityState === 'visible' ? Date.now() : null;
  const take = () => {
    if (since !== null) { visibleMs += Date.now() - since; since = Date.now(); }
    const s = Math.round(visibleMs / 1000);
    visibleMs = 0;
    return s;
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') { since = Date.now(); return; }
    if (since !== null) { visibleMs += Date.now() - since; since = null; }
  };
  document.addEventListener('visibilitychange', onVisibility);
  const timer = window.setInterval(() => {
    const s = take();
    if (s > 0) http.post('/insights/beat', { s }).catch(() => undefined);
  }, BEAT_EVERY_MS);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
