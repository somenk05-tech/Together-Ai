import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Citation { id: string; label: string; ref: string }
export interface MedMarker {
  key: string; label: string; unit: string; value: number; range: string;
  status: 'low' | 'normal' | 'high'; advice: string; caveat: string | null;
  citations: Citation[]; trend: 'up' | 'down' | 'flat' | null; previous: number | null;
  lastTested?: string; previousDate?: string | null;
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

export interface HealthSummary {
  hasPanel: boolean; name: string; score: number | null; band: string | null;
  /** What `score` is actually counting. Optional: analyses stored before v2
   *  have no basis recorded, and a missing one must not blank the page. */
  scoreBasis?: string | null;
  priorities: string[]; greeting: string; interpretation: string[]; relationships: string[];
  discuss: string[]; encouragement: string; aiEnabled: boolean;
  takenOn: string | null; lab: string | null; disclaimer: string;
}
/** Longitudinal trends across ≥2 blood panels. */
export type TrendKind = 'improving' | 'worsening' | 'stable' | 'newly-abnormal' | 'returned-normal';
export interface TrendPoint { date: string; value: number; status: 'low' | 'normal' | 'high' }
export interface MarkerTrend {
  key: string; label: string; unit: string; range: string; points: TrendPoint[];
  first: number; latest: number; deltaAbs: number; deltaLabel: string;
  direction: 'up' | 'down' | 'flat'; trend: TrendKind; trendLabel: string;
  latestStatus: 'low' | 'normal' | 'high'; severityChange: number;
}
export interface TrendTimelinePoint { id: string; takenOn: string; lab: string | null; markerCount: number; isLatest: boolean }
export interface TrendPick { key: string; label: string; trendLabel: string; deltaLabel: string; latestStatus: string }
export interface BloodTrends {
  hasTrends: boolean; testCount: number; timeline: TrendTimelinePoint[]; markers: MarkerTrend[];
  summary: null | {
    narrative: string; improvements: TrendPick[]; declines: TrendPick[];
    stable: TrendPick[]; newlyAbnormal: TrendPick[]; returnedToNormal: TrendPick[];
  };
  disclaimer: string;
}
export interface MedicalRecord { id: string; kind: string; title: string; detail: string | null; hasFile?: boolean; mimeType?: string | null; sizeBytes?: number; bloodTestId?: string | null; analyzed?: boolean; recordedOn: string }
export interface StorageUsage { quotaBytes: number; usedBytes: number; mailBytes: number; healthBytes: number; usedPct: number; remainingBytes: number }
export interface ExtractResult { recordId: string; aiEnabled: boolean; extracted: Record<string, number>; markerCount: number; lab: string | null; takenOn: string | null; note: string }
/** Manual-entry biomarker catalog (comprehensive form). */
export interface BiomarkerDef { key: string; label: string; unit: string; min: number; max: number; hubs: string[]; optional?: boolean; higherBetter?: boolean }
export interface BiomarkerSection { key: string; label: string; hint?: string; markers: BiomarkerDef[] }
export interface BiomarkerCatalog { sections: BiomarkerSection[] }
/** Upload → auto-analyse result: the report is filed AND (when readable) analysed in one call. */
export interface IngestResult {
  recordId: string; bloodTestId: string | null; aiEnabled: boolean;
  extracted: Record<string, number>; markerCount: number; lab: string | null; takenOn: string | null;
  analysis: BloodAnalysis | null; summary: HealthSummary | null; note: string;
}
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
  saveBloodTest: (input: { lab?: string; takenOn?: string; values: Record<string, number>; recordId?: string }) =>
    api.post<BloodAnalysis>('/medical/blood-tests', input).then((r) => r.data),
  ingestBlood: (input: { fileKey: string; mimeType: string; sizeBytes: number; title?: string; detail?: string }) =>
    // Reading a report runs AI extraction (with vision fallback) server-side —
    // far longer than the client's default 20s timeout. Without this override
    // the browser gave up mid-read and showed "Could not reach the server".
    api.post<IngestResult>('/medical/blood-tests/ingest', input, { timeout: 180000 }).then((r) => r.data),
  history: () => api.get<BloodTestSummary[]>('/medical/blood-tests').then((r) => r.data),
  latest: () => api.get<BloodAnalysis>('/medical/blood-tests/latest').then((r) => r.data),
  trends: () => api.get<BloodTrends>('/medical/blood-tests/trends').then((r) => r.data),
  analyze: (id: string) => api.get<BloodAnalysis>(`/medical/blood-tests/${id}`).then((r) => r.data),
  supplementPlan: () => api.get<SupplementPlan>('/medical/supplement-plan').then((r) => r.data),
  biomarkerCatalog: () => api.get<BiomarkerCatalog>('/medical/biomarkers/catalog').then((r) => r.data),
  // First summary after a new panel is AI-generated server-side and can exceed
  // the client's default 20s timeout; give it room (it's cached after that).
  summary: () => api.get<HealthSummary>('/medical/summary', { timeout: 90000 }).then((r) => r.data),
  storage: () => api.get<StorageUsage>('/medical/storage').then((r) => r.data),
  deleteRecord: (id: string) => api.delete<MedicalRecord[]>(`/medical/records/${id}`).then((r) => r.data),
  uploadDocument: (input: { kind: string; title: string; detail?: string; fileKey: string; mimeType?: string; sizeBytes: number }) =>
    api.post<MedicalRecord[]>('/medical/documents', input).then((r) => r.data),
  extractBlood: (input: { fileKey: string; mimeType: string; sizeBytes: number; title?: string }) =>
    api.post<ExtractResult>('/medical/blood-tests/extract', input, { timeout: 180000 }).then((r) => r.data),
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
/** Longitudinal trends — auto-fetched; the backend returns hasTrends=false until 2+ panels. */
export function useBloodTrends() {
  return useQuery({ queryKey: ['medical', 'trends'], queryFn: () => medicalApi.trends(), staleTime: 5 * 60 * 1000 });
}
export function useBloodHistory() {
  return useQuery({ queryKey: ['medical', 'history'], queryFn: () => medicalApi.history() });
}
/** After any panel change, refresh every surface that reads the panel so Blood
 *  Test Analysis and Health Records stay in lockstep (shared query cache). */
function syncPanelQueries(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['latest', 'history', 'summary', 'supplements', 'records', 'storage', 'trends']) {
    void qc.invalidateQueries({ queryKey: ['medical', key] });
  }
}

