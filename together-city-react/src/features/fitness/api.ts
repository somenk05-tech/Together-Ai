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
  /** ── THE DAYS THAT ARE NOT OURS (owner, 9 Sep) ─────────────────────────
   *  Weekday indices, Monday = 0. NULL means never asked and the month keeps
   *  the calendar's own placement; [] means asked, and they said none. */
  restDays?: number[] | null;
  /** 'rest' | 'walk' | … | their own word. Never parsed, only printed. */
  restActivity?: string | null;
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
  /** What this day trains, in the engine's own words. Never empty — a day with
   *  nothing to say here is a day nobody can plan around. */
  trains: string[];
  /** The movement patterns today's session is built from. Empty on a day that
   *  is not resistance work. The page does not render this; it is the contract
   *  between the two engines and it is typed here so it cannot be dropped. */
  patterns: string[];
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
/** Where the work happened. Longer than the training profile's `place`, which
 *  is home|gym because the session engine can only PROGRAM the two rooms it has
 *  movements for. This list records what a citizen DID, and "five-a-side on
 *  Tuesday" is a real answer to that. `null` means nobody was asked — every row
 *  logged before 17 Aug — and is not the same as any of these. */
export const WORKOUT_STYLES = ['home', 'gym', 'sports', 'studio', 'outdoor'] as const;
export type WorkoutStyle = (typeof WORKOUT_STYLES)[number];

export interface WorkoutEntry { id: string; focus: string; minutes: number; intensity: Intensity; style: WorkoutStyle | null; note: string | null; doneAt: string }
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
  restDays?: number[]; restActivity?: string;
  place?: 'home' | 'gym'; sessionMinutes?: number;
}
export const fitnessApi = {
  profile: () => api.get<FitnessProfile>('/fitness/profile').then((r) => r.data),
  saveProfile: (input: SaveProfileInput) => api.put<FitnessProfile>('/fitness/profile', input).then((r) => r.data),
  plan: () => api.get<WeeklyPlan>('/fitness/plan').then((r) => r.data),
  bodyGoal: () => api.get<BodyProgram>('/fitness/body-goal').then((r) => r.data),
  syncNutrition: () => api.post<{ synced: boolean; nutritionGoal: string; goalWritten: boolean; proteinTarget: number }>('/fitness/sync-nutrition', {}).then((r) => r.data),
  log: () => api.get<FitnessLog>('/fitness/log').then((r) => r.data),
  addLog: (input: { focus: string; minutes: number; intensity: Intensity; style?: WorkoutStyle; note?: string }) =>
    api.post<FitnessLog>('/fitness/log', input).then((r) => r.data),
  editLog: ({ id, ...patch }: { id: string; focus?: string; minutes?: number; intensity?: Intensity; style?: WorkoutStyle; note?: string }) =>
    api.patch<FitnessLog>(`/fitness/log/${id}`, patch).then((r) => r.data),
  removeLog: (id: string) => api.delete<FitnessLog>(`/fitness/log/${id}`).then((r) => r.data),
};

export function useFitnessProfile() {
  return useQuery({ queryKey: ['fitness', 'profile'], queryFn: () => fitnessApi.profile() });
}
/**
 * THE PLAN FOLLOWS THE PROFILE (owner, 6 Sep: "updating profile does not
 * update the workout plan"). This invalidated the week and nothing else, and
 * queries are fresh for thirty seconds: save Advanced + Weight training +
 * Strength, walk to Workout, and today's session — built from the very
 * profile just saved, and from the week the save just re-cut — came back out
 * of the cache as it was. Everything in this hub that is BUILT FROM the
 * profile is stale the moment the profile changes: the week, today's
 * session, the body programme. Only the profile itself is written, not
 * refetched, because the server has just returned it.
 */
