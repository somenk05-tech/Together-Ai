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

export interface MatchDetail {
  user: { id: string; handle: string; name: string; profileImage: string | null };
  name: string;
  age: number;
  gender: string;
  bio: string | null;
  photos: string[];
  interests: string[];
  personalityTraits: string[];
  values: string[];
  city: string | null;
  state: string | null;
  heightCm: number | null;
  languages: string[];
  relationshipGoal: string | null;
  diet: string | null; smoking: string | null; drinking: string | null;
  fitnessLevel: string | null; education: string | null; occupation: string | null;
  /** A selfie is stored on this profile. NOT identity: nothing compares it to
   *  their photos, and the camera-only rule is enforced by the capture UI rather
   *  than the server. Render it through components/SelfieOnFile, which says so.
   *  The name stays for now because the API shape is stable; when a real face
   *  match ships, this becomes two fields and one of them earns the word. */
  verified: boolean;
  yourSign: string; theirSign: string;
  score: number;
  breakdown: FactorBreakdown;
  reasons: string[];
  likedByMe: boolean;
  matched: boolean;
  conversationId: string | null;
}

/** Low-density discovery mode (audit 6.1): sectioned results with a relaxed
 *  bar + fallback categories when ideal ≥75% matches are scarce. */
export interface DiscoverSection {
  key: string;
  label: string;
  note: string;
  tier: 'ideal' | 'recommended' | 'discovery';
  matches: CuratedMatch[];
}
export interface DiscoverResult {
  sections: DiscoverSection[];
  idealCount: number;
  lowDensity: boolean;
  totalDiscoverable: number;
}

export interface UpsertProfileInput {
  /**
   * Empty until the citizen chooses (p1, FE-15.1: "no fake or sample values
   * anywhere"). The form used to open with 'male' preselected, so anyone who
   * saved without touching it had a gender recorded that they never picked.
   */
  gender: DatingProfile['gender'] | '';
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
  discover: (kind: MatchKind) => api.get<DiscoverResult>('/dating/discover', { params: { kind } }).then((r) => r.data),
  matchDetail: (targetUserId: string, kind: MatchKind) => api.get<MatchDetail>(`/dating/matches/${targetUserId}`, { params: { kind } }).then((r) => r.data),
  like: (targetUserId: string, kind: MatchKind) =>
    api.post<{ matched: boolean; conversationId: string | null; chatLocked: boolean; matchId: string }>(`/dating/matches/${targetUserId}/like`, { kind }).then((r) => r.data),
  unlockChat: (targetUserId: string, kind: MatchKind, method: 'wallet' | 'card' = 'wallet') =>
    api.post<{ conversationId: string; alreadyOpen: boolean; chargedInr?: number }>(`/dating/matches/${targetUserId}/unlock-chat`, { kind, method }).then((r) => r.data),
  connect: (targetUserId: string, kind: MatchKind, method: 'wallet' | 'card' = 'wallet') =>
    api.post<{ conversationId: string; alreadyOpen: boolean; chargedInr: number }>(`/dating/matches/${targetUserId}/connect`, { kind, method }).then((r) => r.data),
  unmatch: (targetUserId: string, kind: MatchKind) =>
    api.post<{ ok: boolean }>(`/dating/matches/${targetUserId}/unmatch`, { kind }).then((r) => r.data),
  reveal: (targetUserId: string, kind: MatchKind, show = true) =>
    api.post<{ revealed: boolean; myReveal: boolean }>(`/dating/matches/${targetUserId}/reveal`, { kind, show }).then((r) => r.data),
  pass: (targetUserId: string, kind: MatchKind) =>
    api.post<{ ok: boolean }>(`/dating/matches/${targetUserId}/pass`, { kind }).then((r) => r.data),
  chats: () => api.get<DatingChatSummary[]>('/dating/chats').then((r) => r.data),
  stack: (kind: MatchKind) => api.get<DatingStack>('/dating/stack', { params: { kind } }).then((r) => r.data),
  adminStats: () => api.get<DatingAdminStats>('/dating/admin/stats').then((r) => r.data),
};

export interface DatingAdminStats {
  totalProfiles: number;
  approvedVisible: number;
  pendingReview: number;
  rejected: number;
  pausedHidden: number;
  gender: { male: number; female: number; nonbinary: number };
  connectedMembers: number;
  activeChats: number;
  totalMatches: number;
  mutualLikes: number;
  generatedAt: string;
}

