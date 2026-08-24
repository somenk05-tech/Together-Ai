import { http as api } from '@/api/client';
import type { ProfileSummary } from './types';

export interface MasterProfileView {
  name: string; email: string; photo: string | null;
  /** Pre-split single field. Read-only fallback; the app writes the two below. */
  gender?: string | null;
  /** Clinical only — never shown to another citizen. See the card's copy. */
  sexAtBirth?: 'male' | 'female' | 'intersex' | 'preferNotToSay' | null;
  /** Social only — never enters a health calculation. */
  genderIdentity?: 'male' | 'female' | 'nonBinary' | 'other' | null;
  genderIdentityOther?: string | null;
  dateOfBirth?: string | null; timeOfBirth?: string | null;
  birthCountry?: string | null; birthState?: string | null; birthCity?: string | null;
  country?: string | null; state?: string | null; city?: string | null;
  timeZone?: string | null; languages?: string | null; heightCm?: number | null;
  weightKg?: number | null; occupation?: string | null; phone?: string | null;
  /** Where deliveries go. Written from the order checkout only when the
   *  citizen ticks "save this as my address" — see the schema's own note. */
  address?: string | null;
  /** single | inRelationship | … | preferNotToSay. `preferNotToSay` is an
   *  ANSWER; absent means nobody asked. Nothing computes with it. */
  relationshipStatus?: string | null;
  /** One of the eight ABO/Rh groups, or 'unknown' — the citizen answered and
   *  does not know. `null`/absent means nobody has answered, which is a
   *  different fact and is shown differently. */
  bloodGroup?: string | null;
  /** Declared conditions as csv keys, or the literal 'none' — asked, and
   *  nothing ticked. `null`/absent means nobody has asked, which is a different
   *  fact. Read here; written only through updateHealthConditions below. */
  healthConditions?: string | null;
  /** first | second | third | unstated. Only ever set beside a declared
   *  pregnancy, and cleared with it. */
  pregnancyTrimester?: string | null;
  /** early | late | dialysis | unstated. Only ever set beside a declared kidney
   *  condition, and cleared with it. */
  kidneyStage?: string | null;
  /** Both answers already resolved by the server, so no page re-derives them.
   *  `resolvedSex` is null for intersex, preferNotToSay and unanswered alike —
   *  none is a coefficient, and a screen should say so rather than assume. */
  resolvedSex?: 'male' | 'female' | null;
  resolvedGender?: string | null;
  age?: number | null; updatedAt?: string | null;
}

export interface CompletionSection {
  key: string; label: string; href: string;
  done: number; total: number; percent: number; complete: boolean;
}
export interface ProfileCompletion {
  /** "Dear Priya," — from the server's one salutation formatter, never rebuilt
   *  here. A second name.split(' ')[0] on this side is how somebody ends up
   *  greeted "Dear ," above their own data. */
  greeting: string;
  percent: number;
  complete: boolean;
  sections: CompletionSection[];
  nextUp: { key: string; label: string; href: string }[];
}

export interface HealthScoreComponent {
  key: 'body' | 'activity' | 'markers' | 'sleep';
  label: string; weight: number;
  state: 'computed' | 'missing';
  value: number | null; detail: string; missing: string[];
}
export interface HealthScoreView {
  state: 'computed' | 'incomplete' | 'unavailable';
  score: number | null;
  band: string | null;
  /** Plain-English statement of what the number counts. Always shown with it. */
  basis: string;
  components: HealthScoreComponent[];
  missingFields: string[];
  disclaimer: string;
  /**
   * Whether to offer the Optimal Health plan (FE-8.1). Decided server-side so
   * the threshold lives in config, not in a component — it is the number that
   * decides whether somebody is shown clinical guidance at all.
   */
  optimalHealth?: {
    show: boolean; threshold: number; score: number | null;
    confirmation: string;
    because: 'below-threshold' | 'at-or-above-threshold' | 'score-unknown';
  };
}

/**
 * The three health columns as one answer.
 *
 * They are not independent — a trimester with no pregnancy beside it is not a
 * fact about anybody — so they travel together and the server clears any
 * qualifier whose condition is not ticked. A draft type rather than three
 * fields on MasterProfileView, because a screen that can PATCH them separately
 * is a screen that can store half an answer.
 */
export interface DeclaredHealthDraft {
  keys: string[];
  trimester: string | null;
  kidneyStage: string | null;
}

export const profileApi = {
  master: () => api.get<MasterProfileView>('/profile/master').then((r) => r.data),
  completion: () => api.get<ProfileCompletion>('/profile/completion').then((r) => r.data),
  updateMaster: (patch: Partial<MasterProfileView>) =>
    api.patch<MasterProfileView>('/profile/master', patch).then((r) => r.data),
  /** One request, three columns. See DeclaredHealthDraft. */
  updateHealthConditions: (h: DeclaredHealthDraft) =>
    api.patch<MasterProfileView>('/profile/master', {
      healthConditions: h.keys,
      pregnancyTrimester: h.trimester,
      kidneyStage: h.kidneyStage,
    }).then((r) => r.data),
  summary: () => api.get<ProfileSummary>('/profile/summary').then((r) => r.data),
  healthScore: () => api.get<HealthScoreView>('/profile/health-score').then((r) => r.data),
  updateSection: (key: string, value: string) =>
    api.patch<ProfileSummary>('/profile/section', { key, value }).then((r) => r.data),
  setAvatar: (image: string) =>
    api.post<{ profileImage: string }>('/users/avatar', { image }).then((r) => r.data),
};
