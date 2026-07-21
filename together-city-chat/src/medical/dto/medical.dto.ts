import { z } from 'zod';

/** A blood-test panel entered/imported into the Medical Hub (the source of truth). */
export const SaveBloodTestSchema = z.object({
  takenOn: z.string().datetime().optional(),
  lab: z.string().max(120).optional(),
  // When the panel comes from (or corrects) an uploaded report, link it to that
  // stored document so there's one record shared by both Medical Hub pages.
  recordId: z.string().uuid().optional(),
  values: z.object({
    hb: z.number().positive().max(25).optional(),
    ferritin: z.number().positive().max(2000).optional(),
    vitd: z.number().positive().max(300).optional(),
    b12: z.number().positive().max(3000).optional(),
    folate: z.number().positive().max(60).optional(),
    hba1c: z.number().positive().max(20).optional(),
    ldl: z.number().positive().max(400).optional(),
    trig: z.number().positive().max(2000).optional(),
    crp: z.number().min(0).max(400).optional(),
  }).refine((v) => Object.keys(v).length > 0, { message: 'enter at least one marker' }),
});
export type SaveBloodTestDto = z.infer<typeof SaveBloodTestSchema>;
