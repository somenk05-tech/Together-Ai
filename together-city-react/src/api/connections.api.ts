import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './http';
import { ConnectionSchema, ConnectionStatusSchema, type Connection, type ConnectionStatus } from './schemas';

export const connectionsApi = {
  list: (status?: ConnectionStatus): Promise<Connection[]> =>
    apiGet('/connections', z.array(ConnectionSchema), { params: status ? { status } : undefined }),
  request: (handle: string): Promise<Connection> =>
    apiPost('/connections/request', { handle }, ConnectionSchema),
  respond: (connectionId: string, accept: boolean): Promise<Connection> =>
    apiPost('/connections/respond', { connectionId, status: accept ? 'accepted' : 'blocked' }, ConnectionSchema),
};

export function useConnections(status?: ConnectionStatus) {
  return useQuery({
    queryKey: ['connections', status ?? 'all'],
    queryFn: () => connectionsApi.list(status),
  });
}
export function useRequestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => connectionsApi.request(handle),
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
