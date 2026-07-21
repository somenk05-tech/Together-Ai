import { z } from 'zod';

/** A blood-test panel entered/imported into the Medical Hub (the source of truth). */
export const SaveBloodTestSchema = z.object({
  takenOn: z.string().datetime().optional(),
  lab: z.string().max(120).optional(),
  // When the panel comes from (or corrects) an uploaded report, link it to that
  // stored document so there's one record shared by both Medical Hub pages.
  recordId: z.string().uuid().optional(),
  // Comprehensive manual entry: any of the cataloged biomarkers, keyed by code.
  // Non-negative, high-precision (decimals preserved — Float storage). Unknown
  // keys are dropped by the service; at least one real value is required.
  values: z.record(z.string(), z.number().nonnegative().max(1_000_000))
    .refine((v) => Object.values(v).some((n) => typeof n === 'number'), { message: 'enter at least one marker' }),
});
export type SaveBloodTestDto = z.infer<typeof SaveBloodTestSchema>;
