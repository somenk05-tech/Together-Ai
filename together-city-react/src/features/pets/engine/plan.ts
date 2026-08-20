/**
 * ── THE PLAN BUILDER ────────────────────────────────────────────────────────
 *
 * Turns one pet into a day and then into a week. Everything it knows about
 * calories comes from `nutrition.ts`; everything it knows about food comes from
 * the catalogue and the recipe file. It invents nothing.
 *
 * THE SPLIT ACROSS MEALS IS EVEN, AND THAT IS A DECISION. A dog on two meals
 * gets 50/50; a puppy on four gets four quarters. Sources that recommend
 * front-loading the day are not unanimous and none of them was verifiable, so
 * the engine does the defensible thing and the UI lets the owner move it.
 *
 * A DAY IS BUILT FROM WHAT THE OWNER SAID THEY FEED. `dietStyle` is honoured
 * literally: commercial means every meal is a complete diet; home-cooked means
 * the plan is built from recipes AND carries the complementary warning on every
 * card, because a plan made entirely of toppers is not a diet; mixed means the
 * complete diet carries the day and home food rides along inside the 10%.
 *
 * REGENERATION IS SEEDED BY THE DATE AND THE PET, not by Math.random. Two
 * openings of the same week produce the same week — a planner that reshuffles
 * itself when you look at it twice is not a planner.
 */

import type { DayPlan, MealSlot, NutritionPlan, Pet, Product, Recipe } from '../types';
import { energyFor, mealsPerDay, mealTimes, portionFor, readAge, treatAllowance, waterMl } from './nutrition';
import { RECIPES } from '../data/recipes';
import { FOOD } from '../data/composition';
import { CATALOGUE } from '../data/catalogue';
import { fullName } from './naming';

