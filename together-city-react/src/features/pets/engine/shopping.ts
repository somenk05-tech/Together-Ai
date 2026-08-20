/**
 * ── THE WEEK'S SHOPPING, DERIVED RATHER THAN TYPED ──────────────────────────
 *
 * The list is generated from the plan the pet is actually on, which is the only
 * way the two can agree. It comes out in two halves because they are bought in
 * two different places and a single merged list is how the chicken ends up in
 * the pet-food cart:
 *
 *   BUY FROM TOGETHER CITY — the complete diets, treats and supplies.
 *   BUY FOR HOME COOKING   — the chicken, rice and pumpkin from the kitchen.
 *
 * QUANTITIES ARE HONEST ABOUT WHAT THEY KNOW. A week of a commercial food can
 * only be given in grams when the retailer published the food's energy density,
 * and most did not; where it is unknown the line says "1 pack" and points at
 * the pack's own feeding guide instead of inventing a weight.
 */

import type { DayPlan, NutritionPlan, Pet, ShoppingItem } from '../types';
import { RECIPES } from '../data/recipes';
import { CATALOGUE } from '../data/catalogue';
import { fullName } from './naming';

const byId = new Map(CATALOGUE.map((p) => [p.id, p]));
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

const round50 = (g: number) => Math.max(50, Math.round(g / 50) * 50);

export function shoppingFor(pet: Pet, plan: NutritionPlan): ShoppingItem[] {
  const home = new Map<string, number>();      // ingredient label → grams
  const shop = new Map<string, number>();      // product id → grams (or 0 = unknown)

  const walk = (day: DayPlan) => {
    for (const meal of day.meals) {
      if (meal.recipeId) {
        const recipe = recipeById.get(meal.recipeId);
        if (!recipe || !meal.grams) continue;
        for (const item of recipe.items) {
          home.set(item.label, (home.get(item.label) ?? 0) + meal.grams * item.share);
        }
      } else if (meal.productId) {
        shop.set(meal.productId, (shop.get(meal.productId) ?? 0) + (meal.grams ?? 0));
      }
    }
  };
  plan.days.forEach(walk);

  const items: ShoppingItem[] = [];

  for (const [id, grams] of shop) {
    const product = byId.get(id);
    if (!product) continue;
    items.push({
      id: `shop-${id}`,
      label: fullName(product),
      qty: grams > 0 ? `${(round50(grams) / 1000).toFixed(2)} kg for the week` : `1 pack — ${product.packSizes[0] ?? 'see pack'}`,
      source: 'together-city',
      productId: id,
      checked: false,
      custom: false,
    });
  }

  for (const [label, grams] of home) {
    items.push({
      id: `home-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      qty: grams >= 1000 ? `${(round50(grams) / 1000).toFixed(1)} kg` : `${round50(grams)} g`,
      source: 'home-kitchen',
      productId: null,
      checked: false,
      custom: false,
    });
  }

  // Treats are a budget, not a bag: one pack a week is the honest line.
  const treats = CATALOGUE.find(
    (p) => p.category === 'treats' && (p.species === pet.species || p.species === 'both') && p.verified.price,
  );
  if (treats) {
    items.push({
      id: `shop-${treats.id}`,
      label: fullName(treats),
      qty: `1 pack · keep inside ${plan.treatKcal} kcal a day`,
      source: 'together-city',
      productId: treats.id,
      checked: false,
      custom: false,
    });
  }

  return items;
}
