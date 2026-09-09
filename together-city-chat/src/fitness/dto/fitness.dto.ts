import { z } from 'zod';
import { EQUIPMENT_KEYS } from '../exercise-library';

export const LEVEL_KEYS = ['basic', 'beginner', 'intermediate', 'advanced', 'athlete'] as const;
export const MODE_KEYS = ['mixed', 'strength', 'walking', 'running'] as const;
export const GOAL_KEYS = ['general', 'weightLoss', 'strength', 'endurance'] as const;
export const DECLARED_CONDITIONS = ['hypertension', 'diabetes', 'pregnancy', 'jointPain'] as const;

export const BODY_GOAL_KEYS = ['buildMuscle', 'leanDefine', 'athletic', 'fatLoss'] as const;

export const SaveFitnessProfileSchema = z.object({
  age: z.number().int().min(13).max(100),
  sex: z.enum(['female', 'male', 'other']).default('other'),
  level: z.enum(LEVEL_KEYS),
  mode: z.enum(MODE_KEYS),
  goal: z.enum(GOAL_KEYS),
  conditions: z.array(z.enum(DECLARED_CONDITIONS)).max(4).default([]),
  heightCm: z.number().int().min(120).max(230).optional(),
  weightKg: z.number().int().min(30).max(300).optional(),
  bodyGoal: z.enum(BODY_GOAL_KEYS).default('athletic'),
  /**
   * The four the session engine could not build without, and which nobody was
   * ever asked. All optional: a profile saved before these existed is still a
   * valid profile, and the session reports what it did not have rather than
   * refusing to exist.
   */
  equipment: z.array(z.enum(EQUIPMENT_KEYS)).max(EQUIPMENT_KEYS.length).optional(),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  /**
   * ── THE DAYS THAT ARE NOT OURS (owner, 9 Sep) ────────────────────────────
   *
   * Weekday indices, Monday = 0. At most six, because a citizen who takes all
   * seven off has not chosen rest days — they have left, and the honest
   * answer to that is a different conversation than a schema can hold.
   */
  restDays: z.array(z.number().int().min(0).max(6)).max(6).optional(),
  /**
   * What an off day IS. Free text on purpose: the trainer asked "what would
   * you rather do", and an answer of "cricket" is a better answer than the
   * nearest item on a list of six. Never parsed — only printed back.
   */
  restActivity: z.string().trim().max(24).optional(),
  limitations: z.string().max(280).optional(),
  place: z.enum(['home', 'gym']).optional(),
  sessionMinutes: z.number().int().min(15).max(120).optional(),
  // Five free profile changes a month, ₹50 each after (5 Sep) — how the ₹50 is paid.
  method: z.enum(['wallet', 'card']).optional(),
});
export type SaveFitnessProfileDto = z.infer<typeof SaveFitnessProfileSchema>;

/**
 * ── THE WEEK, ON ITS OWN ────────────────────────────────────────────────────
 *
 * Not part of SaveFitnessProfile, and that is a pricing decision as much as a
 * shape one. Saving the training profile is metered — five free changes a
 * month, then ₹50 — because it is the citizen changing their mind about who
 * they are. Moving a rest day is not that: it is somebody looking at their
 * week and telling the trainer that Wednesday is gone. A control the owner
 * wants people to press should never be one they are charged for pressing.
 *
 * `restDays: []` is a real answer — "no days off" — and reaches the column as
 * an empty string; the field being ABSENT is what leaves it alone.
 */
export const SaveTrainingWeekSchema = z.object({
  restDays: z.array(z.number().int().min(0).max(6)).max(6).optional(),
  restActivity: z.string().trim().max(24).optional(),
});
export type SaveTrainingWeekDto = z.infer<typeof SaveTrainingWeekSchema>;

/** Where the work happened. The log's own list, longer than the profile's
 *  `place`: that one instructs the session engine, which can only program the
 *  two rooms it has movements for, and this one records what a citizen did. */
export const WORKOUT_STYLES = ['home', 'gym', 'sports', 'studio', 'outdoor'] as const;

export const LogWorkoutSchema = z.object({
  focus: z.string().min(1).max(80),
  minutes: z.number().int().min(1).max(600),
  intensity: z.enum(['light', 'moderate', 'vigorous']).default('moderate'),
  style: z.enum(WORKOUT_STYLES).optional(),
  note: z.string().max(280).optional(),
});
export type LogWorkoutDto = z.infer<typeof LogWorkoutSchema>;

/** EVERY FIELD OPTIONAL, AND AT LEAST ONE REQUIRED. An edit that names nothing
 *  is a write with no intent behind it, and the one thing a PATCH must never do
 *  is quietly blank a field the caller did not mention. */
export const EditWorkoutSchema = z.object({
  focus: z.string().min(1).max(80).optional(),
  minutes: z.number().int().min(1).max(600).optional(),
  intensity: z.enum(['light', 'moderate', 'vigorous']).optional(),
  style: z.enum(WORKOUT_STYLES).optional(),
  note: z.string().max(280).optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), {
  message: 'An edit has to change something',
});
export type EditWorkoutDto = z.infer<typeof EditWorkoutSchema>;

/** Today only. The saved profile holds the usual answers; these two override
 *  it for one session, because "I have 30 minutes and I am at my sister's"
 *  is a fact about today and not a change of mind. */
export const TodaySessionQuerySchema = z.object({
  minutes: z.coerce.number().int().min(15).max(120).optional(),
  place: z.enum(['home', 'gym']).optional(),
});
export type TodaySessionQueryDto = z.infer<typeof TodaySessionQuerySchema>;