/** Deterministic 32-bit hash — the seed for anything that looks random here. */
function seed(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pick = <T,>(list: T[], n: number): T => list[n % list.length];

export const ISO = (d: Date) => d.toISOString().slice(0, 10);

/** Calories in 100 g of a recipe as made, from the composition table. */
export function recipeKcalPer100g(recipe: Recipe): number | null {
  let total = 0;
  for (const item of recipe.items) {
    const food = FOOD.get(item.food);
    if (!food || food.kcal === null) return null;
    total += food.kcal * item.share;
  }
  return Math.round(total);
}

/** Grams of a recipe that deliver a calorie target. Null when we cannot say. */
export function recipeGramsFor(recipe: Recipe, kcal: number): number | null {
  const per100 = recipeKcalPer100g(recipe);
  if (!per100) return null;
  return Math.round((kcal / per100) * 100);
}

/** Foods this pet must not be offered, from its own allergy and restriction
 *  list. Matching is on words, which is blunt and errs toward excluding. */
function excludes(pet: Pet): string[] {
  return [...pet.allergies, ...pet.sensitivities, ...pet.restrictions]
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

export function recipeAllowed(recipe: Recipe, pet: Pet): boolean {
  const bad = excludes(pet);
  if (!bad.length) return true;
  const hay = `${recipe.name} ${recipe.items.map((i) => i.label).join(' ')} ${recipe.tags.join(' ')}`.toLowerCase();
  return !bad.some((b) => b.length > 2 && hay.includes(b));
}

export function productAllowed(product: Product, pet: Pet): boolean {
  const bad = excludes(pet);
  if (!bad.length) return true;
  const hay = `${product.name} ${product.mainProtein ?? ''} ${product.keyIngredients ?? ''}`.toLowerCase();
  return !bad.some((b) => b.length > 2 && hay.includes(b));
}

/**
 * How well a complete diet fits this pet, for ORDERING the staple pool.
 *
 * Deliberately a local, four-line ranking rather than a call into
 * `recommend.ts`: that module already imports `productAllowed` from this one,
 * and a planner that cannot be loaded without the shop is a worse trade than
 * four lines of duplication. The shop's scoring stays the richer one.
 */
function stapleRank(product: Product, pet: Pet): number {
  const hay = `${product.name} ${product.breedSize} ${product.subcategory}`.toLowerCase();
  const kg = pet.weightKg ?? 0;
  const size = pet.species === 'cat' ? 'small' : kg >= 25 ? 'large' : kg >= 10 ? 'medium' : 'small';
  let n = 0;
  if (pet.breed && hay.includes(pet.breed.split(' ')[0].toLowerCase())) n += 4;   // breed-specific line
  if (size === 'large' && /large|maxi/.test(hay)) n += 2;
  if (size === 'medium' && /medium/.test(hay)) n += 2;
  if (size === 'small' && /small|mini|toy/.test(hay)) n += 2;
  if (pet.goal === 'weight-loss' && /light|satiety|weight/.test(hay)) n += 3;
  if (product.verified.nutrition) n += 2;   // we can portion it in grams
  if (product.verified.price) n += 1;
  return n;
}

/** The complete diets in the catalogue this pet could actually eat, best first. */
export function stapleFoods(pet: Pet): Product[] {
  const age = readAge(pet);
  return CATALOGUE.filter((p) => {
    if (p.category !== 'food') return false;
    if (p.species !== pet.species && p.species !== 'both') return false;
    if (p.lifeStage !== 'all') {
      if (age.stage === 'puppy' && p.lifeStage !== 'puppy') return false;
      if (age.stage === 'kitten' && p.lifeStage !== 'kitten') return false;
      if (age.stage === 'adult' && !['adult', 'all'].includes(p.lifeStage)) return false;
      if (age.stage === 'senior' && !['senior', 'adult', 'all'].includes(p.lifeStage)) return false;
    }
    return productAllowed(p, pet);
  }).sort((a, b) => stapleRank(b, pet) - stapleRank(a, pet));
}

function mealTitle(kind: 'complete' | 'complementary', staple: Product | null, recipe: Recipe | null): string {
  if (kind === 'complete') return staple ? fullName(staple) : 'Complete and balanced food';
  return recipe ? recipe.name : 'Home-cooked topper';
}

/**
 * ONE DAY. `dayIndex` walks the week so that Tuesday is not Monday again.
 */
export function buildDay(pet: Pet, date: Date, dayIndex: number): DayPlan {
  const energy = energyFor(pet, date);
  const count = mealsPerDay(pet, date);
  const times = mealTimes(count);
  const treat = treatAllowance(energy.merKcal);
  const mealBudget = energy.merKcal - treat;
  const perMeal = Math.round(mealBudget / count);

  const staples = stapleFoods(pet);
  const recipes = RECIPES.filter((r) => (r.species === pet.species || r.species === 'both') && recipeAllowed(r, pet));

  /**
   * VARIETY COMES FROM ROTATION, NOT FROM RANDOMNESS.
   *
   * The first version seeded each day independently, and a hash that changes
   * daily still lands on the same list index often enough that the week showed
   * one breakfast seven times and the same dinner five days running. Stepping a
   * single per-pet seed by the day index walks the pool instead, so the week
   * cycles through what is actually available and still rebuilds identically
   * every time it is opened.
   *
   * The pool is capped at the five best-fitting diets: rotating through all
   * fifteen would put a Poodle formulation in a Labrador's Thursday.
   */
  const base = seed(pet.id);
  const pool = staples.slice(0, 5);

  const homeMeals =
    pet.dietStyle === 'home-cooked' ? count
    : pet.dietStyle === 'mixed' ? 1
    : 0;

  const meals: MealSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    const slot: MealSlot['slot'] = i === 0 ? 'breakfast' : i === count - 1 ? 'dinner' : 'lunch';
    const home = i > 0 && i <= homeMeals;
    const recipe = home && recipes.length ? pick(recipes, base + dayIndex * 2 + i) : null;
    const staple = pool.length ? pick(pool, base + dayIndex) : null;

    const kind: 'complete' | 'complementary' = recipe ? 'complementary' : 'complete';
    const grams = recipe
      ? recipeGramsFor(recipe, perMeal)
      : portionFor(perMeal, staple?.nutrition.kcalPerKg ?? null);

    meals.push({
      id: `${ISO(date)}-${slot}-${i}`,
      slot,
      time: times[i] ?? times[times.length - 1],
      title: mealTitle(kind, staple, recipe),
      detail: recipe
        ? recipe.items.map((it) => it.label).join(' · ')
        : staple
          ? `${staple.subcategory || 'Complete and balanced'} · ${staple.packSizes[0] ?? 'see pack'}`
          : 'Choose a complete and balanced food for this meal',
      grams,
      kcal: perMeal,
      kind,
      recipeId: recipe?.id ?? null,
      productId: recipe ? null : staple?.id ?? null,
      done: false,
    });
  }

  return { date: ISO(date), meals, treatKcal: treat, waterMl: waterMl(pet) };
}

/** Seven days from `from`, inclusive. */
export function buildPlan(pet: Pet, from = new Date()): NutritionPlan {
  const energy = energyFor(pet, from);
  const days: DayPlan[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    days.push(buildDay(pet, d, i));
  }

  const age = readAge(pet, from);
  const cautions: string[] = [];
  if (age.stage === 'puppy' || age.stage === 'kitten') {
    cautions.push('Growing animals have the least room for error in a diet. Anything other than a complete and balanced growth food should be agreed with your vet first.');
  }
  if (pet.goal === 'weight-loss' && pet.species === 'cat') {
    cautions.push('Cats must never be crash-dieted. Rapid weight loss can trigger hepatic lipidosis, which is life-threatening. Any feline weight plan belongs with your vet.');
  }
  if (pet.dietStyle !== 'commercial') {
    cautions.push('Home-cooked meals in this plan are complementary. They are not nutritionally complete on their own.');
  }
  if (pet.healthNotes.trim()) {
    cautions.push('You noted a health concern on this profile. A pet with a medical condition needs a diet their vet has agreed to — this plan is general guidance only.');
  }

  return {
    petId: pet.id,
    createdAt: new Date(from).toISOString(),
    rerKcal: energy.rerKcal,
    merKcal: energy.merKcal,
    factor: energy.factor,
    factorReason: energy.factorLabel,
    mealsPerDay: mealsPerDay(pet, from),
    treatKcal: treatAllowance(energy.merKcal),
    waterMl: waterMl(pet),
    proteinNote:
      pet.species === 'cat'
        ? 'Cats are obligate carnivores: they need taurine, arachidonic acid and preformed vitamin A from animal tissue, which plant protein cannot supply.'
        : 'Dogs are omnivores and digest a mixed diet well, but protein quality still decides how much of it they can actually use.',
    avoid: [...pet.allergies, ...pet.sensitivities, ...pet.restrictions].filter(Boolean),
    cautions,
    days,
  };
}

/** Swap one meal for the next allowed alternative — the regenerate button. */
export function regenerateMeal(pet: Pet, day: DayPlan, mealId: string, bump: number): DayPlan {
  const recipes = RECIPES.filter((r) => (r.species === pet.species || r.species === 'both') && recipeAllowed(r, pet));
  const staples = stapleFoods(pet);
  return {
    ...day,
    meals: day.meals.map((m) => {
      if (m.id !== mealId) return m;
      const n = seed(pet.id, m.id, bump);
      if (m.kind === 'complementary' && recipes.length) {
        const recipe = pick(recipes, n);
        return {
          ...m,
          title: recipe.name,
          detail: recipe.items.map((it) => it.label).join(' · '),
          grams: m.kcal ? recipeGramsFor(recipe, m.kcal) : null,
          recipeId: recipe.id,
          productId: null,
        };
      }
      if (staples.length) {
        const staple = pick(staples, n);
        return {
          ...m,
          title: fullName(staple),
          detail: `${staple.subcategory || 'Complete and balanced'} · ${staple.packSizes[0] ?? 'see pack'}`,
          grams: m.kcal ? portionFor(m.kcal, staple.nutrition.kcalPerKg) : null,
          productId: staple.id,
          recipeId: null,
        };
      }
      return m;
    }),
  };
}
