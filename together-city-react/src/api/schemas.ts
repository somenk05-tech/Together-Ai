import { z } from 'zod';

/** Shared entity schemas — the single source of truth for API data shapes. */
export const UserSchema = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  profileImage: z.string().nullable().optional(),
  lastSeen: z.string().nullable().optional(), // null for brand-new users (never seen yet)
  onlineStatus: z.boolean().optional(),
  createdAt: z.string().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const AuthResultSchema = TokenPairSchema.extend({ userId: z.string() });
export type AuthResult = z.infer<typeof AuthResultSchema>;

export const ConnectionStatusSchema = z.enum(['pending', 'accepted', 'blocked']);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const ConnectionSchema = z.object({
  id: z.string(),
  status: ConnectionStatusSchema,
  incoming: z.boolean(), // true ⇒ the other person requested; you can accept
  relationship: z.string().nullable().optional(),
  modules: z.array(z.string()).optional(),
  hubPermissions: z.record(z.boolean()).optional(), // same data as `modules`, as a hub→on/off map
  user: UserSchema.pick({ id: true, handle: true, name: true, profileImage: true }),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  isGroup: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  participantIds: z.array(z.string()),
  lastMessageAt: z.string(),
  unread: z.number(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MediaAttachmentSchema = z.object({
  id: z.string(),
  url: z.string(),
  kind: z.enum(['image', 'video', 'file']),
  thumbUrl: z.string().optional(),
});
export type MediaAttachment = z.infer<typeof MediaAttachmentSchema>;

/** A shared hub item (flight, product, property, event, …) carried in a chat message. */
export const ShareCardSchema = z.object({
  kind: z.string(),
  hub: z.string().nullable().optional(),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  priceInr: z.number().nullable().optional(),
  meta: z.array(z.string()).optional(),
  deepLink: z.string().nullable().optional(),
});
export type ShareCard = z.infer<typeof ShareCardSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  body: z.string(),
  share: ShareCardSchema.nullable().optional(),
  status: z.enum(['SENT', 'DELIVERED', 'READ']).optional(),
  createdAt: z.string(),
  edited: z.boolean().optional(),
  deleted: z.boolean().optional(),
  editedAt: z.string().nullable().optional(),
  media: z.array(MediaAttachmentSchema).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

/** Cursor page returned by GET /chat/:id/messages */
export const MessagePageSchema = z.object({
  items: z.array(MessageSchema),
  nextCursor: z.string().nullable().optional(),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string().optional(),
  read: z.boolean(),
  createdAt: z.string(),
  href: z.string().optional(),
});
export type NotificationItem = z.infer<typeof NotificationSchema>;
