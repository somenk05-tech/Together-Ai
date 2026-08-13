/**
 * Together City frontend SDK — the single gateway to the backend.
 * The app imports only from `@/api`; it never calls fetch() or axios directly.
 */
export * from './schemas';
export * from './events';
export { socketClient, WS } from './socket';
export { isServerUnreachable, SERVER_UNREACHABLE_MSG } from './client';

export { authApi, LoginInput, RegisterInput } from './auth.api';
export { usersApi, useMe, useOnlineContacts, RelationshipSchema, LookupSchema, type Relationship, type LookupResult } from './users.api';
export { connectionsApi, useConnections, useRequestConnection, useRespondConnection, useIncomingRequestCount } from './connections.api';
export { chatApi, useConversations, useUnreadChatCount, useMessages, useChatRealtime, useStartDirect, useChatContacts, useCreateGroup, useClearConversation, type Contact, type OutgoingAttachment } from './chat.api';
export { notificationsApi, useNotifications, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead, useNotificationSync } from './notifications.api';
export { mediaApi, PresignInput, PresignResult } from './media.api';
