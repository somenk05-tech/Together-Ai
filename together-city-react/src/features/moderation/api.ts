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
  | { kind: 'user'; gone: false; user: PostAuthor; dating: DatingSubject | null }
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
  /** A re-filing: somebody already decided this and the reporter came back.
   *  Null on the ordinary case, which is most of them. Re-filing used to clear
   *  these columns and stamp `firstReportedAt` forward, which hid the prior
   *  dismissal from the next moderator and sent the escalation to the bottom of
   *  a queue sorted oldest-first. */
  priorDecision: string | null;
  priorDecidedAt: string | null;
  subject: ReportSubject;
}

export interface ReportQueue { items: ReportGroup[]; openTotal: number }

export const moderationApi = {
  queue: () => api.get<ReportQueue>('/social/reports/queue').then((r) => r.data),
  /** `note` is INTERNAL — the audit row and the next moderator, and nothing
   *  else. It used to be delivered verbatim to the person reported. */
  decide: (dto: { targetType: string; targetId: string; decision: 'remove' | 'dismiss' | 'warn' | 'suspend' | 'avatar'; note?: string }) =>
    api.post<{ decided: string; reportsClosed: number }>('/social/reports/decide', dto).then((r) => r.data),
  /**
   * The one thing this screen can do about a reported PERSON, and it is not an
   * account action: it takes their dating profile out of everybody's pool and
   * leaves the rest of the city untouched. Until 26 Aug a report about a dating
   * user could only be dismissed — the decide endpoint refuses to remove
   * anything but a post, deliberately, and still does.
   */
  datingDecision: (userId: string, dto: { decision: 'approved' | 'rejected'; reason: string }) =>
    api.post<{ userId: string; moderation: string }>(`/dating/admin/moderation/${encodeURIComponent(userId)}`, dto).then((r) => r.data),
  /** Photos the machine held for a person, oldest first, each with a short-lived URL. */
  heldPhotos: () => api.get<HeldPhoto[]>('/dating/admin/photos').then((r) => r.data),
  heldProfiles: () => api.get<HeldProfile[]>('/dating/admin/profiles').then((r) => r.data),
  profileDecision: (targetUserId: string, dto: { decision: 'approved' | 'rejected'; reason: string }) =>
    api.post<{ userId: string; moderation: string }>(`/dating/admin/moderation/${targetUserId}`, dto).then((r) => r.data),
  /** One-off: queue a review for every photo that predates photo review. */
  photoBackfill: () => api.post<{ queued: number }>('/dating/admin/photos/backfill').then((r) => r.data),
  photoDecision: (dto: { key: string; decision: 'approved' | 'rejected'; reason: string }) =>
    api.post<{ key: string; status: string }>('/dating/admin/photos/decide', dto).then((r) => r.data),
  appeals: () => api.get<Appeal[]>('/dating/admin/appeals').then((r) => r.data),
  decideAppeal: (id: string, dto: { decision: 'upheld' | 'overturned'; reason: string }) =>
    api.post<{ id: string; status: string }>(`/dating/admin/appeals/${encodeURIComponent(id)}/decide`, dto).then((r) => r.data),
};

/** The reported citizen's dating profile, as a moderator is shown it: only
 *  what another citizen could already see, and a photo COUNT rather than the
 *  photographs — those are reviewed in the held-photo queue, which is the
 *  screen that has a reason to show them. */
export interface DatingSubject {
  bio: string | null; shownName: string | null; city: string | null;
  photos: number; age: number | null;
  moderation: string | null; visible: boolean | null; updatedAt: string | null;
}

export interface HeldPhoto { key: string; userId: string; status: string; labels: string; reason: string; createdAt: string; url: string | null }
/** A dating profile waiting for a person: held by a soft check, or stuck. */
export interface HeldProfile {
  userId: string; name: string; status: string;
  age: number | null; bio: string; reasons: string[]; waitingSince: string;
}
export interface Appeal {
  id: string; userId: string; kind: 'dating_profile' | 'dating_photo'; targetId: string;
  text: string; status: string; createdAt: string;
  /** Present on profile appeals (blocker 06): the three facts the decision
   *  turns on, so a moderator is not overturning a rejection blind. */
  age?: number | null; profileModeration?: string | null; rejectionReasons?: string[];
  /** Present on photo appeals (fourth audit): the photograph itself where one
   *  still exists, and an honest flag where it does not — a rejection deletes
   *  the object, so an overturn is sometimes a ruling on a description. */
  url?: string | null; photoGone?: boolean;
}

export function useHeldPhotos() {
  return useQuery({ queryKey: ['moderation', 'photos'], queryFn: () => moderationApi.heldPhotos(), retry: false });
}

export function usePhotoBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: moderationApi.photoBackfill,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['moderation', 'photos'] }); },
  });
}

export function usePhotoDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: moderationApi.photoDecision,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['moderation', 'photos'] }); },
  });
}

export function useHeldProfiles() {
  return useQuery({ queryKey: ['moderation', 'profiles'], queryFn: () => moderationApi.heldProfiles(), retry: false });
}

/**
 * The same route the console's other profile decisions use. Invalidates the
 * dating keys too: a decision here changes who is in the pool.
 */
export function useProfileDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...dto }: { userId: string; decision: 'approved' | 'rejected'; reason: string }) =>
      moderationApi.profileDecision(userId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['moderation', 'profiles'] });
      void qc.invalidateQueries({ queryKey: ['dating'] });
    },
  });
}

export function useAppeals() {
  return useQuery({ queryKey: ['moderation', 'appeals'], queryFn: () => moderationApi.appeals(), retry: false });
}

export function useDecideAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string; decision: 'upheld' | 'overturned'; reason: string }) => moderationApi.decideAppeal(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['moderation', 'appeals'] });
      void qc.invalidateQueries({ queryKey: ['dating'] });
    },
  });
}

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

export function useDatingDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...dto }: { userId: string; decision: 'approved' | 'rejected'; reason: string }) =>
      moderationApi.datingDecision(userId, dto),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dating'] }); },
  });
}
