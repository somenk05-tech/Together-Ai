/**
 * ── THE HUB'S ROUTES, IN ONE PLACE ──────────────────────────────────────────
 *
 * Exported as a plain array so `app/router.tsx` spreads it into the existing
 * HubLayout block rather than growing nineteen more lines of its own:
 *
 *   import { petsRoutes } from '@/features/pets/routes';
 *   …
 *   { element: <HubLayout hub={HUBS.pets} />, children: petsRoutes },
 *
 * Lazy, like the rest of the reference verticals — the catalogue and the
 * ingredient database are a few hundred kilobytes of JSON and no citizen who
 * never opens Pets should pay for them.
 */

import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const PetsHome = lazy(() => import('./pages/PetsHome').then((m) => ({ default: m.PetsHome })));
const Profiles = lazy(() => import('./pages/Profiles').then((m) => ({ default: m.Profiles })));
const DietPlanner = lazy(() => import('./pages/DietPlanner').then((m) => ({ default: m.DietPlanner })));
const Today = lazy(() => import('./pages/Today').then((m) => ({ default: m.Today })));
const Weekly = lazy(() => import('./pages/Weekly').then((m) => ({ default: m.Weekly })));
const EatThis = lazy(() => import('./pages/EatThis').then((m) => ({ default: m.EatThis })));
const Cook = lazy(() => import('./pages/Cook').then((m) => ({ default: m.Cook })));
const RecipeDetail = lazy(() => import('./pages/Cook').then((m) => ({ default: m.RecipeDetail })));
const Market = lazy(() => import('./pages/Market').then((m) => ({ default: m.Market })));
const ProductPage = lazy(() => import('./pages/ProductPage').then((m) => ({ default: m.ProductPage })));
const Specialist = lazy(() => import('./pages/Specialist').then((m) => ({ default: m.Specialist })));
const Compare = lazy(() => import('./pages/Compare').then((m) => ({ default: m.Compare })));
const Cart = lazy(() => import('./pages/Cart').then((m) => ({ default: m.Cart })));
const Bundles = lazy(() => import('./pages/Bundles').then((m) => ({ default: m.Bundles })));
const Subscriptions = lazy(() => import('./pages/Subscriptions').then((m) => ({ default: m.Subscriptions })));
const Shopping = lazy(() => import('./pages/Shopping').then((m) => ({ default: m.Shopping })));
const Wellness = lazy(() => import('./pages/Wellness').then((m) => ({ default: m.Wellness })));
const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.Activity })));
const Services = lazy(() => import('./pages/Services').then((m) => ({ default: m.Services })));
const Quiz = lazy(() => import('./pages/Quiz').then((m) => ({ default: m.Quiz })));

/** The hub's inner rooms. `/pets` itself is a HubLanding, registered beside the
 *  other landings in router.tsx — see README.md. */
export const petsRoutes: RouteObject[] = [
  { path: '/pets/world', element: <PetsHome /> },
  { path: '/pets/profiles', element: <Profiles /> },
  { path: '/pets/plan', element: <DietPlanner /> },
  { path: '/pets/today', element: <Today /> },
  { path: '/pets/weekly', element: <Weekly /> },
  { path: '/pets/eat', element: <EatThis /> },
  { path: '/pets/cook', element: <Cook /> },
  { path: '/pets/cook/:id', element: <RecipeDetail /> },
  { path: '/pets/shop', element: <Market /> },
  { path: '/pets/shop/:id', element: <ProductPage /> },
  { path: '/pets/specialist', element: <Specialist /> },
  { path: '/pets/compare', element: <Compare /> },
  { path: '/pets/cart', element: <Cart /> },
  { path: '/pets/bundles', element: <Bundles /> },
  { path: '/pets/subscriptions', element: <Subscriptions /> },
  { path: '/pets/shopping', element: <Shopping /> },
  { path: '/pets/wellness', element: <Wellness /> },
  { path: '/pets/activity', element: <Activity /> },
  { path: '/pets/services', element: <Services /> },
  { path: '/pets/quiz', element: <Quiz /> },
];

/** The sidebar, in the shape `HubConfig.items` expects. Paste into
 *  `config/hubs.ts` under the `pets` key, which currently has `items: []`. */
export const PETS_SIDEBAR = [
  { path: '/pets/world', index: '01', label: 'Pet world', sub: 'Your pets and the district' },
  { path: '/pets/profiles', index: '02', label: 'Pet profiles', sub: 'Add and edit your pets' },
  { path: '/pets/plan', index: '03', label: 'Diet planner', sub: 'Build a personalised plan' },
  { path: '/pets/today', index: '04', label: 'Today', sub: 'Meals, treats and water' },
  { path: '/pets/weekly', index: '05', label: 'Weekly planner', sub: 'Seven days of meals' },
  { path: '/pets/eat', index: '06', label: 'Can my pet eat this?', sub: 'Ingredient safety' },
  { path: '/pets/cook', index: '07', label: 'Cook for my pet', sub: 'Indian home recipes' },
  { path: '/pets/shop', index: '08', label: 'Pet shop', sub: 'Food, treats and supplies' },
  { path: '/pets/specialist', index: '09', label: 'Pet specialist', sub: 'Shop by need' },
  { path: '/pets/bundles', index: '10', label: 'Bundles', sub: 'Curated kits' },
  { path: '/pets/shopping', index: '11', label: 'Shopping list', sub: 'From this week’s plan' },
  { path: '/pets/subscriptions', index: '12', label: 'Never run out', sub: 'Repeat deliveries' },
  { path: '/pets/wellness', index: '13', label: 'Health & wellness', sub: 'Weight and reminders' },
  { path: '/pets/activity', index: '14', label: 'Activity', sub: 'Walks and play' },
  { path: '/pets/services', index: '15', label: 'Services', sub: 'Vets, groomers, boarding' },
  { path: '/pets/quiz', index: '16', label: 'Pet scorecard', sub: 'What does your pet need?' },
];
