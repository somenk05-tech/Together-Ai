import { z } from 'zod';

/**
 * Food Journal contracts. Items are AI ESTIMATES the citizen has reviewed —
 * bounded hard here so neither a hallucinating model nor a hand-edited request
 * can log a 90,000-kcal apple. Totals are never accepted from the client at
 * all: the service sums the items itself.
 */

export const JournalItemSchema = z.object({
  name: z.string().min(1).max(80),
  qty: z.number().positive().max(50),
  unit: z.string().min(1).max(20),
  grams: z.number().positive().max(5000).optional(),
  kcal: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  carbG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(500),
  fibreG: z.number().min(0).max(200).optional(),
  sugarG: z.number().min(0).max(500).optional(),
  sodiumMg: z.number().min(0).max(20000).optional(),
  waterMl: z.number().min(0).max(3000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type JournalItemDto = z.infer<typeof JournalItemSchema>;

export const MEAL_TYPES = ['breakfast', 'morning-snack', 'lunch', 'evening-snack', 'dinner', 'other'] as const;

export const AnalyzeMealSchema = z.object({
  // A data-URL or bare base64 of one meal photo. ~7 MB of base64 ≈ a 5 MB
  // photo — the client downscales before sending, this is the backstop.
  photo: z.string().max(7_000_000).optional(),
  mediaType: z.string().max(60).optional(),
  text: z.string().max(800).optional(),
}).refine((v) => Boolean(v.photo) || Boolean(v.text?.trim()), { message: 'Add a photo or describe the meal first.' });
export type AnalyzeMealDto = z.infer<typeof AnalyzeMealSchema>;

export const LogMealSchema = z.object({
  at: z.string().datetime().optional(),
  mealType: z.enum(MEAL_TYPES),
  source: z.enum(['photo', 'text', 'voice', 'plan', 'manual']),
  items: z.array(JournalItemSchema).min(1).max(20),
  photoUrl: z.string().max(200000).optional(),
  note: z.string().max(400).optional(),
});
export type LogMealDto = z.infer<typeof LogMealSchema>;

export const UpdateMealSchema = z.object({
  items: z.array(JournalItemSchema).min(1).max(20),
});
export type UpdateMealDto = z.infer<typeof UpdateMealSchema>;
