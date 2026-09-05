import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileApi, type EditQuota } from './api';

/**
 * FIVE FREE CHANGES A MONTH, THEN ₹50 (5 Sep). Read before a save so the
 * price is on the button; refetched after one so the count moves. Any hub
 * profile form reads this — it is one counter across the whole record.
 */
export function useEditQuota() {
  return useQuery({ queryKey: ['profile', 'edit-quota'], queryFn: () => profileApi.editQuota(), staleTime: 15_000 });
}

/** The words beside a Save button, from the quota. Null while nothing needs saying. */
export function editQuotaLine(q: EditQuota | undefined): string | null {
  if (!q || q.inSitting) return null;
  if (q.priceInr > 0) {
    const back = new Date(q.resetsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return `You've used your ${q.freePerMonth} free profile changes this month — this change is ₹${q.priceInr} from your wallet, or they come back on ${back}.`;
  }
  return `${q.freeLeft} of ${q.freePerMonth} free profile changes left this month.`;
}

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

/**
 * Every profile the city keeps, read in one request.
 *
 * Longer stale time than the record itself: this is fourteen tables, it is
 * rendered collapsed, and a citizen opening a panel is not asking for a
 * refetch of the whole city. Any save that matters invalidates it through the
 * completion key it shares a source with.
 */
export function useCityProfiles() {
  return useQuery({ queryKey: ['profile', 'city'], queryFn: () => profileApi.cityProfiles(), staleTime: 60_000 });
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
