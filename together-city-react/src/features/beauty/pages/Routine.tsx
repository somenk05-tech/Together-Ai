import { Navigate } from 'react-router-dom';

/**
 * AI Routine Generator — in the static site this page only redirects to the
 * curated products shelf (beauty-products.html → the Beauty Market). We mirror
 * that: the routine builder now lives inside the market, so send users there.
 */
export function Routine() {
  return <Navigate to="/beauty/market" replace />;
}
