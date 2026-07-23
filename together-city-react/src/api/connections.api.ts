import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './http';
import { ConnectionSchema, ConnectionStatusSchema, type Connection, type ConnectionStatus } from './schemas';

export const connectionsApi = {
  list: (status?: ConnectionStatus): Promise<Connection[]> =>
    apiGet('/connections', z.array(ConnectionSchema), { params: status ? { status } : undefined }),
  request: (handle: string, opts?: { modules?: string[]; relationship?: string }): Promise<Connection> =>
    apiPost('/connections/request', { handle, ...(opts ?? {}) }, ConnectionSchema),
  updateModules: (connectionId: string, modules: string[]): Promise<Connection> =>
    apiPatch(`/connections/${connectionId}/modules`, { modules }, ConnectionSchema),
  respond: (connectionId: string, accept: boolean): Promise<Connection> =>
    apiPost('/connections/respond', { connectionId, status: accept ? 'accepted' : 'blocked' }, ConnectionSchema),
};

export function useConnections(status?: ConnectionStatus) {
  return useQuery({
    queryKey: ['connections', status ?? 'all'],
    queryFn: () => connectionsApi.list(status),
    // Poll so incoming requests / acceptances surface without a manual reload.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}

/** Count of incoming connection requests awaiting your response (for the nav badge). */
export function useIncomingRequestCount(): number {
  const { data } = useConnections();
  return (data ?? []).filter((c) => c.status === 'pending' && c.incoming).length;
}
export function useRequestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: string | { handle: string; modules?: string[]; relationship?: string }) =>
      typeof v === 'string' ? connectionsApi.request(v) : connectionsApi.request(v.handle, v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}
export function useUpdateModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; modules: string[] }) => connectionsApi.updateModules(v.id, v.modules),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}
export function useRespondConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => connectionsApi.respond(v.id, v.accept),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}
export { ConnectionStatusSchema };
