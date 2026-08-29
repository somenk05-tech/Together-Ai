import { queryClient } from './queryClient';

/**
 * Wipe ALL per-user client state on an auth transition (login, register, email
 * verify, logout) so a second user on the same browser can never inherit the
 * first user's data.
 *
 * Two leak surfaces existed:
 *  1. The React Query cache singleton — held every user-scoped query
 *     (`/profile/me`, connections, nutrition, financial, chats, …). It was never
 *     cleared, so a new login rendered the previous user's cached results.
 *  2. ~Seven zustand/`localStorage` stores keyed with GLOBAL names
 *     (`tc-saved-posts`, `tc:family:*`, `tc:nutrition:*`, `tc-privacy-v1`,
 *     `tc-recent-v1`, `tc:travel:groups`, …) — never cleared either.
 *
 * We keep only `tc:auth` (that IS the identity being set). Everything else under
 * the app's `tc-` / `tc:` namespace is per-user or per-session UI state and is
 * safe (and correct) to drop on a user switch.
 */
const KEEP_KEYS = new Set<string>(['tc:auth', 'tc:theme']); // theme is a device preference, not personal data

export function resetClientState(): void {
  // 1) React Query cache — the primary cross-user leak.
  try { queryClient.clear(); } catch { /* noop */ }

  // 2) Real-time socket — drop it so the next user connects with their own
  //    token and none of the previous user's room subscriptions. Imported
  //    lazily: socket.ts reads the auth store, so a static import here would
  //    create an auth.store → session-reset → socket → auth.store cycle.
  void import('./socket').then((m) => m.socketClient.reset()).catch(() => undefined);

  /* 3) THE PUSH SUBSCRIPTION, which is per-user state living outside every
        store this function knew about (fifth audit, 29 Aug).
        `pushApi.unsubscribe` existed and NOTHING called it, so a browser kept
        its subscription across a sign-out. Two consequences on a shared
        machine, and the second is the worse one: the person who signed out
        went on receiving their own notifications — dating message previews
        included — on somebody else's screen; and when the next account signed
        in, `useWebPush` found the same subscription, sent the identical JSON,
        and `push.controller` correctly refused to re-point it. That account
        then had no push on that browser, permanently, with nothing said.
        The browser-side `unsubscribe()` is the half that carries this: it
        stops delivery at once and frees the next account to create a fresh
        subscription. The server call is best-effort — by the time this runs
        the token is usually already cleared — and the row it leaves behind
        self-cleans, because the next send to a revoked endpoint returns 410
        and WebPushProvider deletes it. */
  void (async () => {
    const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const json = sub.toJSON();
    /* THE BROWSER FIRST, THE SERVER AFTER (re-audit, 29 Aug). The first
       version awaited the server call and then revoked — and `signOut` clears
       the tokens BEFORE calling this, so that request goes out with no bearer,
       is refused by JwtAuthGuard, and drags the response interceptor through a
       doomed refresh on the way. Meanwhile the one step that actually stops
       delivery was queued behind all of it, so closing the tab straight after
       signing out — the normal thing to do — left the subscription alive on a
       shared machine, which is the exact leak this exists to close.
       The server row left behind self-cleans: the next send to a revoked
       endpoint returns 410 and WebPushProvider deletes it. */
    await sub.unsubscribe().catch(() => undefined);
    void import('./push.api').then((m) => m.pushApi.unsubscribe(json)).catch(() => undefined);
  })().catch(() => undefined);

  // 4) Per-user persisted stores under the app namespace.
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || KEEP_KEYS.has(k)) continue;
      // `mira.*` is the third namespace and it was missed because it does not
      // wear the app's prefix. Everything under it is one citizen's: her
      // transcript (`mira.day`, and `mira.day.friend` until the merge has
      // folded it in), the day she was greeted, the
      // mood seed, the marker that says she has already introduced herself.
      // All of it survived a sign-out, so the next account on this browser
      // opened her room and read the previous person's conversation.
      if (k.startsWith('tc-') || k.startsWith('tc:') || k.startsWith('mira.')) drop.push(k);
    }
    for (const k of drop) localStorage.removeItem(k);
  } catch { /* storage may be unavailable */ }
}
