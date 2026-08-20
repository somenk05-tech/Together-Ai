/**
 * ── THE MONTH'S SHOPPING, DERIVED RATHER THAN TYPED ─────────────────────────
 *
 * The list is generated from the plan each pet is actually on, which is the
 * only way the two can agree. It comes out in two halves because they are
 * bought in two different places and a single merged list is how the chicken
 * ends up in the pet-food cart:
 *
 *   BUY FROM TOGETHER CITY — the complete diets, treats and supplies.
 *   BUY FOR HOME COOKING   — the chicken, rice and pumpkin from the kitchen.
 *
 * ── ONE LIST FOR THE WHOLE HOUSE ───────────────────────────────────────────
 *
 * A home with a dog and a cat does not do two shops. `shoppingForHousehold`
 * runs every pet's month and MERGES: one line per product and one per
 * ingredient, quantities added together, and each line carrying who it is for.
 *
 * Merging is the whole point and it is not cosmetic. Two cats on the same food
 * is one bag of a bigger size, not two lines the person has to add up at the
 * shelf; a kilo of rice for the dog and 300g for the cat is 1.3 kg in one bag.
 * Ordering per pet is how a household ends up paying two delivery fees for the
 * same product.
 *
 * WHAT IS NOT MERGED IS WHOSE IT IS. Every line keeps `forPets`, because "2.4
 * kg of Royal Canin Maxi" is a number you can act on and "2.4 kg — Max 2.0,
 * Bruno 0.4" is a number you can check. The moment a total cannot be traced
 * back to the animals that produced it, nobody trusts the list.
 *
 * QUANTITIES ARE HONEST ABOUT WHAT THEY KNOW. A month of a commercial food can
 * only be given in grams when the retailer published the food's energy density,
 * and most did not; where it is unknown the line says "1 pack" and points at
 * the pack's own feeding guide instead of inventing a weight. A merged line
 * whose pets disagree — one knows its grams, one does not — says the grams it
 * can prove and names the pack it cannot, rather than quietly dropping either.
 */

import type { DayPlan, NutritionPlan, Pet, ShoppingItem, ShoppingShare } from '../types';
import { RECIPES } from '../data/recipes';
import { CATALOGUE } from '../data/catalogue';
import { fullName } from './naming';

const byId = new Map(CATALOGUE.map((p) => [p.id, p]));
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

const round50 = (g: number) => Math.max(50, Math.round(g / 50) * 50);

/** The mid-point of an estimated band, for totalling a month of it. The card
 *  shows the range; a shopping list has to commit to one number to add up, and
 *  it says "about" where it does. */
const mid = (r: [number, number] | null) => (r ? Math.round((r[0] + r[1]) / 2) : 0);

/** What one pet's month needs, before anything is merged or worded. */
interface Need {
  /** product id → grams for the month. 0 means the listing publishes no energy
   *  density, so the honest unit is a pack rather than a weight. */
  shop: Map<string, number>;
  /** ingredient label → grams for the month. */
  home: Map<string, number>;
  /** The one treat pack, and the daily ceiling that goes with it. */
  treatId: string | null;
  treatKcal: number;
}

function needsOf(pet: Pet, plan: NutritionPlan): Need {
  const home = new Map<string, number>();
  const shop = new Map<string, number>();

  const walk = (day: DayPlan) => {
    for (const meal of day.meals) {
      if (meal.recipeId) {
        const recipe = recipeById.get(meal.recipeId);
        if (!recipe || !meal.grams) continue;
        for (const item of recipe.items) {
          home.set(item.label, (home.get(item.label) ?? 0) + meal.grams * item.share);
        }
      } else if (meal.productId) {
        const grams = meal.grams ?? mid(meal.gramsRange);
        shop.set(meal.productId, (shop.get(meal.productId) ?? 0) + grams);
      }
    }
  };
  plan.days.forEach(walk);

  // Treats are a budget, not a bag: one pack is the honest line.
  const treats = CATALOGUE.find(
    (p) => p.category === 'treats' && (p.species === pet.species || p.species === 'both') && p.verified.price,
  );
  return { shop, home, treatId: treats?.id ?? null, treatKcal: plan.treatKcal };
}

