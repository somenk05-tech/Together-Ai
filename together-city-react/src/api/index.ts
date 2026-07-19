/**
 * Together City frontend SDK — the single gateway to the backend.
 * The app imports only from `@/api`; it never calls fetch() or axios directly.
 */
export * from './schemas';
export * from './events';
export { socketClient, WS } from './socket';

export { authApi, LoginInput, RegisterInput } from './auth.api';
export { usersApi, useMe, useOnlineContacts, RelationshipSchema, LookupSchema, type Relationship, type LookupResult } from './users.api';
export { connectionsApi, useConnections, useRequestConnection, useRespondConnection, useIncomingRequestCount } from './connections.api';
export { chatApi, useConversations, useMessages, useChatRealtime, useStartDirect, useChatContacts, useCreateGroup, type Contact } from './chat.api';
export { notificationsApi, useNotifications, useMarkNotificationRead } from './notifications.api';
export { mediaApi, PresignInput, PresignResult } from './media.api';
