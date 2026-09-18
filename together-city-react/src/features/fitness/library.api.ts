import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * ── EVERY MOVEMENT IN THE CITY (owner, 18 Sep) ──────────────────────────────
 *
 * The Workout Library: the whole catalogue in the citizen's library (women's
 * or men's, decided by the profile), each movement graded, and the citizen's
 * own plans built from it. Its own file beside api.ts because none of this
 * touches the session, the month or the log.
 */
export type Grade = 'beginner' | 'intermediate' | 'advanced';
export type Track = 'women' | 'men';

export interface LibraryMovement {
  id: string; name: string;
  /** The dataset's key ('upper legs') and the city's word for it ('Legs & glutes'). */
  part: string; partLabel: string;
  target: string; secondary: string[]; equipment: string;
  level: Grade;
  /** 180×180 — © Gym visual, see EXERCISE_MEDIA_ATTRIBUTION in ./api. '' when none. */
  thumb: string; gif: string;
  /** The city's own film of the movement, or null while the slot waits. */
  film: string | null;
}
export interface Library {
  track: Track; trackLabel: string;
  /** The citizen's own shelf, from the Training Profile — null until it is answered. */
  level: Grade | null;
  parts: { key: string; label: string; line: string; count: number }[];
  levels: { key: Grade; label: string; count: number }[];
  equipment: string[];
  movements: LibraryMovement[];
  attribution: string;
  plansCap: number;
}
export interface MovementHowTo extends LibraryMovement { steps: string[] }

export interface PlanExercise { id: string; sets: number; reps: number }
export interface PlanDay { day: number; exercises: PlanExercise[] }
export type PlanKind = 'day' | 'week';
export interface WorkoutPlan { id: string; name: string; kind: PlanKind; days: PlanDay[]; createdAt: string; updatedAt: string }
export interface SavePlanInput { name: string; kind: PlanKind; days: PlanDay[] }

const KEY = ['fitness', 'library'] as const;
const PLANS = ['fitness', 'library', 'plans'] as const;

export function useWorkoutLibrary() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<Library>('/fitness/library').then((r) => r.data),
    /* 1,324 rows that change only when the code does. */
    staleTime: Infinity,
  });
}

/** How one movement is done — asked for when its card opens, not before. */
export function useMovementHowTo(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'movement', id],
    queryFn: () => api.get<MovementHowTo>(`/fitness/library/${id}`).then((r) => r.data),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
}

export function useWorkoutPlans() {
  return useQuery({
    queryKey: PLANS,
    queryFn: () => api.get<{ plans: WorkoutPlan[]; cap: number }>('/fitness/library/plans').then((r) => r.data),
  });
}

export function useSaveWorkoutPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePlanInput & { id?: string }) => {
      const { id, ...body } = input;
      return id
        ? api.patch<WorkoutPlan>(`/fitness/library/plans/${id}`, body).then((r) => r.data)
        : api.post<WorkoutPlan>('/fitness/library/plans', body).then((r) => r.data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: PLANS }); },
  });
}

export function useRemoveWorkoutPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/fitness/library/plans/${id}`).then(() => id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: PLANS }); },
  });
}
