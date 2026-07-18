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
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error_event',
} as const;

export type WsEvent = (typeof WS)[keyof typeof WS];
