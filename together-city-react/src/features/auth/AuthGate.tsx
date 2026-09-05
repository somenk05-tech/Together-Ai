import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui';

/** Route guard — waits for auth hydration, then requires a signed-in user. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, authed } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner label="Signing you in…" />;
  // The whole address comes back after sign-in — `/social/post?comment=abc#c3`
  // used to return to `/social/post` (5 Sep).
  if (!authed) return <Navigate to="/sign-in" state={{ from: `${location.pathname}${location.search}${location.hash}` }} replace />;
  return <>{children}</>;
}
