/**
 * ── THE HUB'S ROUTES, IN ONE PLACE ──────────────────────────────────────────
 *
 * Exported as a plain array so `app/router.tsx` spreads it into the existing
 * HubLayout block rather than growing six lines of its own:
 *
 *   import { babycareRoutes } from '@/features/babycare/routes';
 *   …
 *   { element: <HubLayout hub={HUBS.babycare} />, children: babycareRoutes },
 *
 * EVERY ELEMENT IS LAZY, THE BOOT INCLUDED. The Pet District paid for the other
 * arrangement: one eager twenty-line boot component dragged a 239 KB catalogue
 * into the shared chunk that every page in the city waits for. This catalogue is
 * 323 rows, and no citizen who never opens Baby Care should pay for one of them.
 * `router.tsx` already wraps these in ChunkBoundary, which is a Suspense
 * boundary, so there is nothing else to arrange.
 */

import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';

const BabyCareBoot = lazy(() => import('./components/Boot').then((m) => ({ default: m.BabyCareBoot })));
const Shop = lazy(() => import('./pages/Shop').then((m) => ({ default: m.Shop })));
const Children = lazy(() => import('./pages/Children').then((m) => ({ default: m.Children })));
const Essentials = lazy(() => import('./pages/Essentials').then((m) => ({ default: m.Essentials })));
const Safety = lazy(() => import('./pages/Safety').then((m) => ({ default: m.Safety })));
const ProductPage = lazy(() => import('./pages/ProductPage').then((m) => ({ default: m.ProductPage })));

/**
 * ── THE RAIL ────────────────────────────────────────────────────────────────
 *
 * Four rooms, in the order a parent uses them rather than the order they were
 * built. The shop is 01 because it is what the district is; the children come
 * second because the shop works without them and gets better with them, and a
 * form as the first door is a toll gate.
 *
 * The product page is not on the rail — it is reached from a tile — which is
 * the same shape every catalogue in this city has.
 */
export const BABYCARE_SIDEBAR = [
  { path: '/babycare/shop', index: '01', label: 'The baby store', sub: 'Seven aisles, 0-10 years' },
  { path: '/babycare/children', index: '02', label: 'Your children', sub: 'A name and a birthday' },
  { path: '/babycare/essentials', index: '03', label: 'For this age', sub: 'What the shop carries right now' },
  { path: '/babycare/safety', index: '04', label: 'Safety & the law', sub: 'Why this shop works the way it does' },
];

export const babycareRoutes: RouteObject[] = [
  {
    element: <BabyCareBoot />,
    children: [
      { path: '/babycare', element: <Navigate to="/babycare/shop" replace /> },
      { path: '/babycare/shop', element: <Shop /> },
      { path: '/babycare/children', element: <Children /> },
      { path: '/babycare/essentials', element: <Essentials /> },
      { path: '/babycare/safety', element: <Safety /> },
      { path: '/babycare/product/:id', element: <ProductPage /> },
    ],
  },
];
