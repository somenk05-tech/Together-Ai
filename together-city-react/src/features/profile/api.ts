import { http as api } from '@/api/client';
import type { ProfileSummary } from './types';

export interface MasterProfileView {
  name: string; email: string; photo: string | null;
  gender?: string | null; dateOfBirth?: string | null; timeOfBirth?: string | null;
  birthCountry?: string | null; birthState?: string | null; birthCity?: string | null;
  country?: string | null; state?: string | null; city?: string | null;
  timeZone?: string | null; languages?: string | null; heightCm?: number | null;
  weightKg?: number | null; occupation?: string | null; phone?: string | null;
  age?: number | null; updatedAt?: string | null;
}

export interface CompletionSection {
  key: string; label: string; href: string;
  done: number; total: number; percent: number; complete: boolean;
}
export interface ProfileCompletion {
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
}

export const profileApi = {
  master: () => api.get<MasterProfileView>('/profile/master').then((r) => r.data),
  completion: () => api.get<ProfileCompletion>('/profile/completion').then((r) => r.data),
  updateMaster: (patch: Partial<MasterProfileView>) =>
    api.patch<MasterProfileView>('/profile/master', patch).then((r) => r.data),
  summary: () => api.get<ProfileSummary>('/profile/summary').then((r) => r.data),
  healthScore: () => api.get<HealthScoreView>('/profile/health-score').then((r) => r.data),
  updateSection: (key: string, value: string) =>
    api.patch<ProfileSummary>('/profile/section', { key, value }).then((r) => r.data),
  setAvatar: (image: string) =>
    api.post<{ profileImage: string }>('/users/avatar', { image }).then((r) => r.data),
};
