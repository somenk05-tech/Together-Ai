import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Citation { id: string; label: string; ref: string }
/** Where a marker's reference range came from. 'general-adult' is one band applied
 *  to every adult and is not matched to this citizen; 'own-report' is the range the
 *  lab printed on their own report, which already accounts for sex, age and assay. */
export type RangeBasis = 'general-adult' | 'own-report';
export interface MedMarker {
  key: string; label: string; unit: string; value: number; range: string;
  rangeBasis: RangeBasis;
  status: 'low' | 'normal' | 'high'; advice: string; caveat: string | null;
  citations: Citation[]; trend: 'up' | 'down' | 'flat' | null; previous: number | null;
  lastTested?: string; previousDate?: string | null;
}
export interface MedAlert { key: string; label: string; value: number; urgent: boolean; message: string }
export interface MedCondition { key: string; name: string; principles: string[]; citations: Citation[] }
export interface BloodAnalysis {
  testId?: string; takenOn: string | null; lab?: string | null;
  markers: MedMarker[]; alerts: MedAlert[]; conditions: MedCondition[];
  /** What the statuses above were measured against — null once every range on
   *  the panel came from the citizen's own report. Server-computed, so the page
   *  never has to work out its own version and disagree with the backend. */
  rangeNote: string | null;
  /** What the panel actually cleared, and whose band it cleared. Replaces the
   *  unqualified all-clear the pages used to print. */
  inRangeLine: string;
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
  /** True when there is no blood panel on file: no items, no price — the rule
   *  is no blood test, no plan. `safety` carries the sentence that says so. */
  gated?: true;
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
  key: string; label: string; unit: string; range: string;
  /** The same bounds as numbers, so the chart never parses the display string. */
  min: number; max: number;
  points: TrendPoint[];
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
export interface MedicalRecord {
  id: string; kind: string; title: string; detail: string | null; hasFile?: boolean; mimeType?: string | null; sizeBytes?: number; bloodTestId?: string | null; analyzed?: boolean;
  /** The report's own date once the vault has read it; the filing day before. */
  recordedOn: string;
  /** The name printed on the report (owner, 10 Sep), null when none is. */
  nameOnReport?: string | null;
  /** False for a file filed before the vault could read — the page reads it once. */
  read?: boolean;
  /** Held on a name that did not quite match: the folder it goes to once the
   *  citizen confirms it is theirs. */
  heldFor?: string | null;
}
export interface StorageUsage { quotaBytes: number; usedBytes: number; mailBytes: number; healthBytes: number; usedPct: number; remainingBytes: number }
export interface ExtractResult { recordId: string; aiEnabled: boolean; extracted: Record<string, number>; markerCount: number; lab: string | null; takenOn: string | null; note: string }
/** Manual-entry biomarker catalog (comprehensive form). */
/**
 * One entry in a marker's unit selector, with the arithmetic to apply it.
 *
 * The factor comes from the API rather than being restated here. The form
 * colours each field against the reference range while somebody types, so it
 * has to convert — and two copies of a conversion table is how the badge and
 * the stored flag end up disagreeing. canonical is the unit the range is
 * stated in; converted = value * factor + offset.
 */
export interface UnitChoice { unit: string; factor: number; offset: number; canonical: boolean; note?: string }
export interface BiomarkerDef { key: string; label: string; unit: string; min: number; max: number; hubs: string[]; optional?: boolean; higherBetter?: boolean; units?: UnitChoice[] }
export interface BiomarkerSection { key: string; label: string; hint?: string; markers: BiomarkerDef[] }
export interface BiomarkerCatalog { sections: BiomarkerSection[] }
/**
 * One page of panels. `total` is the size of the whole history, not the page —
 * every count a citizen reads ("12 panels") must come from it, or the number
 * silently becomes "as many as we happened to fetch".
 */
export interface BloodTestPage { items: BloodTestSummary[]; total: number; nextCursor: string | null }
/** Upload → auto-analyse result: the report is filed AND (when readable) analysed in one call. */
export interface IngestResult {
  recordId: string; bloodTestId: string | null; aiEnabled: boolean;
  extracted: Record<string, number>; markerCount: number; lab: string | null; takenOn: string | null;
  analysis: BloodAnalysis | null; summary: HealthSummary | null; note: string;
}
/** One upload, filed by the server (owner, 10 Sep). `sorted` false means the
 *  reader could not tell what it is — the document sits in `unsorted` and the
 *  page asks for a tag. */
export interface SortedUploadResult {
  recordId: string; kind: string; sorted: boolean; held?: boolean; bloodTestId: string | null; note: string; records: MedicalRecord[];
}
export interface HistoryArea { area: string; status: 'attention' | 'watch' | 'good' | 'unclear'; summary: string; evidence: string[] }
/** The whole medical record read as one overview — kept server-side until an
 *  upload, delete, tag or corrected panel changes what it was written from. */
export interface MedicalHistory {
  hasRecords: boolean; documents: number; panels: number; from: string | null; to: string | null;
  folders: { kind: string; label: string; count: number }[]; needsTag: number;
  aiEnabled: boolean; fromModel: boolean; disclaimer: string;
  overview: string; areas: HistoryArea[]; changes: string[]; discuss: string[]; gaps: string[];
}
export interface DoctorCard { id: string; name: string; handle: string; specialty: string; hospital: string | null; languages: string[]; rating: number; priceInr: number }
export interface ConsentRow {
  hub: string; label: string; reads: string; granted: boolean;
  /** false = the citizen has never answered, and `granted` is the default
   *  speaking. Reading the list no longer writes a row, so absence is now
   *  visible rather than being backfilled as an affirmative consent. */
  answered: boolean;
  updatedAt: string | null;
}

export const medicalApi = {
  records: () => api.get<MedicalRecord[]>('/medical/records').then((r) => r.data),
  consents: () => api.get<ConsentRow[]>('/medical/consents').then((r) => r.data),
  setConsent: (hub: string, granted: boolean) =>
    api.patch<ConsentRow[]>('/medical/consents', { hub, granted }).then((r) => r.data),
  saveBloodTest: (input: { lab?: string; takenOn?: string; values: Record<string, number>; units?: Record<string, string>; recordId?: string }) =>
    api.post<BloodAnalysis>('/medical/blood-tests', input).then((r) => r.data),
  ingestBlood: (input: { fileKey: string; mimeType: string; sizeBytes: number; title?: string; detail?: string }) =>
    // Reading a report runs AI extraction (with vision fallback) server-side —
    // far longer than the client's default 20s timeout. Without this override
    // the browser gave up mid-read and showed "Could not reach the server".
    api.post<IngestResult>('/medical/blood-tests/ingest', input, { timeout: 180000 }).then((r) => r.data),
  /**
   * Panels, newest first, a page at a time.
   *
   * Tolerates the old bare-array shape on purpose. The web app and the API
   * deploy to different providers and finish at different times, so after every
   * push there is a window where this bundle is live and the API serving it is
   * still the previous release. Accepting both shapes costs one line and turns
   * that window from a broken history list into nothing at all. It can come out
   * once the paged API has been live for a release.
   */
  history: (limit?: number) => api
    .get<BloodTestPage | BloodTestSummary[]>('/medical/blood-tests', limit ? { params: { limit } } : undefined)
    .then((r) => (Array.isArray(r.data)
      ? { items: r.data, total: r.data.length, nextCursor: null }
      : r.data)),
  latest: () => api.get<BloodAnalysis>('/medical/blood-tests/latest').then((r) => r.data),
  trends: () => api.get<BloodTrends>('/medical/blood-tests/trends').then((r) => r.data),
  supplementPlan: () => api.get<SupplementPlan>('/medical/supplement-plan').then((r) => r.data),
  biomarkerCatalog: () => api.get<BiomarkerCatalog>('/medical/biomarkers/catalog').then((r) => r.data),
  // First summary after a new panel is AI-generated server-side and can exceed
  // the client's default 20s timeout; give it room (it's cached after that).
  summary: () => api.get<HealthSummary>('/medical/summary', { timeout: 90000 }).then((r) => r.data),
  storage: () => api.get<StorageUsage>('/medical/storage').then((r) => r.data),
  deleteRecord: (id: string) => api.delete<MedicalRecord[]>(`/medical/records/${id}`).then((r) => r.data),
  // A model read of the document (vision for a photo or a scan) — the same
  // room the blood ingest is given, for the same reason.
  uploadSorted: (input: { fileKey: string; mimeType: string; sizeBytes: number; name?: string }) =>
    api.post<SortedUploadResult>('/medical/uploads', input, { timeout: 180000 }).then((r) => r.data),
  tagRecord: (id: string, kind: string) =>
    api.patch<{ note: string; records: MedicalRecord[] }>(`/medical/records/${id}`, { kind }, { timeout: 180000 }).then((r) => r.data),
  confirmRecord: (id: string) =>
    api.post<{ note: string; records: MedicalRecord[] }>(`/medical/records/${id}/confirm`, {}, { timeout: 180000 }).then((r) => r.data),
  rereadRecord: (id: string) =>
    api.post<{ note: string; records: MedicalRecord[] }>(`/medical/records/${id}/read`, {}, { timeout: 180000 }).then((r) => r.data),
  wholeHistory: () => api.get<MedicalHistory>('/medical/history', { timeout: 120000 }).then((r) => r.data),
  recordFile: (id: string) => api.get<{ url: string | null; expiresInSec: number }>(`/medical/records/${id}/file`).then((r) => r.data),
  deleteBloodTest: (id: string) => api.delete<{ ok: true }>(`/medical/blood-tests/${id}`).then((r) => r.data),
};

export function useStorageUsage() {
  return useQuery({ queryKey: ['medical', 'storage'], queryFn: () => medicalApi.storage() });
}
export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicalApi.deleteRecord(id),
    onSuccess: (recs) => {
      qc.setQueryData(['medical', 'records'], recs);
      // Deleting a report can delete the blood panel it produced, so every
      // surface that reads a panel has to be refetched — not just the record
      // list and the storage bar. Without this, Blood Test Analysis kept
      // rendering the deleted panel's markers and kept counting it in "your
      // health over time", for a full five minutes in the case of trends,
      // which is that query's staleTime.
      syncPanelQueries(qc);
    },
  });
}

