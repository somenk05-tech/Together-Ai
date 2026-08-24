import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** A wellness summary of what has actually been recorded. Never a fabricated
 *  number: `incomplete` and `unavailable` are real states, not errors. */
export function useHealthScore() {
  return useQuery({ queryKey: ['profile', 'health-score'], queryFn: () => profileApi.healthScore(), staleTime: 60_000 });
}

/** The address book — home, work, other; the legacy line answers as home. */
export function useSavedAddresses() {
  return useQuery({ queryKey: ['profile', 'addresses'], queryFn: () => profileApi.addresses() });
}
export function useForgetAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => profileApi.forgetAddress(label),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['profile', 'addresses'] }); },
  });
}
