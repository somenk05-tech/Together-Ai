import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Citation { id: string; label: string; ref: string }
export interface MedMarker {
  key: string; label: string; unit: string; value: number; range: string;
  status: 'low' | 'normal' | 'high'; advice: string; caveat: string | null;
  citations: Citation[]; trend: 'up' | 'down' | 'flat' | null; previous: number | null;
}
export interface MedAlert { key: string; label: string; value: number; urgent: boolean; message: string }
export interface MedCondition { key: string; name: string; principles: string[]; citations: Citation[] }
export interface BloodAnalysis {
  testId?: string; takenOn: string | null; lab?: string | null;
  markers: MedMarker[]; alerts: MedAlert[]; conditions: MedCondition[];
  disclaimer?: string; sharesWith?: string;
}
export interface BloodTestSummary {
  id: string; takenOn: string; lab: string | null; markerCount: number;
  flagged: { key: string; label: string; status: string }[]; alertCount: number;
}
export interface SupplementItem {
  name: string; purpose: string; dose: string; timing: string; priceInr: number;
  trigger: string; foodFirst: string | null; reference: string | null; citations: Citation[];
}
export interface SupplementPlan {
  basis: { goal: string; hasBloodTest: boolean; takenOn: string | null; flags: { key: string; label: string; status: string; value: number }[] };
  items: SupplementItem[]; totalInr: number; safety: string;
}

export interface MedicalRecord { id: string; kind: string; title: string; detail: string | null; hasFile?: boolean; mimeType?: string | null; sizeBytes?: number; recordedOn: string }
export interface StorageUsage { quotaBytes: number; usedBytes: number; mailBytes: number; healthBytes: number; usedPct: number; remainingBytes: number }
export interface ExtractResult { aiEnabled: boolean; extracted: Record<string, number>; markerCount: number; lab: string | null; takenOn: string | null; note: string }
export interface DoctorCard { id: string; name: string; handle: string; specialty: string; hospital: string | null; languages: string[]; rating: number; priceInr: number }
export interface ConsultSummary { id: string; doctorName: string; specialty: string; reason: string | null; status: string; conversationId: string | null; scheduledAt: string | null; createdAt: string }
export interface ConsentRow { hub: string; label: string; reads: string; granted: boolean; updatedAt: string }

export const medicalApi = {
  records: () => api.get<MedicalRecord[]>('/medical/records').then((r) => r.data),
  addRecord: (input: { kind: string; title: string; detail?: string; recordedOn?: string }) =>
    api.post<MedicalRecord[]>('/medical/records', input).then((r) => r.data),
  doctors: () => api.get<DoctorCard[]>('/medical/doctors').then((r) => r.data),
  consults: () => api.get<ConsultSummary[]>('/medical/consults').then((r) => r.data),
  bookConsult: (input: { doctorId: string; reason?: string; method?: 'wallet' | 'card' }) =>
    api.post<{ consultId: string; conversationId: string }>('/medical/consults', input).then((r) => r.data),
  consents: () => api.get<ConsentRow[]>('/medical/consents').then((r) => r.data),
  setConsent: (hub: string, granted: boolean) =>
    api.patch<ConsentRow[]>('/medical/consents', { hub, granted }).then((r) => r.data),
  saveBloodTest: (input: { lab?: string; takenOn?: string; values: Record<string, number> }) =>
    api.post<BloodAnalysis>('/medical/blood-tests', input).then((r) => r.data),
  history: () => api.get<BloodTestSummary[]>('/medical/blood-tests').then((r) => r.data),
  latest: () => api.get<BloodAnalysis>('/medical/blood-tests/latest').then((r) => r.data),
  analyze: (id: string) => api.get<BloodAnalysis>(`/medical/blood-tests/${id}`).then((r) => r.data),
  supplementPlan: () => api.get<SupplementPlan>('/medical/supplement-plan').then((r) => r.data),
  storage: () => api.get<StorageUsage>('/medical/storage').then((r) => r.data),
  deleteRecord: (id: string) => api.delete<MedicalRecord[]>(`/medical/records/${id}`).then((r) => r.data),
  uploadDocument: (input: { kind: string; title: string; detail?: string; fileKey: string; mimeType?: string; sizeBytes: number }) =>
    api.post<MedicalRecord[]>('/medical/documents', input).then((r) => r.data),
  extractBlood: (input: { fileKey: string; mimeType: string; sizeBytes: number; title?: string }) =>
    api.post<ExtractResult>('/medical/blood-tests/extract', input).then((r) => r.data),
  recordFile: (id: string) => api.get<{ url: string | null; expiresInSec: number }>(`/medical/records/${id}/file`).then((r) => r.data),
};

export function useStorageUsage() {
  return useQuery({ queryKey: ['medical', 'storage'], queryFn: () => medicalApi.storage() });
}
export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicalApi.deleteRecord(id),
    onSuccess: (recs) => { qc.setQueryData(['medical', 'records'], recs); void qc.invalidateQueries({ queryKey: ['medical', 'storage'] }); },
  });
}

export function useLatestPanel() {
  return useQuery({ queryKey: ['medical', 'latest'], queryFn: () => medicalApi.latest() });
}
export function useBloodHistory() {
  return useQuery({ queryKey: ['medical', 'history'], queryFn: () => medicalApi.history() });
}
export function useSaveBloodTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { lab?: string; values: Record<string, number> }) => medicalApi.saveBloodTest(input),
    onSuccess: (analysis) => {
      qc.setQueryData(['medical', 'latest'], analysis);
      void qc.invalidateQueries({ queryKey: ['medical', 'history'] });
      void qc.invalidateQueries({ queryKey: ['medical', 'supplements'] });
    },
  });
}
export function useMedicalSupplementPlan() {
  return useQuery({ queryKey: ['medical', 'supplements'], queryFn: () => medicalApi.supplementPlan() });
}
export function useRecords() {
  return useQuery({ queryKey: ['medical', 'records'], queryFn: () => medicalApi.records() });
}
export function useAddRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: string; title: string; detail?: string }) => medicalApi.addRecord(input),
    onSuccess: (recs) => qc.setQueryData(['medical', 'records'], recs),
  });
}
export function useDoctors() {
  return useQuery({ queryKey: ['medical', 'doctors'], queryFn: () => medicalApi.doctors() });
}
export function useConsults() {
  return useQuery({ queryKey: ['medical', 'consults'], queryFn: () => medicalApi.consults() });
}
export function useBookConsult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { doctorId: string; reason?: string; method?: 'wallet' | 'card' }) => medicalApi.bookConsult(input),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['medical', 'consults'] }); void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}
export function useConsents() {
  return useQuery({ queryKey: ['medical', 'consents'], queryFn: () => medicalApi.consents() });
}
export function useSetConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { hub: string; granted: boolean }) => medicalApi.setConsent(v.hub, v.granted),
    onSuccess: (rows) => qc.setQueryData(['medical', 'consents'], rows),
  });
}
