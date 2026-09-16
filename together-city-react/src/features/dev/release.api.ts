import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

/**
 * THE GO LIVE BUTTON'S WIRE (owner, 16 Sep).
 *
 * Same rule as api.ts next door: the dev password is held in the page's state
 * and sent as a header, never stored and never compared here.
 */
const withPassword = (password: string) => ({ headers: { 'x-dev-password': password } });

export interface ReleaseHubRow { key: string; label: string; live: boolean }
export interface ReleaseState {
  /** Which city this deployment is. The button only works on 'dev'. */
  channel: 'live' | 'dev';
  hubs: ReleaseHubRow[];
  tokenSet: boolean;
  canGoLive: boolean;
  runsUrl: string;
}
export interface ReleaseRun {
  id: number; title: string; status: string; conclusion: string | null; createdAt: string; url: string;
}

/** What the developer copy has that the live site does not. `waiting: null`: GitHub could not be asked. */
export interface PendingChanges {
  waiting: number | null;
  changes: Array<{ sha: string; title: string; at: string | null; url: string }>;
}

export const releaseApi = {
  /** No password: the owner's own session on the developer copy is the lock (DevAccountGuard). */
  pending: () => api.get<PendingChanges>('/release/pending').then((r) => r.data),
  state: (password: string) =>
    api.get<ReleaseState>('/dev/release', withPassword(password)).then((r) => r.data),
  runs: (password: string) =>
    api.get<{ runs: ReleaseRun[] | null }>('/dev/release/runs', withPassword(password)).then((r) => r.data),
  goLive: (password: string, hubs: string[], reason: string) =>
    api.post<{ dispatched: boolean; hubs: string[]; runsUrl: string }>(
      '/dev/release/go-live', { hubs, reason }, withPassword(password),
    ).then((r) => r.data),
};

/** Asked on every developer page, only when this is the developer copy and somebody is signed in. */
export function usePendingChanges(enabled: boolean) {
  return useQuery({
    queryKey: ['release', 'pending'],
    queryFn: releaseApi.pending,
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useReleaseState(password: string | null) {
  return useQuery({
    queryKey: ['dev', 'release'],
    queryFn: () => releaseApi.state(password as string),
    enabled: Boolean(password),
    retry: false,
  });
}

/** Polls while a release is running, and rests when none is. */
export function useReleaseRuns(password: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['dev', 'release', 'runs'],
    queryFn: () => releaseApi.runs(password as string),
    enabled: Boolean(password) && enabled,
    retry: false,
    refetchInterval: (q) => {
      const runs = q.state.data?.runs ?? [];
      return runs.some((r) => r.status !== 'completed') ? 15_000 : false;
    },
  });
}

export function useGoLive(password: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { hubs: string[]; reason: string }) =>
      releaseApi.goLive(password as string, v.hubs, v.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['release', 'pending'] });
      // GitHub takes a moment to list a dispatched run; ask again shortly.
      window.setTimeout(() => { void qc.invalidateQueries({ queryKey: ['dev', 'release', 'runs'] }); }, 4_000);
    },
  });
}
