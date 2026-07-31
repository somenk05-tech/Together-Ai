import type { DietKey } from './types';

/**
 * Diet colour identity — shared by the recipe library, a recipe's own page and
 * the food-preference profile.
 *
 * This used to live in pages/Recipes.tsx, and it was the only reason that file
 * survived: the page it exported was never routed, but two other pages imported
 * this constant, so the dead-page guard saw an imported module and stayed quiet.
 * A constant is not a page. It lives here now, and the page it was hiding is
 * gone (FE-19.2).
 */
export const DIET_META: Record<Exclude<DietKey, 'everything'>, { label: string; color: string; soft: string; icon: string }> = {
  veg: { label: 'Veg', color: '#2e7d32', soft: '#e8f5e9', icon: '🥗' },
  nonveg: { label: 'Non-veg', color: '#c62828', soft: '#ffebee', icon: '🍖' },
  pesc: { label: 'Fish', color: '#0277bd', soft: '#e1f5fe', icon: '🐟' },
  egg: { label: 'Egg', color: '#f9a825', soft: '#fff8e1', icon: '🍳' },
  vegan: { label: 'Vegan', color: '#1b5e20', soft: '#e0f2e9', icon: '🌱' },
  jain: { label: 'Jain', color: '#66bb6a', soft: '#f1f8e9', icon: '🍲' },
};
