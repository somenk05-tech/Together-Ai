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

/**
 * A SNAP — a photograph with a clock on it. (2 Sep.)
 *
 * The mode is the clock, and there are four:
 *   once  · one open per recipient
 *   twice · two opens per recipient
 *   day   · unlimited opens, then gone after 24 hours
 *   keep  · the sender is content for the recipient to keep it
 *
 * `live` is the composer's word for "this came off the camera in the app, not
 * out of a gallery" — a claim about our own capture path, which is why it is a
 * boolean the client sets rather than something the API can check. The bytes
 * carry no proof of their own provenance. Stored because it is true of every
 * snap this app sends, and never displayed as if it were verified.
 *
 * How long a snap lives, and every one of these is server-decided: the client
 * says which mode, never which deadline. A `expiresAt` in the request body
 * would be a clock the sender sets on somebody else's copy.
 */
export const SnapSchema = z.object({
  mode: z.enum(['once', 'twice', 'day', 'keep']),
  live: z.boolean().optional(),
});
export type SnapDto = z.infer<typeof SnapSchema>;

/** `snaps/<userId>/<uuid>.<ext>` — see StorageProvider.presignSnapUpload. The
 *  shape is the ownership proof, so it is asserted here as well as there. */
const SNAP_KEY = /^snaps\/[^/]+\/[A-Za-z0-9._-]+$/;

export const AttachmentSchema = z.object({
  /**
   * TWO KINDS OF STRING, AND THE `snap` FIELD SAYS WHICH.
   *
   * An ordinary attachment carries a public URL, and `.url()` is the rule it
   * has always kept. A snap carries a PRIVATE KEY and must not carry a URL —
   * the recipient never receives the key at all, and there is no public
   * address for the object to have. So the check moved into the refinement
   * below, where it can ask which of the two this is; the non-snap branch is
   * `z.string().url()` unchanged, applied to the same field.
   */
  url: z.string().min(1).max(2048),
  thumbnail: z.string().url().optional(),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  /** What the file was called on the sender's machine. Bounded and optional:
   *  a voice note has no name, and a name is a label, never a path. */
  name: z.string().max(255).optional(),
  duration: z.number().int().nonnegative().optional(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
  /** Present ⇒ this attachment is a snap. Absent ⇒ everything below is the
   *  rule it was before this field existed. */
  snap: SnapSchema.optional(),
}).superRefine((a, ctx) => {
  if (!a.snap) {
    if (!z.string().url().safeParse(a.url).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Invalid url' });
    }
    return;
  }
  if (!SNAP_KEY.test(a.url)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'A snap names a snap key, not a URL.' });
  }
  /* A THUMBNAIL OF A TEMPORARY PHOTOGRAPH IS A PERMANENT COPY OF IT. The
     thumbnail field is a public URL by construction, so a snap that carried
     one would publish a small version of itself to the bucket the whole
     design exists to stay out of — and the recipient's client renders
     thumbnails eagerly, before anybody has spent a view. */
  if (a.thumbnail) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['thumbnail'], message: 'A snap has no thumbnail.' });
  }
});
export type AttachmentDto = z.infer<typeof AttachmentSchema>;

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
/**
 * A URL that carries its own authorisation in the query string: SigV4 and its
 * predecessors, and the Google equivalent. Nothing a share card legitimately
 * points at needs one — a public poster does not, and an app path cannot have
 * one. See the `image` field below for why this is not merely untidy.
 */
const PRESIGNED = /[?&](X-Amz-Signature|X-Amz-Credential|X-Goog-Signature|AWSAccessKeyId)=/i;

