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
  /**
   * A PROJECT IS A SCOPE ON A FOLDER, NOT AN EIGHTH FOLDER.
   *
   * `?folder=inbox&project=abg` is the ABG inbox. Every folder keeps working
   * inside a project — Sent, Drafts, Starred and Trash all mean the same thing
   * one room in. That is the whole difference between a mailbox and a saved
   * search: a saved search has one list, and a mailbox has folders.
   *
   * The project KEY rather than its id, because it is also the URL a citizen
   * is standing on and the sub-address they hand out. An unknown key is a 404
   * rather than an empty list — an empty ABG inbox and no ABG at all are two
   * very different things to be told.
   */
  project: z.string().trim().max(24).optional().transform((v) => (v ? v.toLowerCase() : undefined)),
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
  /**
   * Compose was opened inside a project, so the thread it starts is born
   * filed there and every reply comes home to the same room. Ignored when the
   * thread is already filed — a conversation does not change rooms because
   * somebody replied to it from a different screen.
   */
  projectId: z.string().uuid().optional(),
});
export type SendMailDto = z.infer<typeof SendMailSchema>;

export const FlagSchema = z.object({
  starred: z.boolean().optional(),
  read: z.boolean().optional(),
});
export type FlagDto = z.infer<typeof FlagSchema>;

/**
 * PROJECTS — the rooms inside a mailbox.
 *
 * Fifty per citizen. The cap is here rather than in the service so the number
 * has one home: the API refuses the fifty-first, and the client counts up to
 * it out loud (`4 / 50`) instead of springing it at the limit.
 */
export const PROJECT_CAP = 50;

/**
 * The key is a URL segment and half an email address, so it is bounded to what
 * both of those can carry without escaping: lowercase letters, digits and
 * hyphens, starting on a letter or a digit. Twenty-four characters is longer
 * than anything anybody wants to type after a `+`.
 */
export const ProjectKeySchema = z.string().trim().min(1).max(24)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'Use letters, numbers and hyphens')
  .transform((v) => v.toLowerCase());

/**
 * The nine a citizen picks from, and the slate All Emails wears.
 *
 * Validated as a list rather than left open: a tint the client cannot draw
 * renders a colourless folder, and the honest place to refuse it is here.
 * Adding a tenth is a line in this array and a token in the stylesheet.
 */
export const FOLD_TINTS = ['blue', 'green', 'purple', 'red', 'orange', 'teal', 'amber', 'pink', 'violet', 'slate'] as const;

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Give the project a name').max(60),
  key: ProjectKeySchema,
  subAddress: z.boolean().default(false),
  color: z.enum(FOLD_TINTS).default('blue'),
  /** One line, on the folder. Short because it is drawn in two lines of 12px
   *  and a paragraph would be clipped rather than read. */
  description: z.string().trim().max(80).optional(),
}).strict();
export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;

/** Rename, switch the sub-address on or off, archive or unarchive. The key
 *  cannot change: it is a URL people have bookmarked and an address they have
 *  handed out, and mail addressed to the old one would stop arriving. */
export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  subAddress: z.boolean().optional(),
  archived: z.boolean().optional(),
  color: z.enum(FOLD_TINTS).optional(),
  description: z.string().trim().max(80).optional(),
}).strict();
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;

/**
 * File a whole conversation, or take it out of a project (`projectId: null`).
 *
 * The thread and not the message, always. Half a trail in one room and half in
 * another is not a state a citizen can have asked for, and it is the state a
 * per-message move produces the first time somebody moves one row of three.
 */
export const FileThreadSchema = z.object({
  threadId: z.string().trim().min(1).max(64),
  projectId: z.string().uuid().nullable(),
}).strict();
export type FileThreadDto = z.infer<typeof FileThreadSchema>;
