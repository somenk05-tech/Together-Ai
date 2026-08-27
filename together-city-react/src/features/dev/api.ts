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
/** A VISIBILITY switch: hides a sector's doors across the whole site and
 *  refuses nothing. A different animal from FlagRow above, and typed apart so
 *  no render site can pass one where the other is meant. */
export interface VisibilityRow {
  key: string; label: string; hides: string;
  visible: boolean; note: string; updatedAt: string | null;
}
export interface FlagsPayload { items: FlagRow[]; visibility: VisibilityRow[] }

export const devApi = {
  diagnostics: (password: string) =>
    api.get<Diagnostics>('/dev/diagnostics', withPassword(password)).then((r) => r.data),
  flags: (password: string) =>
    api.get<FlagsPayload>('/dev/flags', withPassword(password)).then((r) => r.data),
  // `kind` is sent ALWAYS, never left to the server's default. A sector has
  // both kinds under one key, and the failure mode of getting it wrong is
  // closing a hub somebody only meant to hide.
  setFlag: (password: string, key: string, enabled: boolean, reason: string, kind: 'kill' | 'visibility') =>
    api.post<{ key: string; enabled: boolean }>('/dev/flags', { key, enabled, reason, kind }, withPassword(password))
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
    mutationFn: (v: { key: string; enabled: boolean; reason: string; kind: 'kill' | 'visibility' }) =>
      devApi.setFlag(password as string, v.key, v.enabled, v.reason, v.kind),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dev'] }); },
  });
}
