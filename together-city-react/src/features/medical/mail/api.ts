import { useEffect } from 'react';
import { http as api } from '@/api/client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { socketClient } from '@/api/socket';
import { WS } from '@/api/events';

/**
 * Medical Mail (owner, 16 Sep) — the citizen's permanent medical address and
 * everything that arrives at it. Every read here is the signed-in citizen's
 * own; the server scopes it. Query keys all start with 'medical-mail' so a
 * new arrival (a `medical_mail` notification over the socket) can refresh
 * the lot in one call — see useMedicalMailLive.
 */
export type Classification = 'medical' | 'likely-medical' | 'unknown' | 'personal' | 'spam' | 'blocked';
export type AttachmentStatus = 'processing' | 'stored' | 'analyzed' | 'needs_review' | 'duplicate' | 'failed';
export interface MedicalAttachment {
  id: string; filename: string; mimeType: string; sizeBytes: number; status: AttachmentStatus; error: string | null;
  recordId: string | null; documentType: string | null; stored: boolean; canSave: boolean;
  recordTitle?: string | null; recordKind?: string | null; analysisReady?: boolean;
}
export interface MedicalEmailItem {
  id: string; fromAddr: string; fromName: string; toAddr: string; subject: string; snippet: string; receivedAt: string;
  read: boolean; starred: boolean; archived: boolean; deleted: boolean;
  classification: Classification; category: string | null; confidence: number; why: string; authenticated: boolean | null;
  attachmentCount: number; attachments: MedicalAttachment[];
}
export interface MedicalEmail extends MedicalEmailItem { body: string }
export interface TimelineItem { id: string; at: string; day: string; type: string; title: string; source: string; recordId: string | null; emailId: string | null }
export interface MedicalMailHome {
  address: string; status: 'active' | 'paused';
  stats: { total: number; unread: number; documents: number; recentReports: number };
  recent: MedicalEmailItem[];
  recentDocuments: Array<MedicalAttachment & { emailId: string; fromName: string; subject: string; receivedAt: string }>;
  timeline: TimelineItem[];
}
export interface SenderRule { id: string; pattern: string; kind: 'address' | 'domain'; rule: 'medical' | 'personal'; createdAt: string }
export interface MedicalMailSettings {
  address: string; status: 'active' | 'paused'; createdAt: string;
  processDocuments: boolean; aiAnalysis: boolean; autoLink: boolean; classifyEmails: boolean; notify: boolean;
  rules: SenderRule[];
}
export type Folder = 'inbox' | 'archived' | 'starred' | 'trash' | 'attachments' | 'all';

/** The chips on the page: a label and the categories it groups. */
export const CATEGORY_CHIPS: Array<{ key: string; label: string; categories: string[]; documents?: true }> = [
  { key: 'all', label: 'All', categories: [] },
  { key: 'doctors', label: 'Doctors', categories: ['doctor'] },
  { key: 'hospitals', label: 'Hospitals', categories: ['hospital'] },
  { key: 'labs', label: 'Labs', categories: ['laboratory', 'blood-test', 'pathology'] },
  { key: 'prescriptions', label: 'Prescriptions', categories: ['prescription', 'pharmacy'] },
  // Reports = every email that produced a document, plus the report-shaped
  // categories — the same thing the "recent reports" tile counts.
  { key: 'reports', label: 'Reports', categories: ['diagnostic-report', 'radiology', 'pathology', 'vaccination'], documents: true },
  { key: 'insurance', label: 'Insurance', categories: ['insurance'] },
  { key: 'appointments', label: 'Appointments', categories: ['appointment'] },
  { key: 'bills', label: 'Bills', categories: ['medical-bill'] },
  { key: 'other', label: 'Other', categories: ['other-medical'] },
];
export const CATEGORY_LABEL: Record<string, string> = {
  doctor: 'Doctor', hospital: 'Hospital', laboratory: 'Laboratory', pharmacy: 'Pharmacy', insurance: 'Insurance',
  appointment: 'Appointment', prescription: 'Prescription', 'diagnostic-report': 'Diagnostic report', 'blood-test': 'Blood test',
  radiology: 'Radiology', pathology: 'Pathology', vaccination: 'Vaccination', 'medical-bill': 'Medical bill', 'other-medical': 'Other medical',
};
export const categoryLabel = (c: string | null): string => (c ? CATEGORY_LABEL[c] ?? c : 'Unsorted');
/** The vault's folders, as the Health Records page tags them. */
export const RECORD_KIND_LABEL: Record<string, string> = {
  'blood-test': 'Blood test', 'urine-test': 'Urine test', 'stool-test': 'Stool test', imaging: 'Scan / X-ray', 'heart-test': 'Heart test',
  'lung-test': 'Lung test', 'brain-test': 'Brain test', 'eye-test': 'Eye test', 'bone-joint': 'Bone & joint', genetic: 'Genetic test',
  'womens-health': "Women's health", 'mens-health': "Men's health", prescription: 'Prescription', report: 'Medical report', condition: 'Condition',
  allergy: 'Allergy', vaccination: 'Vaccination', hospital: 'Hospital record', note: 'Doctor note',
};
export const recordKindLabel = (k: string | null): string => (k ? RECORD_KIND_LABEL[k] ?? k : 'Unsorted');
export const STATUS_LABEL: Record<AttachmentStatus, string> = {
  processing: '⟳ Processing', stored: '✓ Stored in Medical Records', analyzed: '✓ Stored · analysis ready',
  needs_review: 'Needs your review', duplicate: '✓ Already in Medical Records', failed: '⚠ Not stored',
};

