import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, User } from '@/types';
import { authApi } from '@/api';

/** Read a JWT's `exp` (no verification) to tell if it's already expired, so the
 *  app can refresh or log out cleanly BEFORE firing a burst of doomed requests. */
export function isTokenExpired(token?: string | null): boolean {
  if (!token) return true;
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof json.exp !== 'number') return false; // no exp claim → treat as valid
    return Date.now() >= json.exp * 1000 - 5000;     // 5s early margin
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
  verifyEmail: (token: string) => Promise<void>;
  refresh: () => Promise<string | null>;
  signOut: () => void;
  hydrate: () => Promise<void>;
}

/** Typed auth store over the NestJS handle+password endpoints. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      ready: false,
      isAuthenticated: () => Boolean(get().tokens?.accessToken && get().user),

      login: async (handle, password) => {
        const { accessToken, refreshToken } = await authApi.login({ handle, password });
        set({ tokens: { accessToken, refreshToken } });
        set({ user: await authApi.me() });
      },

      register: async (handle, name, password, contact) => {
        const { accessToken, refreshToken } = await authApi.register({ handle, name, password, email: contact.email, phone: contact.phone || undefined });
        set({ tokens: { accessToken, refreshToken } });
        set({ user: await authApi.me() });
      },

      verifyEmail: async (token: string) => {
        const { accessToken, refreshToken } = await authApi.verifyEmail(token);
        set({ tokens: { accessToken, refreshToken } });
        set({ user: await authApi.me() });
      },

      refresh: async () => {
        // Try the stored refresh token first; if there isn't one, the request
        // still goes out and the backend uses the HttpOnly refresh cookie. Only a
        // genuine failure (no token AND no valid cookie) clears the session.
        const rt = get().tokens?.refreshToken;
        try {
          const tokens = await authApi.refresh(rt);
          set({ tokens });
          return tokens.accessToken;
        } catch {
          set({ user: null, tokens: null });
          return null;
        }
      },

      // Only hit /auth/logout when we actually hold a live token — otherwise just
      // clear local state (avoids a storm of 401 "missing header" logout calls).
      signOut: () => {
        const t = get().tokens;
        if (t?.accessToken && !isTokenExpired(t.accessToken)) void authApi.logout().catch(() => undefined);
        set({ user: null, tokens: null });
      },

      hydrate: async () => {
        const t = get().tokens;
        // No stored access token → attempt a silent restore from the HttpOnly
        // refresh cookie (survives a localStorage wipe / reopened browser). If
        // there's no cookie either, this fails cleanly to the login screen.
        if (!t?.accessToken) {
          const fresh = await get().refresh();
          set({ ready: true });
          if (fresh) authApi.me().then((user) => set({ user })).catch(() => undefined);
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
