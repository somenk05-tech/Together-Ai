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
  /** SERVER-DERIVED, both of them (27 Aug). A selfie is on file when the
   *  server holds its key — the page asks, rather than being told by the
   *  extras blob it just posted. Neither may be written through a save. */
  selfieOnFile?: boolean;
  selfieAt?: string | null;
  completion?: ProfileCompletion;
  extras: string | null;
  /**
   * Display URLs for the photos inside `extras`, aligned one-for-one, empty
   * where a key would not sign. NEVER post these back: `extras.photos` holds
   * the record (private storage keys) and these expire in minutes. (M3.)
   */
  photoUrls?: string[];
  /** Review status per stored photo key (26 Aug): a photo shows to other
   *  people only once it is `approved`. Absent for the account-photo fallback. */
  photoReview?: Record<string, 'pending' | 'approved' | 'held' | 'rejected'>;
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
  /** The card's WHOLE identity. The handle and the city profile photo used to
   *  ride along here — one lookup from a dating card to somebody's entire city
   *  life. The server no longer sends either. */
  user: { id: string; name: string };
  bio: string | null;
  interests: string[];
  photos?: string[];
  age?: number;
  yourSign: string;
  theirSign: string;
  score: number;
  breakdown?: FactorBreakdown;
  reasons?: string[];
  /** What does NOT fit, from the same numbers. A card that only ever agrees
   *  with itself reads as a sales pitch rather than an assessment. */
  frictions?: string[];
  likedByMe: boolean;
  matched: boolean;
  chatLocked?: boolean;
  conversationId: string | null;
  /**
   * WHAT THE NUMBER IS MADE OF. `coverage` is the share of the six answerable
   * factors BOTH people filled in; `confidence` is the multiplier the server
   * already folded into `score`. Optional on purpose: a card built before the
   * server sent these must still type-check, and a page that finds them
   * missing omits the line rather than drawing an empty one.
   */
  coverage?: number;
  confidence?: number;
  /**
   * The six the curated card reads, and they are OPTIONAL because the list
   * endpoints are not the only thing that has ever built one of these — a
   * card rendered from a payload written before these existed must still
   * type-check, and a page that finds them missing has to omit the line
   * rather than draw an empty one. Same fields, same meaning, as MatchDetail
   * below; the server sends them off the extras it had already parsed.
   */
  occupation?: string | null;
  city?: string | null;
  heightCm?: number | null;
  languages?: string[];
  relationshipGoal?: string | null;
  personalityTraits?: string[];
}

