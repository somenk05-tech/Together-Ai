import { useAuthStore } from '@/store/auth.store';

/** Convenience selector hook over the auth store. */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const authed = useAuthStore((s) => s.isAuthenticated());
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const signOut = useAuthStore((s) => s.signOut);
  return { user, ready, authed, login, register, signOut };
}