export function useSaveFitnessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fitnessApi.saveProfile,
    onSuccess: (p) => {
      qc.setQueryData(['fitness', 'profile'], p);
      void qc.invalidateQueries({ queryKey: ['fitness'], predicate: (q) => q.queryKey[1] !== 'profile' });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
export function useFitnessPlan() {
  return useQuery({ queryKey: ['fitness', 'plan'], queryFn: () => fitnessApi.plan() });
}
export function useBodyProgram() {
  return useQuery({ queryKey: ['fitness', 'bodyGoal'], queryFn: () => fitnessApi.bodyGoal() });
}
/* `useSyncNutrition` LIVED HERE and went with the "Connect to your diet" card
   it was the only caller of (owner, 20 Aug). The hook is deleted rather than
   left standing: dead-export-audit exists precisely so that an unreachable
   export does not sit around long enough for somebody to build a second
   feature on top of it. `fitnessApi.syncNutrition` and POST /fitness/sync-
   nutrition are both untouched — the endpoint is a real capability and the
   client wrapper is one line, so re-adding a caller is a component, not an
   excavation. */
export function useFitnessLog() {
  return useQuery({ queryKey: ['fitness', 'log'], queryFn: () => fitnessApi.log() });
}
export function useAddWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fitnessApi.addLog,
    // The session reads the log — "you have not logged a session in the last
    // week" and the easing that follows from it — so a new entry re-cuts it.
    onSuccess: (l) => { qc.setQueryData(['fitness', 'log'], l); void qc.invalidateQueries({ queryKey: ['fitness', 'session'] }); },
  });
}
/* AN ENTRY IS ITS OWNER'S TO CHANGE (owner, 17 Aug). Both write the whole fresh
   log straight into the cache, exactly as adding does — the server returns the
   list after every mutation, so the week's minutes and the row that changed can
   never disagree. It also means the total moves the instant a 300-minute typo
   is corrected, which is the reason the owner asked for this. */
export function useEditWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fitnessApi.editLog,
    onSuccess: (l) => { qc.setQueryData(['fitness', 'log'], l); void qc.invalidateQueries({ queryKey: ['fitness', 'session'] }); },
  });
}
export function useRemoveWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fitnessApi.removeLog,
    onSuccess: (l) => { qc.setQueryData(['fitness', 'log'], l); void qc.invalidateQueries({ queryKey: ['fitness', 'session'] }); },
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
  /**
   * How it is done, what it works, and a picture of it happening — carried on
   * the session rather than fetched per exercise, because the surface that
   * needs them is a full-screen timer somebody is looking at mid-movement.
   */
  steps: string[];
  muscles: string[];
  /** 180×180 still and animation, or '' for the movements the dataset does not
   *  describe. © Gym visual — see EXERCISE_MEDIA_ATTRIBUTION. */
  thumb: string;
  gif: string;
  /** The city's own film of the movement, with sound, or ''. */
  video: string;
}

/**
 * THE LINE THAT GOES WHEREVER THE PICTURE GOES.
 *
 * The exercise animations are © Gym visual and are used under terms that
 * require the attribution to travel with the media and the resolution to stay
 * at 180×180. It is one constant rather than a string typed into each page, so
 * a fourth surface cannot quietly ship without it.
 */
export const EXERCISE_MEDIA_ATTRIBUTION = '© Gym visual — gymvisual.com';
export interface TodaySession {
  headline: string;
  minutes: number;
  walkMinutes: number;
  intensity: Intensity;
  blocks: { title: string; note?: string; exercises: SessionExercise[] }[];
  why: { goal: string; energy: string | null; activity: string; ceiling: string | null; day: string | null; missing: string[] };
  substitutions: { from: string; to: string; because: string }[];
  cautions: string[];
  /** True when the session was made shorter or gentler on purpose. */
  eased: boolean;
  place: 'home' | 'gym';
  equipmentUsed: string[];
  /** Which day of the citizen's month this is and what it works — see useProgramme(). */
  programme?: { day: number; of: number; week: number; phase: string; phaseLabel: string; kind: string; title: string; parts: string; note: string } | null;
}