/** Delete a blood panel directly (the source document, if any, is kept). */
export function useDeleteBloodTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicalApi.deleteBloodTest(id),
    onSuccess: () => syncPanelQueries(qc),
  });
}

export function useLatestPanel() {
  return useQuery({ queryKey: ['medical', 'latest'], queryFn: () => medicalApi.latest() });
}
/** Longitudinal trends — auto-fetched; the backend returns hasTrends=false until 2+ panels. */
export function useBloodTrends() {
  return useQuery({ queryKey: ['medical', 'trends'], queryFn: () => medicalApi.trends(), staleTime: 5 * 60 * 1000 });
}
export function useBloodHistory(limit?: number) {
  return useQuery({ queryKey: ['medical', 'history', limit ?? 'default'], queryFn: () => medicalApi.history(limit) });
}
/** After any panel change, refresh every surface that reads the panel so Blood
 *  Test Analysis and Health Records stay in lockstep (shared query cache). */
function syncPanelQueries(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['latest', 'history', 'summary', 'supplements', 'records', 'storage', 'trends', 'whole']) {
    void qc.invalidateQueries({ queryKey: ['medical', key] });
  }
}

export function useSaveBloodTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { lab?: string; takenOn?: string; values: Record<string, number>; units?: Record<string, string>; recordId?: string }) => medicalApi.saveBloodTest(input),
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
/** Upload one file and let the server file it. Every surface that reads a
 *  record or a panel is refreshed, because a blood report produces a panel. */
