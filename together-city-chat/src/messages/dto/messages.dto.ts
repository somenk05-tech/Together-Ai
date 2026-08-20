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
  /** What the file was called on the sender's machine. Bounded and optional:
   *  a voice note has no name, and a name is a label, never a path. */
  name: z.string().max(255).optional(),
  duration: z.number().int().nonnegative().optional(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
});

/**
 * A shared hub item (flight, product, property, event, movie, tv, recipe, …)
 * carried in a message and rendered as a rich card.
 *
 * `kind` is an OPEN string, not a closed enum: every hub coins its own kinds
 * (Entertainment → 'movie' / 'tv', Nutrition → 'recipe', and future hubs will
 * add more). The frontend already treats `kind` as an opaque string, so a
 * closed backend enum here silently 400'd every share whose kind wasn't in the
 * list (this is what broke the Entertainment Hub "Send" button). Keeping it a
 * bounded string keeps the contract forward-compatible for all hubs.
 *
 * Optional text fields use `.nullish()` (accept null OR undefined) because the
 * frontend sends explicit `null` for absent values (e.g. `image: posterUrl ?? null`);
 * a plain `.optional()` rejects `null` and would fail validation.
 */
export const ShareCardSchema = z.object({
  kind: z.string().min(1).max(40),
  hub: z.string().max(40).nullish(),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullish(),
  image: z.string().max(200000).nullish(),
  priceInr: z.number().finite().nullish(),
  meta: z.array(z.string().max(80)).max(8).nullish(),
  deepLink: z.string().max(4000).nullish(), // may carry a self-contained shared-meal token
  // Line items of a composite card (e.g. every dish in a shared meal), so the
  // recipient sees the WHOLE card, not just its headline.
  items: z.array(z.string().max(120)).max(16).nullish(),
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
  /** Only what this reader has kept. A query-string flag, so '1'/'true' both read. */
  starredOnly: z.coerce.boolean().optional(),
});
export type SearchMessagesDto = z.infer<typeof SearchMessagesSchema>;

export const StarMessageSchema = z.object({ on: z.boolean() });
export type StarMessageDto = z.infer<typeof StarMessageSchema>;

/**
 * The set, closed HERE rather than only in the picker.
 *
 * AN OPEN EMOJI FIELD IS AN OPEN TEXT FIELD WEARING A SMALLER NAME, and this
 * one is persisted and then broadcast to everybody in the room. That is the
 * rule, and it has not changed. `null` clears whatever you had — one per
 * person, so setting a second replaces the first rather than adding to it.
 *
 * IT WAS SIX, AND THE REASON WAS THE PICKER'S SHAPE: six is what fitted on one
 * row of a phone beside the other message actions, so the row WAS the picker
 * and there was nothing to open. The web client moved those actions into a
 * menu under the pressed message, which freed the row — so the quick rail is
 * now seven, with a `+` that opens the tray below it.
 *
 * The tray is longer and still enumerated. Every emoji a citizen can send is a
 * value written down here first; the plus opens a list, never a keyboard.
 *
 * The web client keeps its own copy of both lists (features/chat/MessageThread,
 * REACTIONS and MORE_REACTIONS) because the two packages share no code. Change
 * one, change the other.
 */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '😡'] as const;
export const TRAY_REACTIONS = [
  '🎉', '🔥', '👏', '💯', '🙌', '😍', '🥰', '😅',
  '🤔', '😴', '👀', '🤝', '💪', '☕', '🍰', '🐾',
  '✅', '❌', '⭐', '💔', '😭', '🤯', '🙃', '🫶',
] as const;
export const ReactMessageSchema = z.object({
  emoji: z.enum([...QUICK_REACTIONS, ...TRAY_REACTIONS]).nullable(),
});
export type ReactMessageDto = z.infer<typeof ReactMessageSchema>;

export const PinMessageSchema = z.object({ on: z.boolean() });
export type PinMessageDto = z.infer<typeof PinMessageSchema>;
