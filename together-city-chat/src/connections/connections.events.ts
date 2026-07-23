/** WebSocket contract for live connection/permission sync. */
export const CONNECTIONS_WS = {
  /** A connection's hub permissions (or status) changed. Payload:
   *  { connectionId, status, relationship, modules, hubPermissions }. */
  CHANGED: 'connections:changed',
} as const;

/** Per-user room (matches ChatGateway's `user:<id>` handshake room). */
export const userRoom = (userId: string): string => `user:${userId}`;
