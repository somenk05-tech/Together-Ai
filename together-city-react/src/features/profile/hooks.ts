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

/** One platform-wide profile-completion score across all hubs. Recomputed on
 *  the server each read, so it reflects the latest saves. */
export function useProfileCompletion() {
  return useQuery({ queryKey: ['profile', 'completion'], queryFn: () => profileApi.completion(), staleTime: 15_000 });
}
