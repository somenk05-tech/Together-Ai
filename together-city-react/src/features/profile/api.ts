import { http as api } from '@/api/client';
import type { ProfileSummary } from './types';

export const profileApi = {
  summary: () => api.get<ProfileSummary>('/profile/summary').then((r) => r.data),
  updateSection: (key: string, value: string) =>
    api.patch<ProfileSummary>('/profile/section', { key, value }).then((r) => r.data),
  setAvatar: (image: string) =>
    api.post<{ profileImage: string }>('/users/avatar', { image }).then((r) => r.data),
};