export const medicalMailApi = {
  home: () => api.get<MedicalMailHome>('/medical/mail').then((r) => r.data),
  badge: () => api.get<{ unread: number }>('/medical/mail/badge').then((r) => r.data),
  list: (p: { folder: Folder; category?: string; documents?: '1'; q?: string; cursor?: string }) =>
    api.get<{ items: MedicalEmailItem[]; nextCursor: string | null }>('/medical/mail/messages', { params: { limit: 25, ...p } }).then((r) => r.data),
  get: (id: string) => api.get<MedicalEmail>(`/medical/mail/messages/${id}`).then((r) => r.data),
  flag: (id: string, body: { read?: boolean; starred?: boolean; archived?: boolean }) => api.patch<{ ok: true }>(`/medical/mail/messages/${id}`, body).then((r) => r.data),
  remove: (id: string, forever = false) => api.delete<{ ok: true; trashed: boolean }>(`/medical/mail/messages/${id}`, { params: forever ? { forever: '1' } : {} }).then((r) => r.data),
  restore: (id: string) => api.post<{ ok: true }>(`/medical/mail/messages/${id}/restore`).then((r) => r.data),
  emptyTrash: () => api.post<{ ok: true; removed: number }>('/medical/mail/trash/empty').then((r) => r.data),
  reclassify: (id: string, body: { classification?: Classification; category?: string | null; rememberSender?: 'medical' | 'personal'; scope?: 'address' | 'domain' }) =>
    api.post<MedicalEmail>(`/medical/mail/messages/${id}/classify`, body).then((r) => r.data),
  toMail: (id: string, rememberSender?: 'medical' | 'personal') => api.post<{ mailMessageId: string }>(`/medical/mail/messages/${id}/to-mail`, { rememberSender }).then((r) => r.data),
  fromMail: (mailMessageId: string, rememberSender?: 'medical' | 'personal') => api.post<{ emailId: string }>('/medical/mail/from-mail', { mailMessageId, rememberSender }).then((r) => r.data),
  dismissHint: (mailMessageId: string, rememberSender?: 'medical' | 'personal') => api.post<{ ok: true }>(`/medical/mail/hints/${mailMessageId}/dismiss`, { rememberSender }).then((r) => r.data),
  attachmentUrl: (id: string, attachmentId: string) => api.get<{ url: string | null; expiresInSec: number }>(`/medical/mail/messages/${id}/attachments/${attachmentId}/url`).then((r) => r.data),
  saveAttachment: (id: string, attachmentId: string) => api.post<MedicalEmail>(`/medical/mail/messages/${id}/attachments/${attachmentId}/save`).then((r) => r.data),
  analyze: (id: string, attachmentId: string) => api.post<{ recordId: string; bloodTestId: string | null; note: string; href: string; label: string }>(`/medical/mail/messages/${id}/attachments/${attachmentId}/analyze`).then((r) => r.data),
  timeline: () => api.get<TimelineItem[]>('/medical/mail/timeline').then((r) => r.data),
  provenance: (recordId: string) => api.get<{ recordId: string; emails: Array<{ emailId: string; subject: string; fromName: string; fromAddr: string; receivedAt: string; attachmentId: string; filename: string; sha256: string; duplicate: boolean }>; trail: Array<{ action: string; at: string; by: string }> }>(`/medical/mail/records/${recordId}/provenance`).then((r) => r.data),
  settings: () => api.get<MedicalMailSettings>('/medical/mail/settings').then((r) => r.data),
  updateSettings: (body: Partial<Pick<MedicalMailSettings, 'status' | 'processDocuments' | 'aiAnalysis' | 'autoLink' | 'classifyEmails' | 'notify'>>) => api.patch<MedicalMailSettings>('/medical/mail/settings', body).then((r) => r.data),
  setRule: (body: { pattern: string; kind: 'address' | 'domain'; rule: 'medical' | 'personal' }) => api.post<SenderRule[]>('/medical/mail/rules', body).then((r) => r.data),
  deleteRule: (id: string) => api.delete<SenderRule[]>(`/medical/mail/rules/${id}`).then((r) => r.data),
  ops: (days: number) => api.get<Record<string, unknown>>('/dev/medical-mail', { params: { days } }).then((r) => r.data),
};

const KEY = ['medical-mail'] as const;

