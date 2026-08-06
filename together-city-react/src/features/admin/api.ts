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

export const adminApi = {
  me: () => api.get<AdminMe>('/admin/me').then((r) => r.data),
  queue: () => api.get<{ items: QueueItem[]; waiting: number }>('/admin/queue').then((r) => r.data),
  decide: (id: string, decision: 'approved' | 'rejected' | 'removed', reason: string) =>
    api.post<{ id: string; moderation: string }>(`/admin/queue/${id}/decision`, { decision, reason }).then((r) => r.data),
  audit: (q: { entity?: string; entityId?: string } = {}) =>
    api.get<{ items: AuditItem[] }>('/admin/audit', { params: q }).then((r) => r.data),
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
