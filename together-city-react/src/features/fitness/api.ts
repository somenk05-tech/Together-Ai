import { AxiosError } from 'axios';
import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Citation { id: string; label: string; ref: string }
export type Intensity = 'light' | 'moderate' | 'vigorous';

export interface FitnessOption { key: string; label: string; note: string }
export interface BodyGoalOption { key: string; label: string; tag: string }
export interface FitnessProfile {
  age: number; sex: string; level: string; mode: string; goal: string; conditions: string[];
  heightCm: number | null; weightKg: number | null; bodyGoal: string;
  saved: boolean; options: { levels: FitnessOption[]; modes: FitnessOption[]; bodyGoals: BodyGoalOption[] };
}
export interface BodyProgram {
  goalKey: string; goalLabel: string; tag: string; hasMetrics: boolean;
  bmr: number; tdee: number; calorieTarget: number;
  macros: { proteinG: number; fatG: number; carbG: number };
  proteinPerKg: number; rate: string; emphasis: string;
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
}
export const fitnessApi = {
  profile: () => api.get<FitnessProfile>('/fitness/profile').then((r) => r.data),
  saveProfile: (input: SaveProfileInput) => api.put<FitnessProfile>('/fitness/profile', input).then((r) => r.data),
  plan: () => api.get<WeeklyPlan>('/fitness/plan').then((r) => r.data),
  bodyGoal: () => api.get<BodyProgram>('/fitness/body-goal').then((r) => r.data),
  syncNutrition: () => api.post<{ synced: boolean; nutritionGoal: string; proteinTarget: number }>('/fitness/sync-nutrition', {}).then((r) => r.data),
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
    onSuccess: (p) => { qc.setQueryData(['fitness', 'profile'], p); void qc.invalidateQueries({ queryKey: ['fitness', 'plan'] }); },
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
