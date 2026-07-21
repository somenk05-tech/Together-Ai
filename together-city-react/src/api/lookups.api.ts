import { http as api } from '@/api/client';
import { useQuery } from '@tanstack/react-query';

export interface LookupOption { code: string; label: string; parentCode: string | null }

export const lookupsApi = {
  list: (category: string, params?: { parent?: string; q?: string; limit?: number }) =>
    api.get<LookupOption[]>(`/lookups/${category}`, { params }).then((r) => r.data),
};

/**
 * Load a standardized dropdown's options from the backend master tables.
 * Master data changes rarely, so it's cached hard and filtered client-side.
 * When `parent` is required but missing (e.g. cities before a state is picked),
 * the query is disabled and returns no options.
 */
export function useLookups(category: string, opts?: { parent?: string | null; enabled?: boolean }) {
  const parent = opts?.parent ?? undefined;
  const needsParent = category === 'state' || category === 'city';
  const enabled = (opts?.enabled ?? true) && (!needsParent || Boolean(parent));
  return useQuery({
    queryKey: ['lookups', category, parent ?? '_all'],
    queryFn: () => lookupsApi.list(category, parent ? { parent } : undefined),
    enabled,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 4,
  });
}
