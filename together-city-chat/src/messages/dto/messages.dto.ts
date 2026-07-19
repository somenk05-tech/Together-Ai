import { z } from 'zod';

export const MessageTypeEnum = z.enum([
  'TEXT',
  'IMAGE',
  'VIDEO',
  'VOICE',
  'FILE',
  'LOCATION',
  'CONTACT',
  'STICKER',
  'GIF',
]);

export const AttachmentSchema = z.object({
  url: z.string().url(),
  thumbnail: z.string().url().optional(),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  duration: z.number().int().nonnegative().optional(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
});

/** A shared hub item (flight, product, property, event, …) carried in a message. */
export const ShareCardSchema = z.object({
  kind: z.enum(['flight', 'trip', 'product', 'property', 'event', 'restaurant', 'dish', 'ticket', 'job']),
  hub: z.string().max(40).optional(),
  title: z.string().max(160),
  subtitle: z.string().max(200).optional(),
  image: z.string().max(200000).optional(),
  priceInr: z.number().optional(),
  meta: z.array(z.string().max(60)).max(6).optional(),
  deepLink: z.string().max(200).optional(),
});

export const SendMessageSchema = z
  .object({
    conversationId: z.string().uuid(),
    text: z.string().max(8192).optional(),
    body: z.string().max(8192).optional(), // client alias for `text` (frontend sends `body`)
    messageType: MessageTypeEnum.default('TEXT'),
    replyToMessageId: z.string().uuid().optional(),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    share: ShareCardSchema.optional(), // a shared hub item, rendered as a rich card
    // client-generated id for optimistic UI / idempotency
    clientId: z.string().max(64).optional(),
  })
  .refine(
    (v) =>
      (v.text && v.text.trim().length > 0) ||
      (v.body && v.body.trim().length > 0) ||
      (v.attachments && v.attachments.length > 0) ||
      !!v.share,
    { message: 'A message must have text, an attachment, or a shared item' },
  );
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export const EditMessageSchema = z.object({ text: z.string().min(1).max(8192) });
export type EditMessageDto = z.infer<typeof EditMessageSchema>;

export const DeleteMessageSchema = z.object({ scope: z.enum(['ME', 'EVERYONE']).default('ME') });
export type DeleteMessageDto = z.infer<typeof DeleteMessageSchema>;

export const AckSchema = z.object({ messageIds: z.array(z.string().uuid()).min(1).max(500) });
export type AckDto = z.infer<typeof AckSchema>;

export const ListMessagesSchema = z.object({
  conversationId: z.string().uuid(),
  cursor: z.string().uuid().optional(), // last-seen message id (cursor pagination)
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListMessagesDto = z.infer<typeof ListMessagesSchema>;

export const SearchMessagesSchema = z.object({
  conversationId: z.string().uuid().optional(),
  keyword: z.string().min(1).optional(),
  senderId: z.string().uuid().optional(),
  attachmentType: MessageTypeEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type SearchMessagesDto = z.infer<typeof SearchMessagesSchema>;