export interface MatchDetail {
  /** The card's WHOLE identity. The handle and the city profile photo used to
   *  ride along here — one lookup from a dating card to somebody's entire city
   *  life. The server no longer sends either. */
  user: { id: string; name: string };
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
  /** Since 26 Aug this is exactly `emailVerified` on their account, rendered
   *  as an envelope by components/SelfieOnFile#EmailConfirmed. */
  verified: boolean;
  /** A separate fact, never folded into `verified`: the server holds a selfie
   *  for them. Not identity — components/SelfieOnFile says exactly that. */
  selfieOnFile?: boolean;
  yourSign: string; theirSign: string;
  score: number;
  breakdown: FactorBreakdown;
  reasons: string[];
  frictions?: string[];
  /** Same fields, same meaning, same reason for being optional, as CuratedMatch. */
  coverage?: number;
  confidence?: number;
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
  /** The page (26 Aug): how many of `totalDiscoverable` came, and whether more would. */
  shown: number;
  hasMore: boolean;
  /**
   * WHO WAS THERE BEFORE YOUR SETTINGS SPOKE. (Fourth audit, 28 Aug.)
   *
   * The server has always sent these two — "reported, never silent", says the
   * comment above POOL_CEILING — and this interface never declared them, so
   * nothing in the app could read them and the only empty state said "no one to
   * show just yet". `poolSize` counts the people the SQL found: right age, right
   * seeking, visible, approved, not blocked. `totalDiscoverable` counts who
   * survived the filters applied afterwards in JS — height, distance, diet,
   * religion, children, intent, language, and the other person's filters
   * pointing back at you. A poolSize of twelve and nothing discoverable is not a
   * quiet city; it is a setting, and the citizen is the only one who can undo it.
   */
  poolSize: number;
  poolCapped: boolean;
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
  /** The bytes are already in the bucket; this hands over the key and the
   *  server writes the mark. See the API's selfie.ts. */
  saveSelfie: (key: string) => api.post<{ selfieOnFile: true; selfieAt: string }>('/dating/selfie', { key }).then((r) => r.data),
  clearSelfie: () => api.delete<{ selfieOnFile: false; selfieAt: null }>('/dating/selfie').then((r) => r.data),
  matches: (kind: MatchKind) => api.get<CuratedMatch[]>('/dating/matches', { params: { kind } }).then((r) => r.data),
  discover: (kind: MatchKind, limit?: number) => api.get<DiscoverResult>('/dating/discover', { params: { kind, limit } }).then((r) => r.data),
  matchDetail: (targetUserId: string, kind: MatchKind) => api.get<MatchDetail>(`/dating/matches/${targetUserId}`, { params: { kind } }).then((r) => r.data),
  like: (targetUserId: string, kind: MatchKind) =>
    api.post<{ matched: boolean; conversationId: string | null; chatLocked: boolean; matchId: string }>(`/dating/matches/${targetUserId}/like`, { kind }).then((r) => r.data),
  unlockChat: (targetUserId: string, kind: MatchKind) =>
    api.post<{ conversationId: string; alreadyOpen: boolean; chargedInr?: number }>(`/dating/matches/${targetUserId}/unlock-chat`, { kind }).then((r) => r.data),
  // Free since 26 Aug; `chargedInr` is always 0 and stays for the shape.
  connect: (targetUserId: string, kind: MatchKind) =>
    api.post<{ conversationId: string; alreadyOpen: boolean; chargedInr: number }>(`/dating/matches/${targetUserId}/connect`, { kind }).then((r) => r.data),
  unmatch: (targetUserId: string, kind: MatchKind) =>
    api.post<{ ok: boolean }>(`/dating/matches/${targetUserId}/unmatch`, { kind }).then((r) => r.data),
  reveal: (targetUserId: string, kind: MatchKind, show = true) =>
    api.post<{ revealed: boolean; myReveal: boolean }>(`/dating/matches/${targetUserId}/reveal`, { kind, show }).then((r) => r.data),
  superLike: (targetUserId: string, kind: MatchKind) =>
    api.post<{ matched: boolean; matchId: string; superLike: boolean }>(`/dating/matches/${targetUserId}/super-like`, { kind }).then((r) => r.data),
  undoPass: (kind: MatchKind) =>
    api.post<UndoPassResult>('/dating/undo-pass', { kind }).then((r) => r.data),
  allowance: () => api.get<LikeAllowance>('/dating/allowance').then((r) => r.data),
  pass: (targetUserId: string, kind: MatchKind) =>
    api.post<{ ok: boolean }>(`/dating/matches/${targetUserId}/pass`, { kind }).then((r) => r.data),
  chats: () => api.get<DatingChatSummary[]>('/dating/chats').then((r) => r.data),
  stack: (kind: MatchKind, limit?: number) => api.get<DatingStack>('/dating/stack', { params: { kind, limit } }).then((r) => r.data),
  blockMatch: (targetUserId: string, kind: MatchKind) =>
    api.post<{ blocked: true }>(`/dating/matches/${targetUserId}/block`, { kind }).then((r) => r.data),
  reportMatch: (targetUserId: string, kind: MatchKind, reason?: string) =>
    api.post<{ reported: true }>(`/dating/matches/${targetUserId}/report`, { kind, reason }).then((r) => r.data),
  adminStats: () => api.get<DatingAdminStats>('/dating/admin/stats').then((r) => r.data),
  adminFunnel: (days: number) => api.get<DatingFunnel>('/dating/admin/funnel', { params: { days } }).then((r) => r.data),
  appeal: (dto: { kind: 'dating_profile' | 'dating_photo'; targetId?: string; text: string }) =>
    api.post<{ id: string; status: 'open'; duplicate?: true }>('/dating/appeals', dto).then((r) => r.data),
  myAppeals: () => api.get<MyAppeal[]>('/dating/appeals/mine').then((r) => r.data),
};