export function useUploadSorted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fileKey: string; mimeType: string; sizeBytes: number; name?: string }) => medicalApi.uploadSorted(input),
    onSuccess: (res) => {
      qc.setQueryData(['medical', 'records'], res.records);
      syncPanelQueries(qc);
    },
  });
}
/** The citizen's tag — or a re-file of a document in the wrong folder. */
export function useTagRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; kind: string }) => medicalApi.tagRecord(v.id, v.kind),
    onSuccess: (res) => {
      qc.setQueryData(['medical', 'records'], res.records);
      syncPanelQueries(qc);
    },
  });
}
/** "Yes, it's mine" — files a document held on a name that did not quite match. */
export function useConfirmRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicalApi.confirmRecord(id),
    onSuccess: (res) => { qc.setQueryData(['medical', 'records'], res.records); syncPanelQueries(qc); },
  });
}
/** Reads, once, a file filed before the vault could read it. */
export function useRereadRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicalApi.rereadRecord(id),
    onSuccess: (res) => { qc.setQueryData(['medical', 'records'], res.records); syncPanelQueries(qc); },
  });
}
/** The whole-history read. Written once server-side and kept, so the client
 *  holds it as long as nothing changes (syncPanelQueries drops it when
 *  something does). */
export function useMedicalHistory() {
  return useQuery({ queryKey: ['medical', 'whole'], queryFn: () => medicalApi.wholeHistory(), staleTime: Infinity, retry: 1 });
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
