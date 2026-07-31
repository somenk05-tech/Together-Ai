import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** An allergy the citizen filed under Medical → Records. Their words. */
export interface RecordedAllergy {
  id: string;
  title: string;
  detail: string | null;
  recordedOn: string;
}

/**
 * A NAME that appears both in a prescribed medicine and in something the
 * citizen wrote down. Not a clinical finding, and the screen must not present
 * it as one — the app does not know which drugs belong to which class.
 */
export interface AllergyMatch {
  allergyId: string;
  title: string;
  matchedOn: string;
  foundIn: 'title' | 'detail';
}

export interface PrescriptionItem {
  id: string;
  medicineName: string;
  dosage: string | null;
  frequency: string | null;
  durationDays: number | null;
  instructions: string | null;
  timesLocal: string[];
  confidence: Record<string, number>;
  needsReview: boolean;
  allergyMatches: AllergyMatch[];
}
export interface Prescription {
  id: string;
  status: 'processing' | 'review_required' | 'confirmed' | 'failed';
  source: string;
  error: string | null;
  confirmedAt: string | null;
  createdAt: string;
  needsReview: boolean;
  recordedAllergies: RecordedAllergy[];
  items: PrescriptionItem[];
}

export interface MedicineSchedule {
  id: string; timesLocal: string[]; timezone: string; dosage: string | null;
  startDate: string; endDate: string | null; active: boolean;
}
export interface Medicine {
  id: string; name: string; form: string | null; strength: string | null;
  notes: string | null; schedules: MedicineSchedule[];
}

export interface DoseLogRow {
  id: string; medicine: string; dosage: string | null;
  scheduledAtUtc: string; actedAtUtc: string | null;
  action: 'taken' | 'skipped' | 'missed'; note: string | null;
}

/**
 * One dose in the citizen's own day.
 *
 * `status` is 'due' rather than 'missed' for anything unanswered whose time has
 * passed — the API will not call a dose missed, because the hourly sweep owns
 * that decision on its own grace window and two places allowed to reach it is
 * how they start disagreeing.
 */
export interface TodayDose {
  scheduleId: string;
  scheduledAtUtc: string;
  timeLocal: string;
  medicine: string;
  form: string | null;
  strength: string | null;
  dosage: string | null;
  instructions: string | null;
  status: 'taken' | 'skipped' | 'missed' | 'due' | 'upcoming';
  actedAtUtc: string | null;
}
export interface TodayDoses {
  day: string; timezone: string; doses: TodayDose[];
  /** Answered BY THE CITIZEN. A dose the sweep called missed is not an answer. */
  answered: number; total: number;
}

export interface AddItemInput {
  medicineName: string; dosage: string; frequency: string;
  durationDays?: number; instructions?: string; timesLocal?: string[];
}

export const medicinesApi = {
  prescriptions: () => api.get<Prescription[]>('/prescriptions').then((r) => r.data),
  createManual: () => api.post<Prescription>('/prescriptions', { fileKey: 'manual' }).then((r) => r.data),
  addItem: (id: string, input: AddItemInput) => api.post<Prescription>(`/prescriptions/${id}/items`, input).then((r) => r.data),
  removeItem: (id: string, itemId: string) => api.delete<Prescription>(`/prescriptions/${id}/items/${itemId}`).then((r) => r.data),
  confirm: (id: string) => api.post<Prescription>(`/prescriptions/${id}/confirm`, {}).then((r) => r.data),
  medicines: () => api.get<Medicine[]>('/medicines').then((r) => r.data),
  today: () => api.get<TodayDoses>('/medicines/today').then((r) => r.data),
  logs: () => api.get<{ items: DoseLogRow[]; nextCursor: string | null }>('/medicines/logs').then((r) => r.data),
  recordDose: (v: { scheduleId: string; scheduledAtUtc: string; action: 'taken' | 'skipped' }) =>
    api.post<{ id: string; action: string; scheduledAtUtc: string }>('/medicines/doses', v).then((r) => r.data),
};

const KEY = ['medicines'];
const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of ['prescriptions', 'list', 'logs', 'today']) void qc.invalidateQueries({ queryKey: [...KEY, k] });
};

export function usePrescriptions() {
  return useQuery({ queryKey: [...KEY, 'prescriptions'], queryFn: () => medicinesApi.prescriptions() });
}
export function useMedicines() {
  return useQuery({ queryKey: [...KEY, 'list'], queryFn: () => medicinesApi.medicines() });
}
export function useToday() {
  // Short staleTime rather than none: a dose becomes due on the clock, not on
  // an event, so the page has to notice time passing without a refresh.
  return useQuery({ queryKey: [...KEY, 'today'], queryFn: () => medicinesApi.today(), refetchInterval: 60_000 });
}
export function useDoseLogs() {
  return useQuery({ queryKey: [...KEY, 'logs'], queryFn: () => medicinesApi.logs() });
}
export function useCreateManualPrescription() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => medicinesApi.createManual(), onSuccess: () => invalidate(qc) });
}
export function useAddPrescriptionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; input: AddItemInput }) => medicinesApi.addItem(v.id, v.input),
    onSuccess: () => invalidate(qc),
  });
}
export function useRemovePrescriptionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; itemId: string }) => medicinesApi.removeItem(v.id, v.itemId),
    onSuccess: () => invalidate(qc),
  });
}
export function useConfirmPrescription() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => medicinesApi.confirm(id), onSuccess: () => invalidate(qc) });
}
export function useRecordDose() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: medicinesApi.recordDose, onSuccess: () => invalidate(qc) });
}