export interface DatingAdminStats {
  totalProfiles: number;
  approvedVisible: number;
  pendingReview: number;
  rejected: number;
  pausedHidden: number;
  /** The two invisibilities, told apart (26 Aug). */
  paused?: number;
  hidden?: number;
  gender: { male: number; female: number; nonbinary: number };
  connectedMembers: number;
  activeChats: number;
  totalMatches: number;
  mutualLikes: number;
  generatedAt: string;
}

export interface DatingFunnel {
  days: number; since: string;
  steps: Array<{ name: string; users: number; events: number; ofPrevious: number | null }>;
  counts: Record<string, number>;
  distribution: Array<{ label: string; count: number }>;
  scoredPairs: number; photosHeld: number; appealsOpen: number;
  /** Waiting on Rekognition, not on a human — the state an unconfigured or
   *  broken photo review produces, and the number nothing used to compute. */
  photosPending: number;
  /** The open-report BACKLOG, not the event count over the window beside it. */
  reportsOpen: number;
}
export interface MyAppeal { id: string; kind: 'dating_profile' | 'dating_photo'; targetId: string; text: string; status: 'open' | 'upheld' | 'overturned'; decision: string; createdAt: string; decidedAt: string | null }

export interface CompatibilityBand { label: string; min: number; max: number; count: number }
export interface DatingStack {
  /** True when ANY chat is open. There is no cap on how many there may be
   *  (owner, 27 Aug) — `openChats`, `chatCap` and `atCapacity` went with it. */
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
  /** True when `candidates` is a page of the ranked list rather than all of it. */
  hasMore?: boolean;
  /** H2. `learned: false` means the standard weights and `headline` says why. */
  ranking?: { learned: boolean; headline: string; decisions: number; notes: string[] };
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
/** Put the selfie on file, or take it off. Both refetch the profile rather
 *  than guessing at the new state: the mark is the server's to report. */
export function useSaveSelfie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => datingApi.saveSelfie(key),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dating', 'profile'] }); },
  });
}

export function useClearSelfie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => datingApi.clearSelfie(),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dating', 'profile'] }); },
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
/** A page of the ranked pool. `limit` grows when the citizen asks for more;
 *  the previous page stays on screen while the next one loads. */
export function useDiscover(kind: MatchKind, enabled = true, limit?: number) {
  return useQuery({
    queryKey: ['dating', 'discover', kind, limit ?? 'all'],
    queryFn: () => datingApi.discover(kind, limit),
    enabled,
    placeholderData: (prev) => prev,
  });
}
export function useMatchDetail(targetUserId: string | null, kind: MatchKind) {
  return useQuery({
    queryKey: ['dating', 'match', kind, targetUserId],
    queryFn: () => datingApi.matchDetail(targetUserId as string, kind),
    enabled: Boolean(targetUserId),
  });
}
/** What is left of today, in the citizen's own timezone. (M2.) */
export interface LikeAllowance {
  likesUsed: number; likesLeft: number;
  supersUsed: number; supersLeft: number;
  dailyLikes: number; dailySuperLikes: number;
  resetsAtLocal: string;
}
export type UndoPassResult =
  | { undone: true; targetUserId: string; theyLiked: boolean }
  | { undone: false; reason: string };

export function useLikeAllowance(enabled = true) {
  return useQuery({ queryKey: ['dating', 'allowance'], queryFn: () => datingApi.allowance(), enabled });
}

