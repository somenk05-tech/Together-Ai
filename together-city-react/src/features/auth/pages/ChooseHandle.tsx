import { Navigate } from 'react-router-dom';

/**
 * Deprecated — the handle is now chosen during registration (SignIn).
 * Kept as a redirect for any lingering links; not referenced by the router.
 */
export function ChooseHandle() {
  return <Navigate to="/sign-in" replace />;
}
