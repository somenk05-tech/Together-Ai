import { useQuery } from '@tanstack/react-query';
import { profileApi } from './api';

export function useProfileSummary() {
  return useQuery({ queryKey: ['profile', 'summary'], queryFn: () => profileApi.summary() });
}
