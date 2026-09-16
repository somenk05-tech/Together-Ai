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

export const releaseApi = {
  state: (password: string) =>
    api.get<ReleaseState>('/dev/release', withPassword(password)).then((r) => r.data),
  runs: (password: string) =>
    api.get<{ runs: ReleaseRun[] | null }>('/dev/release/runs', withPassword(password)).then((r) => r.data),
  goLive: (password: string, hubs: string[], reason: string) =>
    api.post<{ dispatched: boolean; hubs: string[]; runsUrl: string }>(
      '/dev/release/go-live', { hubs, reason }, withPassword(password),
    ).then((r) => r.data),
};

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
      // GitHub takes a moment to list a dispatched run; ask again shortly.
      window.setTimeout(() => { void qc.invalidateQueries({ queryKey: ['dev', 'release', 'runs'] }); }, 4_000);
    },
  });
}