/**
 * ── A MONTH WITH A TRAINER (owner, 6 Sep) ───────────────────────────────────
 * Twenty-eight days from the day the citizen first opened it: which body part
 * each day is, which movements from the whole catalogue, in four phases. Built
 * on the server from the profile, the kit, the conditions and the log — the
 * page only shows it.
 */
export interface ProgrammeExercise {
  id: string; name: string; muscle: string; works: string; equipment: string;
  sets: number; reps: [number, number]; restSec: number; steps: string[]; thumb: string; gif: string;
}
export interface ProgrammeDay {
  index: number; date: string; week: 1 | 2 | 3 | 4; phase: 'base' | 'build' | 'peak' | 'deload';
  kind: 'strength' | 'cardio' | 'rest'; title: string; parts: string; muscles: string[];
  exercises: ProgrammeExercise[]; cardioMinutes: number; note: string; done: boolean;
  /** Where the day sits in the split's rotation. Strength days only — it is
   *  what tells the page that two days are the same session, so the button
   *  that moves a day does not offer to move legs onto legs. */
  slot?: number;
}
/** What the citizen chose about their own week, and what the trainer made of
 *  it. Written on the server beside the code that acted on it, so the words a
 *  citizen reads about their week are not composed twice. */
export interface ProgrammeRest {
  days: number[]; activity: string; label: string; chosen: boolean; advice: string[];
}
export interface Programme {
  startDate: string; today: string; todayIndex: number; cycle: number; daysPerWeek: number; splitName: string;
  /** How many days the split rotates through — the modulus `slot` counts in. */
  splitDays: number;
  phases: { key: string; label: string; note: string }[];
  days: ProgrammeDay[];
  why: string[];
  rest: ProgrammeRest;
}
/** The six a trainer would name first, and 'rest' is one of them. The box
 *  beside them takes anything — see OFF_DAY_ACTIVITIES on the server. */
export const OFF_DAY_ACTIVITIES = ['rest', 'walk', 'run', 'swim', 'cycle', 'yoga'] as const;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export function useProgramme() {
  return useQuery({ queryKey: ['fitness', 'programme'], queryFn: () => api.get<Programme>('/fitness/programme').then((r) => r.data) });
}
/**
 * ── MOVING THE WEEK IS FREE (owner, 9 Sep) ──────────────────────────────────
 *
 * Its own route, not two more fields on `saveProfile`, because the profile
 * save is METERED — five free changes a month, then ₹50 — and a rest-day
 * toggle the owner wants people to press must never be one they are charged
 * for pressing.
 *
 * The server returns the REBUILT month, so the grid redraws from the answer
 * rather than from a second round trip; the profile is invalidated because
 * its own copy of these two fields is now behind.
 */
export function useSaveTrainingWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { restDays?: number[]; restActivity?: string }) =>
      api.put<Programme>('/fitness/programme/week', input).then((r) => r.data),
    onSuccess: (p) => {
      qc.setQueryData(['fitness', 'programme'], p);
      void qc.invalidateQueries({ queryKey: ['fitness', 'profile'] });
      void qc.invalidateQueries({ queryKey: ['fitness', 'session'] });
    },
  });
}

/**
 * ── THE DAY YOU MOVE TO TODAY (owner, 9 Sep) ────────────────────────────────
 *
 * "Have an 'update to today's workout plan' button, and that goes to today's
 * workout plan, and then today's plan shifts to the next day."
 *
 * Unmetered, and on its own route, for the same reason the week beside it is:
 * a control the owner wants pressed must not be one a citizen is charged for
 * pressing. The server answers with the whole rebuilt month — the move changes
 * every training day after it, so a patch of one day would be a lie — and
 * today's session is invalidated because the thing it is a session FOR has
 * just changed underneath it.
 */
export function useMoveWorkoutDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dayIndex: number) =>
      api.put<Programme>('/fitness/programme/today', { dayIndex }).then((r) => r.data),
    onSuccess: (p) => {
      qc.setQueryData(['fitness', 'programme'], p);
      void qc.invalidateQueries({ queryKey: ['fitness', 'session'] });
    },
  });
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
