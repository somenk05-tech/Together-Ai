import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Dating domain types — mirror the NestJS dating module DTOs. */
export type MatchKind = 'romantic' | 'platonic';

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
  matches: (kind: MatchKind) => api.get<CuratedMatch[]>('/dating/matches', { params: { kind } }).then((r) => r.data),
  like: (targetUserId: string, kind: MatchKind) =>
    api.post<{ matched: boolean; conversationId: string | null; chatLocked: boolean; matchId: string }>(`/dating/matches/${targetUserId}/like`, { kind }).then((r) => r.data),
  unlockChat: (targetUserId: string, kind: MatchKind, method: 'wallet' | 'card' = 'wallet') =>
    api.post<{ conversationId: string; alreadyOpen: boolean }>(`/dating/matches/${targetUserId}/unlock-chat`, { kind, method }).then((r) => r.data),
  pass: (targetUserId: string, kind: MatchKind) =>
    api.post<{ ok: boolean }>(`/dating/matches/${targetUserId}/pass`, { kind }).then((r) => r.data),
};

export function useDatingProfile() {
  return useQuery({ queryKey: ['dating', 'profile'], queryFn: () => datingApi.profile() });
}
export function useUpsertDatingProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertProfileInput) => datingApi.upsertProfile(input),
    onSuccess: (profile) => qc.setQueryData(['dating', 'profile'], profile),
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