export interface CompatibilityBand { label: string; min: number; max: number; count: number }
export interface DatingStack {
  engaged: boolean;
  distribution: CompatibilityBand[];
  /** The highest-scoring candidate. The page leads with it — but it is the
   *  first of `candidates`, not the only one anybody gets to see. */
  top: CuratedMatch | null;
  /** Everyone who passes your filters, ranked, each with their percentage.
   *  Not a page of them — the whole list. The score is an opinion; who is
   *  worth talking to is the citizen's decision. */
  candidates: CuratedMatch[];
  /** People you have mutually liked. They stay on the Curated Matches page —
   *  a match is the point of the hub, not something to disappear on you. */
  matched: CuratedMatch[];
  totalCandidates: number;
}

export interface DatingChatSummary {
  /** Null until Connect to Chat opens the conversation. */
  conversationId: string | null;
  /** A mutual match whose chat has not been opened yet. */
  pending: boolean;
  otherUserId: string;
  name: string;
  photo: string | null;
  sign: string | null;
  age: number | null;
  revealed: boolean;
  /** Whether YOU are chatting under your real name. Your choice alone. */
  myReveal: boolean;
  /** Whether THEY are. Their choice alone — you can never flip this. */
  otherReveal: boolean;
  myIdentity: 'real' | 'anonymous';
  myNickname: string;
  score: number | null;
  lastMessageAt: string;
  lastText: string | null;
  lastFromMe: boolean;
  unread: number;
}

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
      // Shared fields flowed to the Master Profile — refresh it + completion.
      void qc.invalidateQueries({ queryKey: ['profile'] });
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
export function useDiscover(kind: MatchKind, enabled = true) {
  return useQuery({ queryKey: ['dating', 'discover', kind], queryFn: () => datingApi.discover(kind), enabled });
}
export function useMatchDetail(targetUserId: string | null, kind: MatchKind) {
  return useQuery({
    queryKey: ['dating', 'match', kind, targetUserId],
    queryFn: () => datingApi.matchDetail(targetUserId as string, kind),
    enabled: Boolean(targetUserId),
  });
}
export function useLikeMatch(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) => datingApi.like(targetUserId, kind),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dating', 'matches', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'discover', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'stack', kind] });
    },
  });
}
export function useUnlockChat(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { targetUserId: string; method: 'wallet' | 'card' }) => datingApi.unlockChat(v.targetUserId, kind, v.method),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dating', 'matches', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'discover', kind] });
      void qc.invalidateQueries({ queryKey: ['financial'] });
    },
  });
}
export function usePassMatch(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) => datingApi.pass(targetUserId, kind),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dating', 'matches', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'discover', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'stack', kind] });
    },
  });
}
export function useConnectChat(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { targetUserId: string; method: 'wallet' | 'card' }) => datingApi.connect(v.targetUserId, kind, v.method),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dating', 'chats'] });
      void qc.invalidateQueries({ queryKey: ['dating', 'discover', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'stack', kind] });
      void qc.invalidateQueries({ queryKey: ['financial'] });
    },
  });
}
export function useUnmatch(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) => datingApi.unmatch(targetUserId, kind),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dating', 'chats'] });
      void qc.invalidateQueries({ queryKey: ['dating', 'discover', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'match', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'stack', kind] });
    },
  });
}
/** Choose the name you chat under. `show: false` goes back to the pseudonym. */
export function useRevealMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: string | { targetUserId: string; show: boolean }) =>
      typeof v === 'string'
        ? datingApi.reveal(v, 'romantic')
        : datingApi.reveal(v.targetUserId, 'romantic', v.show),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['dating', 'chats'] }),
  });
}
export function useDatingChats() {
  return useQuery({ queryKey: ['dating', 'chats'], queryFn: () => datingApi.chats(), refetchInterval: 15_000 });
}
export function useDatingStack(kind: MatchKind, enabled = true) {
  return useQuery({ queryKey: ['dating', 'stack', kind], queryFn: () => datingApi.stack(kind), enabled, refetchInterval: 30_000 });
}
export function useDatingAdminStats() {
  return useQuery({ queryKey: ['dating', 'admin', 'stats'], queryFn: () => datingApi.adminStats(), retry: false });
}