/** Grams as a shopping quantity — kilos once there are enough of them. */
const weigh = (grams: number) =>
  grams >= 1000 ? `${(round50(grams) / 1000).toFixed(2)} kg` : `${round50(grams)} g`;

/**
 * ONE LIST FOR EVERY PET IN THE HOUSE.
 *
 * Pets without a plan are skipped rather than guessed at — a pet with no weight
 * has no calorie target, and the planner already says so on its own page.
 */
export function shoppingForHousehold(
  entries: { pet: Pet; plan: NutritionPlan }[],
): ShoppingItem[] {
  const needs = entries.map(({ pet, plan }) => ({ pet, need: needsOf(pet, plan) }));

  /* product id → total grams, the pets it is for, and whether any of them could
     only be described in packs. `packOnly` is counted rather than flagged so
     the wording can say how many of the house it applies to. */
  const shop = new Map<string, { grams: number; packOnly: number; shares: ShoppingShare[] }>();
  const home = new Map<string, { grams: number; shares: ShoppingShare[] }>();
  const treats = new Map<string, { kcal: number; shares: ShoppingShare[] }>();

  for (const { pet, need } of needs) {
    for (const [id, grams] of need.shop) {
      const row = shop.get(id) ?? { grams: 0, packOnly: 0, shares: [] };
      row.grams += grams;
      if (grams <= 0) row.packOnly += 1;
      row.shares.push({ petId: pet.id, name: pet.name, qty: grams > 0 ? weigh(grams) : '1 pack' });
      shop.set(id, row);
    }
    for (const [label, grams] of need.home) {
      const row = home.get(label) ?? { grams: 0, shares: [] };
      row.grams += grams;
      row.shares.push({ petId: pet.id, name: pet.name, qty: weigh(grams) });
      home.set(label, row);
    }
    if (need.treatId) {
      const row = treats.get(need.treatId) ?? { kcal: 0, shares: [] };
      /* The ceiling is per animal and does not add up across them — the number
         shown is the largest, so the line never suggests a bigger allowance
         than any one pet actually has. */
      row.kcal = Math.max(row.kcal, need.treatKcal);
      row.shares.push({ petId: pet.id, name: pet.name, qty: `up to ${need.treatKcal} kcal a day` });
      treats.set(need.treatId, row);
    }
  }

  const items: ShoppingItem[] = [];

  for (const [id, row] of shop) {
    const product = byId.get(id);
    if (!product) continue;
    /* A total in grams where at least one pet's share is known, plus a named
       pack where one was not. Saying only "1 pack" would lose a kilo somebody
       has to buy; saying only the grams would hide that part of it is a guess. */
    const known = row.grams > 0 ? `${weigh(row.grams)} for the month` : '';
    const packs = row.packOnly > 0 ? `1 pack — ${product.packSizes[0] ?? 'see pack'}` : '';
    items.push({
      id: `shop-${id}`,
      label: fullName(product),
      qty: [known, packs].filter(Boolean).join(' · ') || `1 pack — ${product.packSizes[0] ?? 'see pack'}`,
      source: 'together-city',
      productId: id,
      checked: false,
      custom: false,
      forPets: row.shares,
    });
  }

  for (const [label, row] of home) {
    items.push({
      id: `home-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label,
      qty: weigh(row.grams),
      source: 'home-kitchen',
      productId: null,
      checked: false,
      custom: false,
      forPets: row.shares,
    });
  }

  for (const [id, row] of treats) {
    const product = byId.get(id);
    /* Skip a treat the plan already buys as a meal — the two loops share an id
       scheme, and two lines for one pack is a person buying two packs. */
    if (!product || shop.has(id)) continue;
    items.push({
      id: `shop-${id}`,
      label: fullName(product),
      qty: `1 pack · keep inside ${row.kcal} kcal a day`,
      source: 'together-city',
      productId: id,
      checked: false,
      custom: false,
      forPets: row.shares,
    });
  }

  return items;
}
