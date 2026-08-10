import { z } from 'zod';

/**
 * `unsent` is the folder a citizen sees: everything they wrote that is not
 * out there yet — drafts they stopped writing, and messages the provider
 * refused. Two states, one question ("what is still waiting on me?"), so one
 * room. `draft` and `failed` remain addressable on their own because the
 * counts, the retry path and the tests each need one without the other.
 */
export const FolderQuerySchema = z.object({
  folder: z.enum(['inbox', 'sent', 'draft', 'failed', 'unsent', 'starred', 'trash']).default('inbox'),
  /**
   * SEARCH IS A FILTER ON THE FOLDER YOU ARE STANDING IN, NOT A SEVENTH FOLDER.
   *
   * Optional and bounded. Bounded because this becomes a `contains` across five
   * columns and an unbounded needle is an unbounded scan; 120 characters is
   * longer than any subject line worth typing. Trimmed and dropped when empty,
   * so `?q=` from a cleared input is the same request as no `q` at all — the
   * alternative is a query that matches everything and looks like it matched
   * nothing.
   */
  q: z.string().trim().max(120).optional().transform((v) => (v ? v : undefined)),
});
export type FolderQueryDto = z.infer<typeof FolderQuerySchema>;

/**
 * Save (or update) a draft. Everything is optional because a draft is by
 * definition unfinished — an empty recipient, an empty subject and an empty
 * body are all legitimate states for a message somebody is still writing, and
 * refusing to hold them is how a client loses work.
 */
export const SaveDraftSchema = z.object({
  id: z.string().uuid().optional(),        // updating an existing draft
  to: z.string().max(120).default(''),
  subject: z.string().max(200).default(''),
  body: z.string().max(50000).default(''),
  threadId: z.string().max(64).optional(),
});
export type SaveDraftDto = z.infer<typeof SaveDraftSchema>;

export const SendMailSchema = z.object({
  to: z.string().min(1, 'Recipient required').max(120),
  /** Openly copied. Every recipient sees this list — that is what Cc means. */
  cc: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
  /** Blind-copied. Kept on the sender's Sent row and nowhere else. */
  bcc: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
  subject: z.string().max(200).default('(no subject)'),
  body: z.string().max(50000).default(''),
  threadId: z.string().max(64).optional(), // reply → append to this trail
  /** Drive files (owned by the sender) to attach to this message. */
  attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
  /** The draft this send came from. Cleared once the message is away — a
   *  draft that survives its own sending is a duplicate the citizen has to
   *  tidy up by hand, and would send twice if they resumed it. */
  draftId: z.string().uuid().optional(),
});
export type SendMailDto = z.infer<typeof SendMailSchema>;

export const FlagSchema = z.object({
  starred: z.boolean().optional(),
  read: z.boolean().optional(),
});
export type FlagDto = z.infer<typeof FlagSchema>;
