import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Dating domain types — mirror the NestJS dating module DTOs. */
export type MatchKind = 'romantic' | 'platonic';

export type Visibility = 'everyone' | 'threshold' | 'paused' | 'hidden';

export interface CompletionSuggestion { key: string; label: string; weight: number }
export interface ProfileCompletion { percent: number; suggestions: CompletionSuggestion[]; complete: boolean }

export interface DatingProfile {
  userId: string;
  gender: 'male' | 'female' | 'nonbinary';
  seeking: 'male' | 'female' | 'nonbinary' | 'any';
  bio: string | null;
  birthDate: string;
  birthTime: string | null;
  birthPlace: string | null;
  interests: string[];
  sign: string;
  visible: boolean;
  visibility?: Visibility;
  minMatchScore?: number;
  completion?: ProfileCompletion;
  extras: string | null;
  moderation: 'approved' | 'pending' | 'rejected' | 'review';
  moderationReasons: string[];
  notice?: string;
}

export interface FactorBreakdown {
  astrology: number; personality: number; relationshipGoals: number;
  values: number; lifestyle: number; interests: number; location: number;
}
export interface CuratedMatch {
  matchId: string | null;
  user: { id: string; handle: string; name: string; profileImage: string | null };
  bio: string | null;
  interests: string[];
  photos?: string[];
  age?: number;
  yourSign: string;
  theirSign: string;
  score: number;
  breakdown?: FactorBreakdown;
  reasons?: string[];
  likedByMe: boolean;
  matched: boolean;
  chatLocked?: boolean;
  conversationId: string | null;
}

export interface UpsertProfileInput {
  gender: DatingProfile['gender'];
  seeking: DatingProfile['seeking'];
  bio?: string;
  birthDate: string;
  birthTime?: string;
  birthPlace?: string;
  interests?: string[];
  extras?: string;
}

export const datingApi = {
  profile: () => api.get<DatingProfile | null>('/dating/profile').then((r) => r.data),
  upsertProfile: (input: UpsertProfileInput) => api.post<DatingProfile>('/dating/profile', input).then((r) => r.data),
  deleteProfile: () => api.delete<{ ok: boolean; deleted: boolean }>('/dating/profile').then((r) => r.data),
  matches: (kind: MatchKind) => api.get<CuratedMatch[]>('/dating/matches', { params: { kind } }).then((r) => r.data),
  like: (targetUserId: string, kind: MatchKind) =>
    api.post<{ matched: boolean; conversationId: string | null; chatLocked: boolean; matchId: string }>(`/dating/matches/${targetUserId}/like`, { kind }).then((r) => r.data),
  unlockChat: (targetUserId: string, kind: MatchKind, method: 'wallet' | 'card' = 'wallet') =>
    api.post<{ conversationId: string; alreadyOpen: boolean }>(`/dating/matches/${targetUserId}/unlock-chat`, { kind, method }).then((r) => r.data),
  pass: (targetUserId: string, kind: MatchKind) =>
    api.post<{ ok: boolean }>(`/dating/matches/${targetUserId}/pass`, { kind }).then((r) => r.data),
};

// ─── Activity Dating ───
export interface ActivityShape { id: string; text: string; category: string; date: string; time: string | null; groupSize: string; description: string | null; createdOn: string }
export interface AnonParty { nickname: string; age: number | null; sign: string | null; verified: boolean; name: string | null; photo: string | null; interests: string[] }
export interface ReceivedInvite { id: string; status: string; trustLevel: number; compatibility: number; conversationId: string | null; activity: ActivityShape; host: AnonParty; myReveal: boolean; otherReveal: boolean; myFriends: boolean; otherFriends: boolean }
export interface ActivityConnection { inviteId: string; compatibility: number; trustLevel: number; conversationId: string | null; myReveal: boolean; otherReveal: boolean; myFriends: boolean; otherFriends: boolean; party: AnonParty }
export interface MyActivity extends ActivityShape { invited: number; connectedCount: number; connections: ActivityConnection[] }
export interface CreateActivityInput { text: string; category: string; date: string; time?: string; groupSize: string; description?: string }

export const activityApi = {
  create: (input: CreateActivityInput) => api.post<{ activity: ActivityShape; invited: number }>('/dating/activities', input).then((r) => r.data),
  mine: () => api.get<MyActivity[]>('/dating/activities/mine').then((r) => r.data),
  invites: () => api.get<ReceivedInvite[]>('/dating/activities/invites').then((r) => r.data),
  respond: (id: string, action: 'connect' | 'pass') => api.post<{ status: string }>(`/dating/activities/invites/${id}/respond`, { action }).then((r) => r.data),
  trust: (id: string, step: 'reveal' | 'friends') => api.post<{ trustLevel: number }>(`/dating/activities/invites/${id}/trust`, { step }).then((r) => r.data),
};

export function useMyActivities() {
  return useQuery({ queryKey: ['dating', 'activities', 'mine'], queryFn: () => activityApi.mine() });
}
export function useActivityInvites() {
  return useQuery({ queryKey: ['dating', 'activities', 'invites'], queryFn: () => activityApi.invites() });
}
export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (i: CreateActivityInput) => activityApi.create(i), onSuccess: () => void qc.invalidateQueries({ queryKey: ['dating', 'activities'] }) });
}
export function useRespondInvite() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; action: 'connect' | 'pass' }) => activityApi.respond(v.id, v.action), onSuccess: () => void qc.invalidateQueries({ queryKey: ['dating', 'activities'] }) });
}
export function useActivityTrust() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; step: 'reveal' | 'friends' }) => activityApi.trust(v.id, v.step), onSuccess: () => void qc.invalidateQueries({ queryKey: ['dating', 'activities'] }) });
}

export function useDatingProfile() {
  return useQuery({ queryKey: ['dating', 'profile'], queryFn: () => datingApi.profile() });
}
export function useUpsertDatingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertProfileInput) => datingApi.upsertProfile(input),
    onSuccess: (profile) => {
      qc.setQueryData(['dating', 'profile'], profile);
      // A saved edit changes compatibility — refresh the match lists.
      void qc.invalidateQueries({ queryKey: ['dating', 'matches'] });
    },
  });
}
export function useDeleteDatingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => datingApi.deleteProfile(),
    onSuccess: () => {
      qc.setQueryData(['dating', 'profile'], null);
      void qc.invalidateQueries({ queryKey: ['dating'] });
    },
  });
}
export function useMatches(kind: MatchKind, enabled = true) {
  return useQuery({ queryKey: ['dating', 'matches', kind], queryFn: () => datingApi.matches(kind), enabled });
}
export function useLikeMatch(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) => datingApi.like(targetUserId, kind),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dating', 'matches', kind] }),
  });
}
export function useUnlockChat(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { targetUserId: string; method: 'wallet' | 'card' }) => datingApi.unlockChat(v.targetUserId, kind, v.method),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dating', 'matches', kind] }); void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}
export function usePassMatch(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) => datingApi.pass(targetUserId, kind),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dating', 'matches', kind] }),
  });
}
