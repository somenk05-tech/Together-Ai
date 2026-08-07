import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

export interface AdminMe {
  roles: string[];
  permissions: Array<{ key: string; label: string }>;
  roleCatalogue: Record<string, string[]>;
}
export interface QueueItem {
  id: string; slug: string | null;
  businessName: string; categoryKey: string; city: string; areas: string[];
  about: string | null; photos: string[];
  createdAt: string; waitingHours: number;
  owner: { name: string; handle: string; joinedAt: string } | null;
}
export interface AuditItem {
  id: string; action: string; entity: string; entityId: string;
  before: string | null; after: string | null; reason: string; at: string;
  actor: { name: string; handle: string } | null;
}

/**
 * A person, as this console is allowed to see them.
 *
 * `email` and `phone` arrive MASKED from the server and there is no unmasked
 * variant to fetch. That is a decision recorded in citizen-view.ts on the API
 * side, not a rendering choice here — see the note there before adding a field
 * to this interface.
 */
export interface CitizenView {
  id: string; handle: string; name: string;
  city: string | null; profileImage: string | null;
  joinedAt: string; lastSeen: string;
  email: string | null; emailVerified: boolean;
  phone: string | null; phoneVerified: boolean;
  /** True when email and phone above are the REAL values rather than masks.
   *  The screen must look different when this is true — see Dev.tsx. */
  contactRevealed: boolean;
  status: 'live' | 'suspended' | 'deleted' | 'purged';
  suspendedAt: string | null; suspendedReason: string | null;
  moderator: boolean;
}
export interface CitizenRecord {
  citizen: CitizenView;
  listings: Array<{ id: string; slug: string | null; businessName: string; categoryKey: string; city: string; moderation: string; createdAt: string }>;
  reportsMade: number;
  reportsAbout: Array<{ id: string; reason: string | null; status: string; createdAt: string }>;
  grants: Array<{ role: string; grantedAt: string; grantedBy: string; reason: string }>;
  history: Array<{ id: string; action: string; reason: string; at: string; actor: { name: string; handle: string } | null }>;
}
export interface CitizenActivity {
  counts: Record<string, number>;
  /** Presence only. Whether a hub has been used, never what is in it. */
  profiles: Record<string, boolean>;
  sessions: { activeSessions: number; pushDevices: number };
}
export interface BusinessRecord {
  listing: {
    id: string; slug: string | null; businessName: string; categoryKey: string;
    city: string; areas: string[]; about: string | null; photos: string[];
    moderation: string; createdAt: string; reviewCount: number;
  };
  owner: CitizenView | null;
  alsoOwns: Array<{ id: string; businessName: string; moderation: string }>;
  autoModeration: string | null;
  moderationLog: Array<{ id: string; actor: string; decision: string; reason: string; at: string }>;
  history: Array<{ id: string; action: string; reason: string; at: string; actor: { name: string; handle: string } | null }>;
}

export const adminApi = {
  me: () => api.get<AdminMe>('/admin/me').then((r) => r.data),
  queue: () => api.get<{ items: QueueItem[]; waiting: number }>('/admin/queue').then((r) => r.data),
  decide: (id: string, decision: 'approved' | 'rejected' | 'removed', reason: string) =>
    api.post<{ id: string; moderation: string }>(`/admin/queue/${id}/decision`, { decision, reason }).then((r) => r.data),
  audit: (q: { entity?: string; entityId?: string } = {}) =>
    api.get<{ items: AuditItem[] }>('/admin/audit', { params: q }).then((r) => r.data),
  citizens: (q: { q?: string; status?: string } = {}) =>
    api.get<{ items: CitizenView[]; limit: number; truncated: boolean }>('/admin/citizens', { params: q }).then((r) => r.data),
  citizen: (id: string, opts: { unmask?: boolean; reason?: string } = {}) =>
    api.get<CitizenRecord>(`/admin/citizens/${id}`, {
      params: opts.unmask ? { unmask: '1', reason: opts.reason ?? '' } : undefined,
    }).then((r) => r.data),
  activity: (id: string) =>
    api.get<CitizenActivity>(`/admin/citizens/${id}/activity`).then((r) => r.data),
  exportCitizens: (reason: string) =>
    api.get<{ csv: string; rows: number; contactMasked: boolean }>('/admin/citizens/export', { params: { reason } })
      .then((r) => r.data),
  setSuspended: (id: string, suspended: boolean, reason: string) =>
    api.post<{ id: string; suspended: boolean }>(`/admin/citizens/${id}/suspension`, { suspended, reason }).then((r) => r.data),
  business: (id: string) =>
    api.get<BusinessRecord>(`/admin/businesses/${id}`).then((r) => r.data),
};

/** Who you are in console terms. Everything else on this screen waits on it —
 *  a queue rendered before the permissions are known is a queue that flashes
 *  in front of somebody who may not open it. */
export function useAdminMe() {
  return useQuery({ queryKey: ['admin', 'me'], queryFn: () => adminApi.me(), retry: false });
}
export function useAdminQueue(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'queue'], queryFn: () => adminApi.queue(), enabled, retry: false });
}
export function useAdminAudit(enabled: boolean) {
  return useQuery({ queryKey: ['admin', 'audit'], queryFn: () => adminApi.audit(), enabled, retry: false });
}
export function useDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; decision: 'approved' | 'rejected' | 'removed'; reason: string }) =>
      adminApi.decide(v.id, v.decision, v.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      // The decision changes what citizens see, so the directory is stale too.
      void qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

/** The search. Debouncing lives in the screen; this only runs when there is
 *  something to run on, so an empty box is not a full-table scan per keystroke. */
export function useCitizens(enabled: boolean, q: { q?: string; status?: string }) {
  return useQuery({
    queryKey: ['admin', 'citizens', q],
    queryFn: () => adminApi.citizens(q),
    enabled: enabled && Boolean(q.q?.trim() || q.status),
    retry: false,
  });
}
export function useCitizen(id: string | null, unmask: { on: boolean; reason: string } = { on: false, reason: '' }) {
  return useQuery({
    // The unmask state is part of the key, so revealing refetches rather than
    // serving the masked copy the cache already has.
    queryKey: ['admin', 'citizen', id, unmask.on],
    queryFn: () => adminApi.citizen(id as string, unmask.on ? { unmask: true, reason: unmask.reason } : {}),
    enabled: Boolean(id),
    retry: false,
    // A revealed record is never cached: closing the panel and reopening it
    // should show the mask again, because the reveal was an act and acts do
    // not persist across a page somebody walked away from.
    gcTime: unmask.on ? 0 : undefined,
    staleTime: 0,
  });
}
export function useCitizenActivity(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'citizen', id, 'activity'],
    queryFn: () => adminApi.activity(id as string),
    enabled: Boolean(id),
    retry: false,
  });
}
export function useBusinessRecord(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'business', id],
    queryFn: () => adminApi.business(id as string),
    enabled: Boolean(id),
    retry: false,
  });
}
export function useSetSuspended() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; suspended: boolean; reason: string }) =>
      adminApi.setSuspended(v.id, v.suspended, v.reason),
    // The whole console, not just this record: a suspension changes the audit
    // log and the search results as well as the person's own page.
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin'] }); },
  });
}
