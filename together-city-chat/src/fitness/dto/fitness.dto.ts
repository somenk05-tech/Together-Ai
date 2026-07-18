import { z } from 'zod';

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
});
export type SaveFitnessProfileDto = z.infer<typeof SaveFitnessProfileSchema>;

export const LogWorkoutSchema = z.object({
  focus: z.string().min(1).max(80),
  minutes: z.number().int().min(1).max(600),
  intensity: z.enum(['light', 'moderate', 'vigorous']).default('moderate'),
  note: z.string().max(280).optional(),
});
export type LogWorkoutDto = z.infer<typeof LogWorkoutSchema>;