export const ShareCardSchema = z.object({
  kind: z.string().min(1).max(40),
  hub: z.string().max(40).nullish(),
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).nullish(),
  /**
   * A LINK TO A PICTURE, NEVER THE PICTURE ITSELF (fifth audit, 29 Aug).
   *
   * `z.string().max(200000)` accepted 200 KB of anything, and `send()` never
   * looked at this field: `assertAttachmentsAreYoursToSend` and
   * `screenAttachments` both run on `attachments` alone. So a share card was
   * the way to put an unowned, unsniffed, unscreened `data:image/...;base64,`
   * payload in front of a stranger — through the one field the media guard
   * does not read — and the recipient's client renders it eagerly as an
   * `<img src>`. Every real caller in the web app sends a URL here
   * (`m.posterUrl`, `images[0].url`, `master.imageUrl`); nothing legitimate
   * needed the other 199,950 characters.
   *
   * https or a same-origin path, and nothing else: `data:` carries a payload,
   * `http:` and `javascript:` carry the two other things a src can do. The
   * conversation-level rule — a chat between strangers takes no picture from
   * outside the city at all — is in `messages.service.ts`, because it needs to
   * know which conversation this is going to.
   */
  /**
   * ── AND NEVER A SIGNED URL FOR A PRIVATE OBJECT (31 Aug audit) ───────────
   *
   * Social post media lives in the PRIVATE bucket and is signed on read, so
   * `post.media[0].url` in the client is a presigned GET. Both social share
   * cards put it straight in here — `image: images[0]?.url ?? …` — and this
   * field is persisted into the message row and rendered by the recipient.
   *
   * Three things wrong with that, and the third is the one that matters:
   *
   *  · a presigned URL is an unbound bearer credential. It carries no
   *    requester identity, so anyone who reads that message — or the row, or
   *    a log line — can fetch the private object;
   *  · it expires, so the card was always going to become a broken image in
   *    a conversation that keeps it forever;
   *  · the recipient may be someone who cannot see the post AT ALL. A card
   *    carrying the picture shows a friends-only photograph to a stranger,
   *    which is the same defect as the repost audience bug, on a different
   *    surface. The deepLink is the honest half: it goes to the permalink,
   *    and the permalink asks assertCanView.
   *
   * DROPPED, NOT REFUSED — and that is a deploy-window decision. The API and
   * the web app ship independently, so if this rejected the message every
   * social share would 400 for however long the API ran ahead of the client.
   * Dropping the field converges on the same end state whichever half lands
   * first, and nobody's share fails while it does.
   */
  image: z.string().max(2048)
    .regex(/^(https:\/\/|\/)/, 'A card picture must be an https link or an app path.')
    .transform((u) => (PRESIGNED.test(u) ? null : u))
    .nullish(),
  priceInr: z.number().finite().nullish(),
  meta: z.array(z.string().max(80)).max(8).nullish(),
  /**
   * WHERE THE CARD GOES WHEN IT IS TAPPED — an app path, and only an app path.
   *
   * `z.string().max(4000)` with no scheme check, on a field the client renders
   * as `<Link to={card.deepLink}>` inside a message thread (re-audit, 29 Aug).
   * `//evil.example/x` is a protocol-relative href: one tap on a card a
   * stranger sent and the browser leaves the city, carrying the referer. It is
   * the sibling of `image` above and it was hardened a day late.
   *
   * A leading `/` and no second one. `javascript:` was already neutralised by
   * React Router's path resolution; this closes the redirect and the beacon.
   * May carry a self-contained shared-meal token in its query string.
   */
  deepLink: z.string().max(4000).regex(/^\/(?!\/)/, 'A card link must be a path inside the app.').nullish(),
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
  )
  /**
   * A SNAP TRAVELS ALONE.
   *
   * One snap, nothing else in the message: no second attachment, no share
   * card. Not tidiness — the open route spends a view and streams bytes for
   * ONE attachment on a message, and a message holding a snap beside an
   * ordinary photograph is a message whose other half is permanent. The person
   * who chose "View once" would have published the very thing they were
   * choosing not to.
   *
   * A caption is allowed, and deliberately: words are not the photograph, they
   * are how somebody says what the photograph is, and taking them away would
   * make every snap arrive with no context at all.
   */
  .superRefine((v, ctx) => {
    const snaps = (v.attachments ?? []).filter((a) => a.snap);
    if (!snaps.length) return;
    if (v.attachments!.length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attachments'], message: 'A snap is sent on its own.' });
    }
    if (v.share) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['share'], message: 'A snap is sent on its own.' });
    }
  });
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
