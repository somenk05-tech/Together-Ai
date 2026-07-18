import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, User } from '@/types';
import { authApi } from '@/api';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  ready: boolean;
  isAuthenticated: () => boolean;
  login: (handle: string, password: string) => Promise<void>;
  register: (handle: string, name: string, password: string, contact?: { email?: string; phone?: string }) => Promise<void>;
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
        const { accessToken, refreshToken } = await authApi.register({ handle, name, password, email: contact?.email || undefined, phone: contact?.phone || undefined });
        set({ tokens: { accessToken, refreshToken } });
        set({ user: await authApi.me() });
      },

      refresh: async () => {
        const rt = get().tokens?.refreshToken;
        if (!rt) return null;
        try {
          const tokens = await authApi.refresh(rt);
          set({ tokens });
          return tokens.accessToken;
        } catch {
          set({ user: null, tokens: null });
          return null;
        }
      },

      signOut: () => { void authApi.logout().catch(() => undefined); set({ user: null, tokens: null }); },

      hydrate: async () => {
        if (get().tokens?.accessToken) {
          try { set({ user: await authApi.me() }); } catch { /* interceptor handles refresh */ }
        }
        set({ ready: true });
      },
    }),
    { name: 'tc:auth', partialize: (s) => ({ tokens: s.tokens }) },
  ),
);