export function useSaveBloodTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { lab?: string; takenOn?: string; values: Record<string, number>; recordId?: string }) => medicalApi.saveBloodTest(input),
    onSuccess: (analysis) => {
      qc.setQueryData(['medical', 'latest'], analysis);
      syncPanelQueries(qc);
    },
  });
}

/** Upload a blood report and auto-analyse in one step. On success both pages
 *  reflect the same record instantly: we seed latest/summary from the response
 *  and invalidate the rest. */
export function useIngestBlood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fileKey: string; mimeType: string; sizeBytes: number; title?: string; detail?: string }) => medicalApi.ingestBlood(input),
    onSuccess: (res) => {
      if (res.analysis) qc.setQueryData(['medical', 'latest'], res.analysis);
      if (res.summary) qc.setQueryData(['medical', 'summary'], res.summary);
      syncPanelQueries(qc);
    },
  });
}
export function useMedicalSupplementPlan() {
  return useQuery({ queryKey: ['medical', 'supplements'], queryFn: () => medicalApi.supplementPlan() });
}
export function useBiomarkerCatalog() {
  return useQuery({ queryKey: ['medical', 'biomarker-catalog'], queryFn: () => medicalApi.biomarkerCatalog(), staleTime: Infinity });
}
export function useHealthSummary() {
  // The narrative is cached server-side; keep it fresh in the client cache too so
  // returning to Blood Test Analysis shows it instantly instead of refetching.
  return useQuery({
    queryKey: ['medical', 'summary'],
    queryFn: () => medicalApi.summary(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
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
