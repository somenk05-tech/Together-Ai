import { z } from 'zod';

/** Planner mode — one plan for the user, or family (shared mains). */
export const PlanModeSchema = z.enum(['individual', 'family']);
export type PlanMode = z.infer<typeof PlanModeSchema>;

/** Diet identity — mirrors the vanilla site's colour-coded diet tabs. */
export const DietSchema = z.enum(['everything', 'veg', 'nonveg', 'pesc', 'egg', 'vegan', 'jain']);
export type Diet = z.infer<typeof DietSchema>;

/** Meal slot — breakfast / lunch / snack / dinner. */
export const SlotSchema = z.enum(['b', 'l', 's', 'd']);
export type Slot = z.infer<typeof SlotSchema>;

export const RegenerateSchema = z.object({ mode: PlanModeSchema.optional() });
export type RegenerateDto = z.infer<typeof RegenerateSchema>;

export const SwapSchema = z.object({ slot: SlotSchema });
export type SwapDto = z.infer<typeof SwapSchema>;

export const SidesSchema = z.object({
  slot: SlotSchema,
  sides: z.object({
    rice: z.number().int().min(0).max(6),
    roti: z.number().int().min(0).max(6),
    curd: z.number().int().min(0).max(6),
    salad: z.number().int().min(0).max(6),
  }),
});
export type SidesDto = z.infer<typeof SidesSchema>;

export const AddToCartSchema = z.object({ planKey: z.string().optional() });
export type AddToCartDto = z.infer<typeof AddToCartSchema>;

/** Blood panel input — key markers Nutrition personalises against.
 *  Medical Hub remains the long-term source of truth; this mirrors into it. */
export const BloodInputSchema = z.object({
  hb: z.number().positive().max(25).optional(),        // hemoglobin g/dL
  vitd: z.number().positive().max(300).optional(),     // vitamin D 25-OH ng/mL
  b12: z.number().positive().max(3000).optional(),     // vitamin B12 pg/mL
  folate: z.number().positive().max(50).optional(),    // serum folate ng/mL
  ferritin: z.number().positive().max(5000).optional(),// ferritin ng/mL
  hba1c: z.number().positive().max(20).optional(),     // HbA1c %
  ldl: z.number().positive().max(400).optional(),      // LDL mg/dL
  trig: z.number().positive().max(2000).optional(),    // triglycerides mg/dL
  crp: z.number().nonnegative().max(500).optional(),   // C-reactive protein mg/L
});
export type BloodInputDto = z.infer<typeof BloodInputSchema>;

/** Update the user's food preferences / body stats (feeds Mifflin-St Jeor targets). */
export const FoodPrefSchema = z.object({
  diet: DietSchema.optional(),
  goal: z.enum(['lose', 'maintain', 'gain']).optional(),
  heightCm: z.number().int().min(80).max(250).optional(),
  weightKg: z.number().int().min(25).max(400).optional(),
  age: z.number().int().min(10).max(120).optional(),
  sex: z.enum(['male', 'female']).optional(),
  activity: z.number().min(1.2).max(2.2).optional(),
});
export type FoodPrefDto = z.infer<typeof FoodPrefSchema>;
