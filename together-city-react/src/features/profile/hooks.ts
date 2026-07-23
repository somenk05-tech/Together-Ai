import { useQuery } from '@tanstack/react-query';
import { profileApi } from './api';

export function useProfileSummary() {
  return useQuery({ queryKey: ['profile', 'summary'], queryFn: () => profileApi.summary() });
}

/** The Master Profile — the single source of truth for shared user info. Hubs
 *  read this to lock master-owned fields (name, age): once set here they can
 *  only be changed in the Master Profile, never re-entered in a sub-page. */
export function useMasterProfile() {
  return useQuery({ queryKey: ['profile', 'master'], queryFn: () => profileApi.master(), staleTime: 30_000 });
}
