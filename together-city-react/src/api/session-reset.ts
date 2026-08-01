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

  // 3) Per-user persisted stores under the app namespace.
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || KEEP_KEYS.has(k)) continue;
      if (k.startsWith('tc-') || k.startsWith('tc:')) drop.push(k);
    }
    for (const k of drop) localStorage.removeItem(k);
  } catch { /* storage may be unavailable */ }
}