export function useSuperLike(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) => datingApi.superLike(targetUserId, kind),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dating', 'matches', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'stack', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'allowance'] });
    },
  });
}

export function useUndoPass(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => datingApi.undoPass(kind),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dating', 'matches', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'discover', kind] });
      void qc.invalidateQueries({ queryKey: ['dating', 'stack', kind] });
    },
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
      void qc.invalidateQueries({ queryKey: ['dating', 'allowance'] });
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
    // Nothing else to do: undo is offered from the stack, which knows a pass
    // just happened without needing the server to say so.
  });
}
export function useConnectChat(kind: MatchKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { targetUserId: string }) => datingApi.connect(v.targetUserId, kind),
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
/** Fifteen seconds is the rate a chat list open in front of somebody needs. The
 *  dashboard, which only wants two counts and is where most citizens sit, asks
 *  for a slower one — it was polling at the chat-window rate for the whole city. */
export function useDatingChats(refetchInterval = 15_000) {
  return useQuery({ queryKey: ['dating', 'chats'], queryFn: () => datingApi.chats(), refetchInterval });
}
export function useDatingStack(kind: MatchKind, enabled = true, limit?: number) {
  return useQuery({ queryKey: ['dating', 'stack', kind, limit ?? 'all'], queryFn: () => datingApi.stack(kind, limit), enabled, refetchInterval: 30_000 });
}
export function useDatingAdminStats() {
  return useQuery({ queryKey: ['dating', 'admin', 'stats'], queryFn: () => datingApi.adminStats(), retry: false });
}

export function useDatingFunnel(days: number) {
  return useQuery({ queryKey: ['dating', 'admin', 'funnel', days], queryFn: () => datingApi.adminFunnel(days), retry: false });
}

export function useMyAppeals() {
  return useQuery({ queryKey: ['dating', 'appeals'], queryFn: () => datingApi.myAppeals(), retry: false });
}

export function useAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: datingApi.appeal,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dating', 'appeals'] }); },
  });
}

/**
 * Block, then forget everything we knew about them.
 *
 * The invalidation list is the point: a block that leaves the person sitting in
 * a cached match list until the next refetch is a block the citizen can watch
 * fail. Every dating surface is dropped, and the conversation list with it.
 */
export function useBlockMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, kind }: { userId: string; kind: MatchKind }) => datingApi.blockMatch(userId, kind),
    onSuccess: () => {
      for (const key of [['dating', 'stack'], ['dating', 'matches'], ['dating', 'discover'], ['dating', 'chats'], ['conversations']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/**
 * SHARE THE CITY IDENTITY, OR TAKE IT BACK.
 *
 * The route and the service have existed since the hub was built and nothing
 * ever called them, so the whole contract `connect()` documents — names hidden
 * until both choose otherwise — was neither implemented nor reachable. Worse,
 * while it was unreachable the message serializer was handing over the handle
 * and the account photo on every message anyway, so the disclosure happened
 * without anybody choosing it. The serializer now withholds them below trust 2
 * and this is how a citizen chooses.
 *
 * Both sides must say yes: one reveal is a willingness, two is a conversation
 * that is no longer anonymous. The chats list is invalidated because the
 * banner and this button are both read off it, and `conversations` because the
 * trust level is what nulls the other person's photo there.
 */
export function useDatingReveal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, kind, show }: { userId: string; kind: MatchKind; show: boolean }) =>
      datingApi.reveal(userId, kind, show),
    onSuccess: () => {
      for (const key of [['dating', 'chats'], ['conversations']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** Report. Nothing is invalidated — reporting deliberately changes nothing the
 *  reporter can see, so they are not signalling to anybody that they filed it. */
export function useReportMatch() {
  return useMutation({
    mutationFn: ({ userId, kind, reason }: { userId: string; kind: MatchKind; reason?: string }) =>
      datingApi.reportMatch(userId, kind, reason),
  });
}
