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
  limitations: z.string().max(280).optional(),
  place: z.enum(['home', 'gym']).optional(),
  sessionMinutes: z.number().int().min(15).max(120).optional(),
});
export type SaveFitnessProfileDto = z.infer<typeof SaveFitnessProfileSchema>;

export const LogWorkoutSchema = z.object({
  focus: z.string().min(1).max(80),
  minutes: z.number().int().min(1).max(600),
  intensity: z.enum(['light', 'moderate', 'vigorous']).default('moderate'),
  note: z.string().max(280).optional(),
});
export type LogWorkoutDto = z.infer<typeof LogWorkoutSchema>;

/** Today only. The saved profile holds the usual answers; these two override
 *  it for one session, because "I have 30 minutes and I am at my sister's"
 *  is a fact about today and not a change of mind. */
export const TodaySessionQuerySchema = z.object({
  minutes: z.coerce.number().int().min(15).max(120).optional(),
  place: z.enum(['home', 'gym']).optional(),
});
export type TodaySessionQueryDto = z.infer<typeof TodaySessionQuerySchema>;
