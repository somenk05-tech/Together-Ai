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
  /**
   * NO BLOOD WORK, NO PLAN — owner's call, 29 Aug. `true` means the server
   * built nothing and the screen renders the gate.
   *
   * OPTIONAL, AND THE DEFAULT IS THE UNGATED ONE, which is the safe direction
   * here and only here: web and API deploy independently, so a browser on the
   * new build talking to the old server must not gate a plan that server
   * actually built. The list is empty when it is gated, so the wrong guess
   * costs a heading, never a recommendation.
   */
  gated: z.boolean().optional(),
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

/* ── THE MULTIVITAMIN ASSESSMENT ────────────────────────────────────────────
   A different question from the plan, on its own wire.

   THE SAME SCHEMA DISCIPLINE, and one addition. `state` is required for the
   same reason `bucket` is: a state that failed to parse would render a
   clinician-review card as an ordinary one, and that is the single direction
   this screen may never fail in. Everything else is optional, because web and
   API deploy independently and a browser on the new build must still render
   something honest against an older server.

   THERE IS NO MUTATION HERE EITHER, and on this screen there is no purchase
   either — no bag, no price that leads anywhere, no add. The plan page may
   sell what it recommends precisely because it can never sell what it refuses;
   this screen is mostly refusals, so it sells nothing at all. */

const ScoreSchema = z.object({
  value: z.number(),
  parts: z.array(z.object({ label: z.string(), note: z.string(), delta: z.number().optional() })).optional(),
});

export const MvFlagSchema = z.object({
  kind: z.enum(['interaction', 'condition', 'upper-limit', 'harm', 'duplicate', 'unknown-composition', 'regulatory']),
  text: z.string(),
  source: z.string().nullable().optional(),
  hard: z.boolean().optional(),
});

export const AssessmentSchema = z.object({
  formulationId: z.string(),
  brand: z.string(),
  productName: z.string(),
  /** REQUIRED. See the note above. */
  state: z.enum(['appropriate', 'may-be-considered', 'test-first', 'no-clear-benefit', 'clinician-review']),
  evidence: ScoreSchema,
  personalFit: ScoreSchema,
  safety: ScoreSchema,
  regulatory: z.object({
    implied: z.enum(['health-supplement', 'above-the-food-ceiling', 'indeterminate']),
    channel: z.enum(['food-otc', 'drug-otc', 'drug-rx', 'UNKNOWN']),
    mismatch: z.boolean(),
    text: z.string(),
    basis: z.string().optional(),
    exceedances: z.array(z.object({
      nutrientId: z.string(), name: z.string(), amount: z.number(),
      unit: z.string(), times: z.number(), harmCapable: z.boolean().optional(),
    })).optional(),
  }).optional(),
  why: z.array(z.string()).optional(),
  whyNot: z.array(z.string()).optional(),
  missing: z.array(z.string()).optional(),
  wouldSettle: z.array(z.string()).optional(),
  flags: z.array(MvFlagSchema).optional(),
  doses: z.array(z.object({
    nutrientId: z.string(), name: z.string(), amount: z.number(), unit: z.string(),
    band: z.object({
      band: z.enum(['token', 'nutritional', 'above-indian-ceiling', 'above-upper-limit', 'unknown']),
      pctOfRequirement: z.number().nullable(),
      text: z.string(),
    }),
  })).optional(),
  monitoring: z.array(z.object({
    nutrientId: z.string(), name: z.string(),
    baselineTest: z.string().nullable(),
    alongside: z.string().optional(),
    markerLimitation: z.string().optional(),
    monitor: z.enum(['none', 'consider', 'retest', 'medical']),
    initialWeeks: z.tuple([z.number(), z.number()]).nullable(),
    initialWhy: z.string().optional(),
    retestSource: z.string().optional(),
    insteadWatch: z.string().optional(),
    afterRetest: z.array(z.object({ outcome: z.string(), then: z.string() })).optional(),
    stopRules: z.array(z.string()).optional(),
  })).optional(),
});

export const MultivitaminSchema = z.object({
  /** Same safe direction as the plan's: default to the ungated read, because
   *  the assessment list is empty when gated and a wrong guess costs a heading
   *  rather than a recommendation. */
  gated: z.boolean().optional(),
  gateText: z.string().optional(),
  verdict: z.string(),
  assessments: z.array(AssessmentSchema).optional(),
  watching: z.array(z.object({ marker: z.string(), why: z.string() })).optional(),
  interlock: z.object({
    blocked: z.boolean(),
    biotinMcgPerDay: z.number(),
    from: z.array(z.string()).optional(),
    text: z.string(),
    source: z.string().optional(),
  }).optional(),
  category: z.array(z.object({ finding: z.string(), detail: z.string() })).optional(),
  trialLength: z.array(z.object({
    outcome: z.string(), weeks: z.tuple([z.number(), z.number()]),
    note: z.string(), source: z.string(),
  })).optional(),
  basis: z.object({
    bloodWork: z.object({ takenOn: z.string().nullable(), granted: z.boolean() }).nullable(),
    medicines: z.number().optional(),
    diet: z.string().nullable().optional(),
    smoker: z.boolean().nullable().optional(),
    pregnant: z.boolean().nullable().optional(),
  }).optional(),
});

export type MultivitaminAnswer = z.infer<typeof MultivitaminSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type AssessmentState = Assessment['state'];

export function useMultivitaminAssessment() {
  return useQuery({
    queryKey: ['fitness', 'multivitamins'],
    queryFn: () => apiGet('/fitness/multivitamins', MultivitaminSchema),
  });
}
