import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
}
export interface Prescription {
  id: string;
  status: 'processing' | 'review_required' | 'confirmed' | 'failed';
  source: string;
  error: string | null;
  confirmedAt: string | null;
  createdAt: string;
  needsReview: boolean;
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
  logs: () => api.get<{ items: DoseLogRow[]; nextCursor: string | null }>('/medicines/logs').then((r) => r.data),
  recordDose: (v: { scheduleId: string; scheduledAtUtc: string; action: 'taken' | 'skipped' }) =>
    api.post<{ id: string; action: string; scheduledAtUtc: string }>('/medicines/doses', v).then((r) => r.data),
};

const KEY = ['medicines'];
const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of ['prescriptions', 'list', 'logs']) void qc.invalidateQueries({ queryKey: [...KEY, k] });
};

export function usePrescriptions() {
  return useQuery({ queryKey: [...KEY, 'prescriptions'], queryFn: () => medicinesApi.prescriptions() });
}
export function useMedicines() {
  return useQuery({ queryKey: [...KEY, 'list'], queryFn: () => medicinesApi.medicines() });
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
