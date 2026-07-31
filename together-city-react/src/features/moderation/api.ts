import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';
import type { PostAuthor } from '@/features/social/api';

/**
 * The moderation queue (FE-13.7).
 *
 * Note what is not here: any way to learn who reported anything. The API counts
 * reporters and does not return them, and this mirrors that shape so a future
 * screen cannot render a field it was never given.
 */
export type ReportSubject =
  | { kind: 'post'; gone: true }
  | { kind: 'post'; gone: false; text: string | null; createdAt: string; moderation: string; author: PostAuthor }
  | { kind: 'user'; gone: true }
  | { kind: 'user'; gone: false; user: PostAuthor }
  | { kind: 'comment'; gone: true }
  | { kind: 'comment'; gone: false; comment: { id: string; text: string; createdAt: string; author: PostAuthor } };

export interface ReportGroup {
  targetType: 'user' | 'post' | 'comment';
  targetId: string;
  reportCount: number;
  distinctReporters: number;
  reasons: string[];
  firstReportedAt: string;
  lastReportedAt: string;
  subject: ReportSubject;
}

export interface ReportQueue { items: ReportGroup[]; openTotal: number }

export const moderationApi = {
  queue: () => api.get<ReportQueue>('/social/reports/queue').then((r) => r.data),
  decide: (dto: { targetType: string; targetId: string; decision: 'remove' | 'dismiss'; note?: string }) =>
    api.post<{ decided: string; reportsClosed: number }>('/social/reports/decide', dto).then((r) => r.data),
};

export function useReportQueue() {
  return useQuery({ queryKey: ['moderation', 'queue'], queryFn: () => moderationApi.queue(), retry: false });
}

export function useDecideReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: moderationApi.decide,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['moderation', 'queue'] });
      // A removed post leaves the feed and every grid; drop what reads them.
      void qc.invalidateQueries({ queryKey: ['social'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
