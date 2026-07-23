import { z } from 'zod';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import { socketClient } from './socket';
import { WS } from './events';
import { ConnectionSchema, ConnectionStatusSchema, type Connection, type ConnectionStatus } from './schemas';

/** Master hubs registry served by GET /connections/hubs. */
export const HubSchema = z.object({
  id: z.string(), slug: z.string(), name: z.string(), icon: z.string(),
  enabled: z.boolean(), universal: z.boolean(), familyOnly: z.boolean(),
});
export type HubDef = z.infer<typeof HubSchema>;

export const connectionsApi = {
  list: (status?: ConnectionStatus): Promise<Connection[]> =>
    apiGet('/connections', z.array(ConnectionSchema), { params: status ? { status } : undefined }),
  request: (handle: string, opts?: { modules?: string[]; relationship?: string }): Promise<Connection> =>
    apiPost('/connections/request', { handle, ...(opts ?? {}) }, ConnectionSchema),
  updateModules: (connectionId: string, modules: string[], relationship?: string): Promise<Connection> =>
    apiPatch(`/connections/${connectionId}/modules`, { modules, ...(relationship ? { relationship } : {}) }, ConnectionSchema),
  /** Single-source-of-truth write: a hub→boolean permission map. */
  setPermissions: (connectionId: string, hubPermissions: Record<string, boolean>, relationship?: string): Promise<Connection> =>
    apiPatch(`/connections/${connectionId}/permissions`, { hubPermissions, ...(relationship ? { relationship } : {}) }, ConnectionSchema),
  hubs: (): Promise<HubDef[]> =>
    apiGet('/connections/hubs', z.array(HubSchema)),
  hubMembers: (hub: string): Promise<Connection[]> =>
    apiGet(`/hub/${hub}/members`, z.array(ConnectionSchema)),
  setHubMember: (hub: string, connectionId: string, enabled: boolean): Promise<Connection> =>
    apiPatch(`/hub/${hub}/members`, { connectionId, enabled }, ConnectionSchema),
  remove: (connectionId: string): Promise<{ removed: boolean }> =>
    apiDelete(`/connections/${connectionId}`, z.object({ removed: z.boolean() })),
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
    mutationFn: (v: { id: string; modules: string[]; relationship?: string }) =>
      connectionsApi.updateModules(v.id, v.modules, v.relationship),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}
export function useRemoveConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => connectionsApi.remove(id),
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

/** Single-source write from the People checkbox grid — a hub→boolean map. */
export function useSetPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; hubPermissions: Record<string, boolean>; relationship?: string }) =>
      connectionsApi.setPermissions(v.id, v.hubPermissions, v.relationship),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['connections'] });
      void qc.invalidateQueries({ queryKey: ['hub-members'] });
    },
  });
}

/** Master hubs registry (drives the toggle UI; new hubs need no frontend change). */
export function useHubs() {
  return useQuery({ queryKey: ['connections', 'hubs'], queryFn: () => connectionsApi.hubs(), staleTime: 5 * 60_000 });
}

/** Everyone connected to a specific hub — every hub's Members list reads this. */
export function useHubMembers(hub: string) {
  return useQuery({ queryKey: ['hub-members', hub], queryFn: () => connectionsApi.hubMembers(hub) });
}

/** Add/remove one member for a hub (writes the shared permission store). */
export function useSetHubMember(hub: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { connectionId: string; enabled: boolean }) => connectionsApi.setHubMember(hub, v.connectionId, v.enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hub-members'] });
      void qc.invalidateQueries({ queryKey: ['connections'] });
    },
  });
}

/**
 * Live permission sync: when the backend broadcasts `connections:changed` to
 * either member, invalidate the People list AND every hub member list so no page
 * needs a manual refresh. Mounted once at the app shell.
 */
export function useConnectionSync(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const off = socketClient.on(WS.CONNECTIONS_CHANGED, () => {
      void qc.invalidateQueries({ queryKey: ['connections'] });
      void qc.invalidateQueries({ queryKey: ['hub-members'] });
    });
    return off;
  }, [qc]);
}
export { ConnectionStatusSchema };
