import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

/**
 * THE HUB'S ROOMS UNDER THE RAIL, exported as plain route objects so
 * `app/router.tsx` spreads them into one HubLayout block and applies
 * `RequireAuth` and the chunk boundary in a single line — the shape the Pet
 * district settled on, and for the same reason: a room that forgot its auth
 * gate looks identical until the day it does not.
 *
 * ONE ROOM SINCE 6 SEP. The Personalized Store and the Open Market were two
 * rooms here until the owner made them the store itself — "a Shopify store for
 * both pages with category tabs on top" — and a storefront wears no rail: they
 * are registered beside the shops, above every HubLayout block, in
 * app/router.tsx. The cart is still a room of the hub: it is nobody's shelf,
 * it belongs to all of them, and the rail is where a citizen looks for
 * "where is my cart".
 *
 * `/ecommerce` itself is a HubLanding, registered beside the other landings.
 */

const CityCart = lazy(() => import('./pages/CityCart').then((m) => ({ default: m.CityCart })));

export const ecommerceRoutes: RouteObject[] = [
  { path: '/ecommerce/cart', element: <CityCart /> },
];
