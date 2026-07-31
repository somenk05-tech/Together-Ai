import { z } from 'zod';

/**
 * What a citizen may tell us about their own dish.
 *
 * Note what is NOT here: `diet`. The label is derived from the ingredients in
 * own-recipe.ts and is not a field anybody can set. These recipes reach the AI
 * planner's pool, so a typed label would be a way to get chicken past somebody
 * else's diet — the one place a form field could do real harm.
 */
export const OwnRecipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  grams: z.number().int().min(1).max(5000),
});

const NutritionSchema = z.object({
  kcal: z.number().int().min(1).max(20_000),
  protein: z.number().min(0).max(2000),
  carbs: z.number().min(0).max(2000),
  fat: z.number().min(0).max(2000),
  fiber: z.number().min(0).max(500),
});

export const OwnRecipeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(60).default('Home'),
  slot: z.enum(['b', 'l', 's', 'd']),
  minutes: z.number().int().min(1).max(600).default(30),
  servings: z.number().int().min(1).max(20).default(1),
  ingredients: z.array(OwnRecipeIngredientSchema).min(1).max(40),
  steps: z.array(z.string().trim().max(400)).max(20).default([]),
  /** All five or none — a half-filled override would leave three real numbers
   *  standing beside two invented ones, and nothing downstream could tell. */
  nutrition: NutritionSchema.optional(),
});
export type OwnRecipeDto = z.infer<typeof OwnRecipeSchema>;
