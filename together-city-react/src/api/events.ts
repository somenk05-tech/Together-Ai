/** Canonical Socket.IO event names — mirrors the NestJS gateway (chat.events.ts). */
export const WS = {
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',
  SEND_MESSAGE: 'send_message',
  RECEIVE_MESSAGE: 'receive_message',
  MESSAGE_DELIVERED: 'message_delivered',
  MESSAGE_READ: 'message_read',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_REACTED: 'message_reacted',
  MESSAGE_PINNED: 'message_pinned',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  HEARTBEAT: 'heartbeat',
  CHAT_NOTIFICATION: 'chat_notification',
  ERROR: 'error_event',
  // Calls. RINGING/UPDATED are broadcasts about a call; SIGNAL carries one
  // piece of the WebRTC handshake and is the only event the client also emits.
  CALL_RINGING: 'call_ringing',
  CALL_UPDATED: 'call_updated',
  CALL_SIGNAL: 'call_signal',
  CONNECTIONS_CHANGED: 'connections:changed',
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_COUNT: 'notification:count',
} as const;

export type WsEvent = (typeof WS)[keyof typeof WS];
