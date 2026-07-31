import { FORBIDDEN_BY_DIET, tagsForIngredient, type DietKey, type DietTag } from './diet-tags';
import { auditRecipe } from './nutrition-qa';

/**
 * A citizen's own recipe, turned into a row the rest of the app can trust.
 *
 * The founder's decision was: compute the nutrition from the ingredients, and
 * let the citizen override it when they have a packet in front of them — and
 * let their own dishes into the AI planner's pool. That second half is what
 * makes this file careful. A dish that only ever appeared in a list they built
 * by hand could be taken on trust. A dish the planner may serve them on a
 * Tuesday cannot: it has to clear the same gates a corpus recipe clears.
 *
 * Nothing here is new machinery. auditRecipe is the same ingredient-level audit
 * that validates all 12,976 corpus recipes at boot, and the diet tags are the
 * same ones diet-integrity.spec.ts holds the corpus to. This module decides
 * which of their answers to believe, and says so.
 */

export interface OwnIngredient { name: string; grams: number }

export interface OwnRecipeInput {
  name: string;
  country: string;
  slot: string;                 // b | l | s | d
  minutes: number;
  servings: number;
  ingredients: OwnIngredient[];
  /** Optional. Accepted only as a complete set — a half-filled override would
   *  leave three real numbers beside two invented ones. */
  nutrition?: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
}

export interface OwnRecipeNutrition {
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  servings: number; gramsPerServing: number;
}

export type OwnRecipeBuild =
  | {
      ok: true;
      /** The row to persist. `diet` is derived, never taken from the citizen. */
      row: OwnRecipeNutrition & { diet: DietKey; nutritionSource: 'computed' | 'author'; coveragePct: number };
      /** What the ingredients say, always, even when the override wins — so the
       *  citizen can be shown both and told which one is on the plate. */
      computed: OwnRecipeNutrition | null;
      /** Plain-language things worth telling them. Never silent. */
      notes: string[];
    }
  | { ok: false; reason: string };

/**
 * The labels a Recipe row may carry, most restrictive first.
 *
 * Most restrictive that is still TRUE. A dal with no onion is labelled vegan
 * rather than veg, and a paneer curry with no onion is labelled jain rather
 * than veg, because both are accurate and the library's diet filter widens
 * downward — dietDbValues('vegetarian') already includes vegan, jainvegan and
 * jain. Labelling loosely would hide the dish from the people it suits.
 */
const LABEL_ORDER: DietKey[] = ['jainvegan', 'jain', 'vegan', 'veg', 'egg', 'pesc', 'nonveg'];

/**
 * The dish's diet, read off its ingredients.
 *
 * The citizen is never asked. A label is a claim and the ingredients are the
 * dish — and this dish can end up in a generated week, so a wrong claim would
 * put chicken in front of somebody who told us they do not eat it.
 */
export function deriveDiet(ingredientNames: readonly string[]): DietKey {
  const present = new Set<DietTag>();
  for (const name of ingredientNames) for (const tag of tagsForIngredient(name)) present.add(tag);
  for (const key of LABEL_ORDER) {
    if (FORBIDDEN_BY_DIET[key].every((tag) => !present.has(tag))) return key;
  }
  return 'nonveg';
}

/** Batch totals for a set of stored figures, so both branches speak the same units. */
function asQa(input: OwnRecipeInput, stored: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }) {
  const totalGrams = input.ingredients.reduce((s, i) => s + Math.max(0, i.grams), 0);
  return {
    id: 'new', name: input.name, slot: input.slot,
    kcal: stored.kcal, protein: stored.protein, carbs: stored.carbs, fat: stored.fat, fiber: stored.fiber,
    servings: Math.max(1, Math.round(input.servings)),
    gramsPerServing: Math.max(1, Math.round(totalGrams / Math.max(1, Math.round(input.servings)))),
    ingredients: input.ingredients.map((i) => ({ name: i.name, grams: Math.max(0, i.grams) })),
  };
}

const ZERO = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

export function buildOwnRecipe(input: OwnRecipeInput): OwnRecipeBuild {
  const names = input.ingredients.map((i) => i.name);
  if (!input.ingredients.length) return { ok: false, reason: 'A recipe needs at least one ingredient.' };
  if (input.ingredients.some((i) => i.grams <= 0)) {
    return { ok: false, reason: 'Every ingredient needs a quantity — that is what the nutrition is worked out from.' };
  }

  const notes: string[] = [];
  const diet = deriveDiet(names);

  // Pass 1 — the ingredients alone. Stored values are zero on purpose: with
  // nothing to defer to, a coverage of 0.6 or better means the answer is
  // genuinely ingredient-derived, and anything less returns nothing at all
  // rather than the zeros it was handed.
  const fromIngredients = auditRecipe(asQa(input, ZERO));
  const coveragePct = Math.round(fromIngredients.coverage * 100);
  const computed: OwnRecipeNutrition | null =
    fromIngredients.coverage >= 0.6 && fromIngredients.fix && fromIngredients.fix.kcal > 0
      ? { ...fromIngredients.fix }
      : null;

  if (!computed) {
    notes.push(
      `We could only recognise ${coveragePct}% of these ingredients, so we can't work the nutrition out ourselves.`,
    );
  }

  // Pass 2 — their numbers, if they gave any. Run through the same audit so an
  // override still gets Atwater-normalised and clamped: a citizen may know what
  // the packet says, and may still mistype it.
  let authored: OwnRecipeNutrition | null = null;
  if (input.nutrition) {
    const r = auditRecipe(asQa(input, input.nutrition));
    // A high-coverage audit ignores stored values and answers from the
    // ingredients, which is not what an override is for — so take the citizen's
    // figures and only borrow the serving arithmetic.
    const q = asQa(input, input.nutrition);
    authored = {
      kcal: input.nutrition.kcal, protein: input.nutrition.protein, carbs: input.nutrition.carbs,
      fat: input.nutrition.fat, fiber: input.nutrition.fiber,
      servings: q.servings, gramsPerServing: q.gramsPerServing,
    };
    for (const issue of r.issues) notes.push(issue);
    if (computed && Math.abs(computed.kcal - authored.kcal) / Math.max(1, computed.kcal) > 0.25) {
      notes.push(
        `Your figure of ${authored.kcal} kcal is a long way from the ${computed.kcal} kcal these ingredients come to. `
        + 'Yours is what we will use — worth a second look at the quantities.',
      );
    }
  }

  const chosen = authored ?? computed;
  if (!chosen) {
    return {
      ok: false,
      reason:
        `We couldn't work out the nutrition from these ingredients — only ${coveragePct}% of them are in our table. `
        + 'Add the calories and macros yourself and we\'ll save it.',
    };
  }

  return {
    ok: true,
    row: {
      ...chosen,
      diet,
      nutritionSource: authored ? 'author' : 'computed',
      coveragePct,
    },
    computed,
    notes,
  };
}
