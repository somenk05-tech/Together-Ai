import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

/**
 * The hub's two rooms, exported as plain route objects so `app/router.tsx`
 * spreads them into one HubLayout block and applies `RequireAuth` and the chunk
 * boundary in a single line — the shape the Pet district settled on, and for
 * the same reason: a room that forgot its auth gate looks identical until the
 * day it does not.
 *
 * `/ecommerce` itself is a HubLanding, registered beside the other landings.
 *
 * Lazy, like every other vertical. The two pages are small, but they are also
 * the only two files a citizen who never opens this district would otherwise
 * pay for.
 */

const PersonalizedStore = lazy(() => import('./pages/PersonalizedStore').then((m) => ({ default: m.PersonalizedStore })));
const OpenMarket = lazy(() => import('./pages/OpenMarket').then((m) => ({ default: m.OpenMarket })));
const CityCart = lazy(() => import('./pages/CityCart').then((m) => ({ default: m.CityCart })));

export const ecommerceRoutes: RouteObject[] = [
  { path: '/ecommerce/store', element: <PersonalizedStore /> },
  { path: '/ecommerce/market', element: <OpenMarket /> },
  /* The cart is a ROOM of this hub rather than a screen of the store: it is
     nobody's shelf, it belongs to all three, and the rail is where a citizen
     looks for "where is my cart". */
  { path: '/ecommerce/cart', element: <CityCart /> },
];
