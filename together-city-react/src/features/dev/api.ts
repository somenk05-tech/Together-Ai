import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

/**
 * THE PASSWORD NEVER LIVES IN THIS BUNDLE.
 *
 * It is held in React state for as long as the tab is open, sent as a header,
 * and checked on the server. A comparison here would put the password in a file
 * anybody can download from the site — which is not protection, it is a
 * costume. Nothing writes it to localStorage either: a shared password
 * surviving in a shared browser is how it ends up somewhere it should not be.
 */
const withPassword = (password: string) => ({ headers: { 'x-dev-password': password } });

export interface EnvRow {
  name: string; group: string; purpose: string; whenMissing: string;
  required: boolean; secret: boolean; set: boolean;
}
export interface Diagnostics {
  build: { commit: string | null; branch: string | null; nodeEnv: string; nodeVersion: string; upSeconds: number };
  database: { reachable: boolean; ms: number; recentMigrations: Array<{ name: string; at: string | null }> | null };
  counts: { citizens?: number; suspended?: number; listings?: number; pendingListings?: number };
  env: EnvRow[];
  usingDefaultPassword: boolean;
}
export interface FlagRow {
  key: string; label: string; turnsOff: string; hubPath: string;
  enabled: boolean; note: string; updatedAt: string | null; updatedBy: string;
}

export const devApi = {
  diagnostics: (password: string) =>
    api.get<Diagnostics>('/dev/diagnostics', withPassword(password)).then((r) => r.data),
  flags: (password: string) =>
    api.get<{ items: FlagRow[] }>('/dev/flags', withPassword(password)).then((r) => r.data),
  setFlag: (password: string, key: string, enabled: boolean, reason: string) =>
    api.post<{ key: string; enabled: boolean }>('/dev/flags', { key, enabled, reason }, withPassword(password))
      .then((r) => r.data),
};

export function useDiagnostics(password: string | null) {
  return useQuery({
    queryKey: ['dev', 'diagnostics'],
    queryFn: () => devApi.diagnostics(password as string),
    enabled: Boolean(password),
    retry: false,
  });
}
export function useFlags(password: string | null) {
  return useQuery({
    queryKey: ['dev', 'flags'],
    queryFn: () => devApi.flags(password as string),
    enabled: Boolean(password),
    retry: false,
  });
}
export function useSetFlag(password: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; enabled: boolean; reason: string }) =>
      devApi.setFlag(password as string, v.key, v.enabled, v.reason),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dev'] }); },
  });
}
