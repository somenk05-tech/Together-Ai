import { AxiosError } from 'axios';
import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Citation { id: string; label: string; ref: string }

export interface FitnessOption { key: string; label: string; note: string }
export interface BodyGoalOption { key: string; label: string; tag: string }
export interface FitnessProfile {
  age: number; sex: string; level: string; mode: string; goal: string; conditions: string[];
  heightCm: number | null; weightKg: number | null; bodyGoal: string;
  /** The training set-up. Empty/null mean UNANSWERED, not "none" — 'none' is a
   *  real equipment answer and the session engine keeps the two apart. */
  equipment?: string[];
  daysPerWeek?: number | null;
  limitations?: string | null;
  place?: string | null;
  sessionMinutes?: number | null;
  saved: boolean; prefilled?: boolean; options: { levels: FitnessOption[]; modes: FitnessOption[]; bodyGoals: BodyGoalOption[] };
}
export interface BodyProgram {
  goalKey: string; goalLabel: string; tag: string; hasMetrics: boolean;
  bmr: number | null; tdee: number | null; calorieTarget: number | null;
  missing: string[];
  macros: { proteinG: number; fatG: number; carbG: number };
  proteinPerKg: number;
  /** What training for this goal would ask for, kept so the page can explain
   *  why the clinical number on the screen is lower. */
  trainingProteinG: number | null;
  proteinNote: string | null;
  /** What this body goal alone would ask for, and why the number on the screen
   *  is Nutrition's instead. Same shape as the protein pair above. */
  trainingKcal: number | null;
  calorieNote: string | null;
  rate: string; emphasis: string;
  nutrition: { goal: 'lose' | 'maintain' | 'gain'; proteinTarget: number; note: string };
  healthImprovements: { title: string; detail: string; citations: Citation[] }[];
  citations: Citation[]; disclaimer: string; consentGranted: boolean;
}
export interface Session {
  day: string; focus: string; detail: string; intensity: Intensity; minutes: number;
  kind: 'aerobic' | 'strength' | 'balance' | 'mobility' | 'recovery';
}
export interface ConditionAdjustment {
  key: string; source: 'labs' | 'records' | 'declared'; title: string; detail: string; effect: string; citations: Citation[];
}
export interface HeartInfo {
  hrMax: number; formula: string;
  zones: { light: [number, number]; moderate: [number, number]; vigorous: [number, number] };
  citations: Citation[];
}
export interface WeeklyPlan {
  age: number; sex: string;
  band: { key: string; label: string; summary: string; citations: Citation[] };
  level: string; mode: string; goal: string;
  heart: HeartInfo;
  intensityCap: Intensity;
  weeklyTargets: { aerobicMinutes: string; resistanceDays: number; balanceDays: number; note: string };
  sessions: Session[];
  adjustments: ConditionAdjustment[];
  habits: string[]; safety: string[]; disclaimer: string;
  usedLabs: boolean; consentGranted: boolean;
}
export interface WorkoutEntry { id: string; focus: string; minutes: number; intensity: Intensity; note: string | null; doneAt: string }
export interface FitnessLog { entries: WorkoutEntry[]; weekMinutes: number; weekSessions: number }

export function isConsentBlocked(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 403;
}

export interface SaveProfileInput {
  age: number; sex: string; level: string; mode: string; goal: string; conditions: string[];
  heightCm?: number; weightKg?: number; bodyGoal: string;
  /** Optional so a form that does not ask leaves them alone rather than
   *  erasing them — the service writes `?? undefined`, never null. */
  equipment?: string[]; daysPerWeek?: number; limitations?: string;
  place?: 'home' | 'gym'; sessionMinutes?: number;
}
export const fitnessApi = {
  profile: () => api.get<FitnessProfile>('/fitness/profile').then((r) => r.data),
  saveProfile: (input: SaveProfileInput) => api.put<FitnessProfile>('/fitness/profile', input).then((r) => r.data),
  plan: () => api.get<WeeklyPlan>('/fitness/plan').then((r) => r.data),
  bodyGoal: () => api.get<BodyProgram>('/fitness/body-goal').then((r) => r.data),
  syncNutrition: () => api.post<{ synced: boolean; nutritionGoal: string; goalWritten: boolean; proteinTarget: number }>('/fitness/sync-nutrition', {}).then((r) => r.data),
  log: () => api.get<FitnessLog>('/fitness/log').then((r) => r.data),
  addLog: (input: { focus: string; minutes: number; intensity: Intensity; note?: string }) =>
    api.post<FitnessLog>('/fitness/log', input).then((r) => r.data),
};

export function useFitnessProfile() {
  return useQuery({ queryKey: ['fitness', 'profile'], queryFn: () => fitnessApi.profile() });
}
export function useSaveFitnessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fitnessApi.saveProfile,
    onSuccess: (p) => { qc.setQueryData(['fitness', 'profile'], p); void qc.invalidateQueries({ queryKey: ['fitness', 'plan'] }); void qc.invalidateQueries({ queryKey: ['profile'] }); },
  });
}
export function useFitnessPlan() {
  return useQuery({ queryKey: ['fitness', 'plan'], queryFn: () => fitnessApi.plan() });
}
export function useBodyProgram() {
  return useQuery({ queryKey: ['fitness', 'bodyGoal'], queryFn: () => fitnessApi.bodyGoal() });
}
export function useSyncNutrition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fitnessApi.syncNutrition(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['nutrition'] }); },
  });
}
export function useFitnessLog() {
  return useQuery({ queryKey: ['fitness', 'log'], queryFn: () => fitnessApi.log() });
}
export function useAddWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fitnessApi.addLog,
    onSuccess: (l) => qc.setQueryData(['fitness', 'log'], l),
  });
}

/**
 * ── TODAY'S SESSION ─────────────────────────────────────────────────────────
 *
 * Built on the server, from the saved training profile, the body goal, the
 * declared conditions AND the ones in the medical records, the intensity
 * ceiling the weekly plan derives from the labs, Nutrition's day, and the
 * week's own logged minutes. The page renders it; it does not compute it.
 */
export type Intensity = 'light' | 'moderate' | 'vigorous';
export interface SessionExercise {
  id: string; name: string; pattern: string;
  sets: number; reps?: [number, number]; seconds?: number; restSec: number; unilateral?: boolean;
  /** Present when this movement stands in for one a condition ruled out. */
  insteadOf?: { name: string; because: string };
}
export interface TodaySession {
  headline: string;
  minutes: number;
  walkMinutes: number;
  intensity: Intensity;
  blocks: { title: string; note?: string; exercises: SessionExercise[] }[];
  why: { goal: string; energy: string | null; activity: string; ceiling: string | null; missing: string[] };
  substitutions: { from: string; to: string; because: string }[];
  cautions: string[];
  /** True when the session was made shorter or gentler on purpose. */
  eased: boolean;
  place: 'home' | 'gym';
  equipmentUsed: string[];
}

/**
 * Today only. `minutes` and `place` narrow the question the saved profile
 * already answers — "I have 30 minutes and I'm at my sister's" is a fact about
 * today, not a change of mind, so neither is written back.
 */
export function useTodaySession(minutes?: number, place?: 'home' | 'gym') {
  return useQuery({
    queryKey: ['fitness', 'session', minutes ?? null, place ?? null],
    queryFn: () => api.get<TodaySession>('/fitness/session', { params: { minutes, place } }).then((r) => r.data),
  });
}
