import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, User } from '@/types';
import { authApi } from '@/api';
import { resetClientState } from '@/api/session-reset';

/** Read a JWT's `exp` (no verification) to tell if it's already expired, so the
 *  app can refresh or log out cleanly BEFORE firing a burst of doomed requests. */
export function isTokenExpired(token?: string | null): boolean {
  if (!token) return true;
  try {
    const payload = token.split('.')[1];
    // unknown, then narrowed: a JWT payload is attacker-adjacent input, and
    // `any` here was the exact hole the lint error pointed at.
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = typeof json === 'object' && json !== null && 'exp' in json
      ? (json as { exp: unknown }).exp : undefined;
    if (typeof exp !== 'number') return false;       // no exp claim → treat as valid
    return Date.now() >= exp * 1000 - 5000;          // 5s early margin
  } catch {
    return true; // unparseable → treat as expired
  }
}

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  ready: boolean;
  isAuthenticated: () => boolean;
  login: (handle: string, password: string) => Promise<void>;
  register: (handle: string, name: string, password: string, contact: { email: string; phone?: string }) => Promise<void>;
  refresh: () => Promise<string | null>;
  signOut: () => void;
  hydrate: () => Promise<void>;
}

let refreshInFlight: Promise<string | null> | null = null;

/** Typed auth store over the NestJS handle+password endpoints. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      ready: false,
      isAuthenticated: () => Boolean(get().tokens?.accessToken && get().user),

      login: async (handle, password) => {
        // Wipe any prior user's cached/persisted state BEFORE establishing the
        // new session, so this login can't inherit the previous user's data.
        resetClientState();
        const { accessToken, refreshToken } = await authApi.login({ handle, password });
        set({ tokens: { accessToken, refreshToken } });
        set({ user: await authApi.me() });
      },

      register: async (handle, name, password, contact) => {
        resetClientState();
        const { accessToken, refreshToken } = await authApi.register({ handle, name, password, email: contact.email, phone: contact.phone || undefined });
        set({ tokens: { accessToken, refreshToken } });
        set({ user: await authApi.me() });
      },


      refresh: async () => {
        // SINGLE-FLIGHT: hydrate, the 401 interceptor and any other caller share
        // one in-flight rotation. Refresh tokens are single-use server-side, so
        // two concurrent rotations meant the loser was told "invalid" and the
        // citizen was signed out of a live session mid-use.
        refreshInFlight ??= (async (): Promise<string | null> => {
          // Persistent login runs on the refresh token in localStorage (no cookie).
          // Without one there's nothing to refresh, so clear cleanly to the login
          // screen instead of firing a doomed request.
          const rt = get().tokens?.refreshToken;
          if (!rt) {
            set({ user: null, tokens: null });
            return null;
          }
          try {
            const tokens = await authApi.refresh(rt);
            set({ tokens });
            return tokens.accessToken;
          } catch (e) {
            // Only a definitive server "no" ends the session. A timeout, a cold
            // start, DNS failure or a 5xx is OUR outage — signing the citizen out
            // for it is the "app forgot who I am" bug. Keep the tokens; the next
            // attempt (or the error states) will tell the truth about the outage.
            const status = (e as { response?: { status?: number } } | null)?.response?.status;
            if (status === 400 || status === 401 || status === 403) {
              set({ user: null, tokens: null });
              // Same cleanup as signOut: the recent-pages trail and every other
              // per-user store must not outlive the session on a shared machine.
              resetClientState();
            }
            return null;
          } finally {
            refreshInFlight = null;
          }
        })();
        return refreshInFlight;
      },

      // Only hit /auth/logout when we actually hold a live token — otherwise just
      // clear local state (avoids a storm of 401 "missing header" logout calls).
      signOut: () => {
        const t = get().tokens;
        if (t?.accessToken && !isTokenExpired(t.accessToken)) void authApi.logout().catch(() => undefined);
        set({ user: null, tokens: null });
        // Drop the query cache + every per-user persisted store so the next user
        // on this browser starts clean (no inherited data). In-memory-only stores
        // are wiped by the reload the login screen triggers.
        resetClientState();
      },

      hydrate: async () => {
        const t = get().tokens;
        // No stored session at all → straight to the login screen. (Persistent
        // login is restored from the refresh token in localStorage below, when
        // one exists but the access token has expired.)
        if (!t?.accessToken) {
          set({ ready: true });
          return;
        }
        // Stored access token already expired: refresh ONCE before rendering as
        // authenticated, so we never fire a burst of doomed protected requests.
        // If refresh fails, the session is cleared → clean login screen.
        if (isTokenExpired(t.accessToken)) {
          const fresh = await get().refresh();
          set({ ready: true });
          if (!fresh) return;
        } else {
          set({ ready: true });
        }
        // Session is live → refresh the profile in the background.
        authApi.me().then((user) => set({ user })).catch(() => undefined);
      },
    }),
    // Persist the user too, so a reload shows the app instantly instead of
    // waiting on /users/me (which is slow right after a deploy).
    { name: 'tc:auth', partialize: (s) => ({ tokens: s.tokens, user: s.user }) },
  ),
);

// Another tab rotated the session (refresh tokens are single-use) or signed
// out. Adopt its state instead of keeping stale tokens that would fail the
// next refresh and sign THIS tab out of a live session.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'tc:auth') return;
    try {
      const next = e.newValue
        ? (JSON.parse(e.newValue) as { state?: { tokens?: AuthTokens | null; user?: User | null } }).state
        : null;
      if (next?.tokens?.accessToken) {
        useAuthStore.setState({ tokens: next.tokens, user: next.user ?? useAuthStore.getState().user });
      } else if (useAuthStore.getState().tokens) {
        useAuthStore.setState({ tokens: null, user: null });
      }
    } catch {
      // Malformed storage payload — leave this tab's state alone.
    }
  });
}