export function useMedicalMailHome() {
  return useQuery({ queryKey: [...KEY, 'home'], queryFn: medicalMailApi.home });
}
/** The rail badge — one number, read only inside the Medical Hub. */
export function useMedicalMailBadge(enabled: boolean) {
  return useQuery({ queryKey: [...KEY, 'badge'], queryFn: medicalMailApi.badge, enabled, staleTime: 60_000 });
}
export function useMedicalMailList(p: { folder: Folder; category?: string; documents?: '1'; q?: string }) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'list', p.folder, p.category ?? '', p.documents ?? '', p.q ?? ''],
    queryFn: ({ pageParam }) => medicalMailApi.list({ ...p, cursor: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
export function useMedicalEmail(id: string) {
  return useQuery({ queryKey: [...KEY, 'msg', id], queryFn: () => medicalMailApi.get(id), enabled: Boolean(id) });
}
export function useMedicalMailTimeline() {
  return useQuery({ queryKey: [...KEY, 'timeline'], queryFn: medicalMailApi.timeline });
}
export function useMedicalMailSettings() {
  return useQuery({ queryKey: [...KEY, 'settings'], queryFn: medicalMailApi.settings });
}
export function useProvenance(recordId: string | null) {
  return useQuery({ queryKey: [...KEY, 'provenance', recordId], queryFn: () => medicalMailApi.provenance(recordId as string), enabled: Boolean(recordId) });
}
export function useMedicalMailOps(days: number) {
  return useQuery({ queryKey: [...KEY, 'ops', days], queryFn: () => medicalMailApi.ops(days) });
}

/** Any change to the mailbox invalidates all of it — and Health Records,
 *  because a filed attachment is a record. */
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['medical', 'records'] });
    void qc.invalidateQueries({ queryKey: ['medical', 'storage'] });
  };
}
export function useFlagMedicalEmail() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { id: string; read?: boolean; starred?: boolean; archived?: boolean }) => medicalMailApi.flag(v.id, v), onSuccess: inv });
}
export function useRemoveMedicalEmail() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { id: string; forever?: boolean }) => medicalMailApi.remove(v.id, v.forever), onSuccess: inv });
}
export function useRestoreMedicalEmail() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => medicalMailApi.restore(id), onSuccess: inv });
}
export function useEmptyMedicalTrash() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => medicalMailApi.emptyTrash(), onSuccess: inv });
}
export function useReclassify() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { id: string; classification?: Classification; category?: string | null; rememberSender?: 'medical' | 'personal'; scope?: 'address' | 'domain' }) => medicalMailApi.reclassify(v.id, v), onSuccess: inv });
}
export function useMoveToMail() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { id: string; rememberSender?: 'medical' | 'personal' }) => medicalMailApi.toMail(v.id, v.rememberSender), onSuccess: () => { inv(); } });
}
export function useMoveFromMail() {
  const qc = useQueryClient();
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { mailMessageId: string; rememberSender?: 'medical' | 'personal' }) => medicalMailApi.fromMail(v.mailMessageId, v.rememberSender), onSuccess: () => { inv(); void qc.invalidateQueries({ queryKey: ['mail'] }); } });
}
export function useDismissHint() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { mailMessageId: string; rememberSender?: 'medical' | 'personal' }) => medicalMailApi.dismissHint(v.mailMessageId, v.rememberSender), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mail'] }); } });
}
export function useSaveAttachment() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { id: string; attachmentId: string }) => medicalMailApi.saveAttachment(v.id, v.attachmentId), onSuccess: inv });
}
export function useAnalyzeAttachment() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (v: { id: string; attachmentId: string }) => medicalMailApi.analyze(v.id, v.attachmentId), onSuccess: inv });
}
export function useUpdateMedicalMailSettings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: medicalMailApi.updateSettings, onSuccess: (s) => qc.setQueryData([...KEY, 'settings'], s) });
}
export function useSetSenderRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: medicalMailApi.setRule, onSuccess: () => { void qc.invalidateQueries({ queryKey: [...KEY, 'settings'] }); } });
}
export function useDeleteSenderRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => medicalMailApi.deleteRule(id), onSuccess: () => { void qc.invalidateQueries({ queryKey: [...KEY, 'settings'] }); } });
}

/**
 * REALTIME. A medical arrival is a `medical_mail` notification, and the
 * bell's socket already carries every notification — so the mailbox, the
 * badge, the timeline and Health Records refresh the moment one lands,
 * with no polling and no second channel. Mounted by the Medical Hub's rail.
 */
export function useMedicalMailLive(enabled = true): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const off = socketClient.on<{ kind?: string }>(WS.NOTIFICATION_NEW, (n) => {
      if (n?.kind !== 'medical_mail') return;
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['medical', 'records'] });
    });
    return off;
  }, [qc, enabled]);
}

/** Open a private document through a fresh short-lived link — the tab is
 *  opened inside the click, then pointed, so popup blockers stay quiet. */
export async function openAttachment(id: string, attachmentId: string): Promise<void> {
  const w = window.open('', '_blank');
  try {
    const { url } = await medicalMailApi.attachmentUrl(id, attachmentId);
    if (url && w) w.location.href = url; else if (w) w.close();
  } catch { if (w) w.close(); }
}

export const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};
/** "Today", "Yesterday", else the date — the landing page's own clock. */
export const whenLabel = (iso: string): string => {
  const d = new Date(iso); const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};
