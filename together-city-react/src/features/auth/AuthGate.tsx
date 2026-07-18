import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui';

/** Route guard — waits for auth hydration, then requires a signed-in user. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, authed } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner label="Signing you in…" />;
  if (!authed) return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}
