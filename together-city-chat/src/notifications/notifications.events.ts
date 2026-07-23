/** WebSocket contract for live in-app notifications. */
export const NOTIF_WS = {
  /** A new notification arrived. Payload: the shaped notification row. */
  NEW: 'notification:new',
  /** Unread count changed. Payload: { count }. */
  COUNT: 'notification:count',
} as const;

/** Per-user room (matches ChatGateway's `user:<id>` handshake room). */
export const userRoom = (userId: string): string => `user:${userId}`;
