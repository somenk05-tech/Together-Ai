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
import { PetsBoot } from './components/PetsBoot';

const PetsHome = lazy(() => import('./pages/PetsHome').then((m) => ({ default: m.PetsHome })));
const Profiles = lazy(() => import('./pages/Profiles').then((m) => ({ default: m.Profiles })));
const DietPlanner = lazy(() => import('./pages/DietPlanner').then((m) => ({ default: m.DietPlanner })));
const Today = lazy(() => import('./pages/Today').then((m) => ({ default: m.Today })));
const Monthly = lazy(() => import('./pages/Monthly').then((m) => ({ default: m.Monthly })));
const EatThis = lazy(() => import('./pages/EatThis').then((m) => ({ default: m.EatThis })));
const Cook = lazy(() => import('./pages/Cook').then((m) => ({ default: m.Cook })));
const RecipeDetail = lazy(() => import('./pages/Cook').then((m) => ({ default: m.RecipeDetail })));
const Market = lazy(() => import('./pages/Market').then((m) => ({ default: m.Market })));
const ProductPage = lazy(() => import('./pages/ProductPage').then((m) => ({ default: m.ProductPage })));
const Specialist = lazy(() => import('./pages/Specialist').then((m) => ({ default: m.Specialist })));
const Compare = lazy(() => import('./pages/Compare').then((m) => ({ default: m.Compare })));
const Cart = lazy(() => import('./pages/Cart').then((m) => ({ default: m.Cart })));
const Bundles = lazy(() => import('./pages/Bundles').then((m) => ({ default: m.Bundles })));
const Wellness = lazy(() => import('./pages/Wellness').then((m) => ({ default: m.Wellness })));
const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.Activity })));
const Quiz = lazy(() => import('./pages/Quiz').then((m) => ({ default: m.Quiz })));

/** The hub's inner rooms. `/pets` itself is a HubLanding, registered beside the
 *  other landings in router.tsx — see README.md.
 *
 *  ONE PATHLESS ROUTE WRAPS ALL OF THEM. `PetsBoot` fetches the citizen's pets
 *  the first time any room mounts, so a bookmark straight to `/pets/monthly`
 *  arrives with the same data the world page would have had. It is not eager:
 *  a citizen who never opens Pets never asks for them. */
export const petsRoutes: RouteObject[] = [{
  element: <PetsBoot />,
  children: [
  { path: '/pets/world', element: <PetsHome /> },
  { path: '/pets/profiles', element: <Profiles /> },
  { path: '/pets/plan', element: <DietPlanner /> },
  { path: '/pets/today', element: <Today /> },
  { path: '/pets/monthly', element: <Monthly /> },
  /* The week's URL still resolves — somebody has it bookmarked and a 404 is a
     worse answer than the page that replaced it. */
  { path: '/pets/weekly', element: <Monthly /> },
  { path: '/pets/eat', element: <EatThis /> },
  { path: '/pets/cook', element: <Cook /> },
  { path: '/pets/cook/:id', element: <RecipeDetail /> },
  { path: '/pets/shop', element: <Market /> },
  { path: '/pets/shop/:id', element: <ProductPage /> },
  { path: '/pets/specialist', element: <Specialist /> },
  { path: '/pets/compare', element: <Compare /> },
  { path: '/pets/cart', element: <Cart /> },
  { path: '/pets/bundles', element: <Bundles /> },
  { path: '/pets/wellness', element: <Wellness /> },
  { path: '/pets/activity', element: <Activity /> },
  { path: '/pets/quiz', element: <Quiz /> },
  ],
}];

/** The sidebar, in the shape `HubConfig.items` expects.
 *
 *  THIRTEEN ROOMS, DOWN FROM SIXTEEN. Shopping list and Never run out both
 *  described the same month of food the plan already knows about, so the list
 *  moved under the monthly plan that generates it and the repeat-delivery room
 *  went entirely — a subscription is a commerce feature, and this hub has no
 *  checkout to hang it on yet. Services went with them: the real directory is
 *  Together City's own Local Services hub, and a second one here was a sample
 *  directory pretending to be a room. */
export const PETS_SIDEBAR = [
  { path: '/pets/world', index: '01', label: 'Pet world', sub: 'Your pets and the district' },
  { path: '/pets/profiles', index: '02', label: 'Pet profiles', sub: 'Add and edit your pets' },
  { path: '/pets/plan', index: '03', label: 'Diet plan', sub: 'Built from the profile' },
  { path: '/pets/today', index: '04', label: 'Today', sub: 'Meals, treats and water' },
  { path: '/pets/monthly', index: '05', label: 'Monthly plan', sub: 'A month of meals and the grocery list' },
  { path: '/pets/eat', index: '06', label: 'Can my pet eat this?', sub: 'Ingredient safety' },
  { path: '/pets/cook', index: '07', label: 'Cook for my pet', sub: 'Indian home recipes' },
  { path: '/pets/shop', index: '08', label: 'Pet shop', sub: 'Food, treats and supplies' },
  { path: '/pets/specialist', index: '09', label: 'Pet specialist', sub: 'Shop by need' },
  { path: '/pets/bundles', index: '10', label: 'Bundles', sub: 'Curated kits you can edit' },
  { path: '/pets/wellness', index: '11', label: 'Health & wellness', sub: 'Weight, medical records, reminders' },
  { path: '/pets/activity', index: '12', label: 'Activity', sub: 'Walks and play' },
  { path: '/pets/quiz', index: '13', label: 'Pet scorecard', sub: 'What does your pet need?' },
];
