import { z } from 'zod';

/**
 * ── A PLAN OF YOUR OWN (owner, 18 Sep) ──────────────────────────────────────
 *
 * "The user can add the workouts to create his own plan for the day or week
 * and save those plans on the page."
 *
 * A plan is a name, a kind and up to seven days of movements. A DAY plan has
 * one day; a WEEK plan has one entry per weekday it covers (Monday = 0, as
 * the Training Profile's rest days already count). Each movement is a
 * catalogue id with sets and reps — the numbers are the citizen's, and the
 * service checks the id is a movement the catalogue knows.
 */
export const PLAN_KINDS = ['day', 'week'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

/** Enough for anybody; more than that is a catalogue, not a session. */
export const PLAN_DAY_MAX = 30;
export const PLANS_PER_CITIZEN = 20;

const PlanExerciseSchema = z.object({
  id: z.string().regex(/^\d{4}$/),
  sets: z.number().int().min(1).max(10),
  reps: z.number().int().min(1).max(100),
});
export type PlanExercise = z.infer<typeof PlanExerciseSchema>;

const PlanDaySchema = z.object({
  day: z.number().int().min(0).max(6),
  exercises: z.array(PlanExerciseSchema).min(1).max(PLAN_DAY_MAX),
});
export type PlanDay = z.infer<typeof PlanDaySchema>;

export const SaveWorkoutPlanSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(PLAN_KINDS),
  days: z.array(PlanDaySchema).min(1).max(7),
}).superRefine((p, ctx) => {
  if (p.kind === 'day' && p.days.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A day plan has one day.' });
  }
  const seen = new Set<number>();
  for (const d of p.days) {
    if (seen.has(d.day)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A weekday appears once in a plan.' });
    seen.add(d.day);
  }
});
export type SaveWorkoutPlanDto = z.infer<typeof SaveWorkoutPlanSchema>;
