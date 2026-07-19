/** Canonical Socket.IO event names (client ⇆ server). */
export const WS = {
  // lifecycle
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  // rooms
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',
  // messaging
  SEND_MESSAGE: 'send_message',
  RECEIVE_MESSAGE: 'receive_message',
  MESSAGE_DELIVERED: 'message_delivered',
  MESSAGE_READ: 'message_read',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_EDITED: 'message_edited',
  // typing
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  // presence
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  HEARTBEAT: 'heartbeat',
  // per-user push: a new message arrived in ANY of your conversations (even ones
  // you're not currently viewing) — drives the instant unread badge.
  CHAT_NOTIFICATION: 'chat_notification',
  // errors
  ERROR: 'error_event',
} as const;

export const room = {
  conversation: (id: string) => `conversation:${id}`,
  user: (id: string) => `user:${id}`,
};
