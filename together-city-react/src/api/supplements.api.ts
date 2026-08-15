import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/api/http';

/**
 * THE SUPPLEMENT PLAN, ON THE WIRE.
 *
 * OPTIONAL, AND NEVER `.default()`. A defaulted field makes zod's INPUT type
 * differ from its OUTPUT type, and `apiGet<T>(url, schema: ZodType<T>)` has one
 * T for both — so the plan comes back typed as the input side and every screen
 * reading it stops type-checking. The daybook learned this the same way. The
 * screens say `?? []`, which they would anyway.
 *
 * Read-only, and there is no mutation in this file on purpose: nothing the
 * browser sends can become a recommendation. The engine derives everything
 * server-side from the citizen's own hubs and resolves it against a cited
 * knowledge base, so the only thing crossing the wire is the answer.
 *
 * EVERY FIELD IS OPTIONAL WHERE IT SAFELY CAN BE, for the reason
 * the daybook's schema learned: web and API deploy independently. The two that
 * are NOT optional are `bucket` and `dose` — a plan whose bucket failed to
 * parse would render a refusal as a suggestion, and that is the one direction
 * this screen may never fail in.
 */
export const ReasonSchema = z.object({
  from: z.enum(['lab', 'diet', 'goal', 'fitness', 'medicine', 'population', 'evidence']),
  text: z.string(),
  source: z.string().nullable().optional(),
});
export const FlagSchema = z.object({
  kind: z.enum(['interaction', 'condition', 'upper-limit', 'harm', 'duplicate']),
  text: z.string(),
  source: z.string().nullable().optional(),
});
export const RecommendationSchema = z.object({
  id: z.string(),
  name: z.string(),
  bucket: z.enum(['priority', 'consider', 'optional', 'not-recommended']),
  grade: z.enum(['strong', 'moderate', 'emerging', 'null-or-harm']),
  gradeFor: z.string().optional(),
  form: z.string().optional(),
  /** Null is a real answer: a clinician sets this one, not the app. */
  dose: z.string().nullable(),
  upperLimit: z.string().optional(),
  needsClinician: z.boolean().optional(),
  testFirst: z.boolean().optional(),
  why: z.array(ReasonSchema).optional(),
  flags: z.array(FlagSchema).optional(),
  fit: z.object({
    score: z.number(),
    parts: z.array(z.object({ label: z.string(), note: z.string() })).optional(),
  }).optional(),
  source: z.string().optional(),
});
export const PlanSchema = z.object({
  plan: z.array(RecommendationSchema),
  watching: z.array(ReasonSchema).optional(),
  source: z.object({
    title: z.string(), edition: z.string().optional(),
    reviewed: z.string().optional(), assessed: z.number().optional(),
    note: z.string().optional(),
  }),
  basis: z.object({
    bloodWork: z.object({ takenOn: z.string().nullable(), granted: z.boolean() }).nullable(),
    medicines: z.number().optional(),
    diet: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
  }).optional(),
});
export type SupplementPlan = z.infer<typeof PlanSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Bucket = Recommendation['bucket'];

export function useSupplementPlan() {
  return useQuery({
    queryKey: ['fitness', 'supplements'],
    queryFn: () => apiGet('/fitness/supplements', PlanSchema),
  });
}
