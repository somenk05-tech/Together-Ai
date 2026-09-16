import { z } from 'zod';
import { CLASSIFICATIONS, MEDICAL_CATEGORIES } from '../medical-mail.constants';

export const ListEmailsSchema = z.object({
  /** inbox | archived | starred | trash | attachments | all */
  folder: z.enum(['inbox', 'archived', 'starred', 'trash', 'attachments', 'all']).default('inbox'),
  /** One category, or several comma-separated — a chip on the page is a group
   *  ("LABS" is laboratory + blood-test + pathology). Unknown names are dropped. */
  category: z.string().max(200).transform((v) => v.split(',').map((x) => x.trim()).filter((x): x is (typeof MEDICAL_CATEGORIES)[number] => (MEDICAL_CATEGORIES as readonly string[]).includes(x))).optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export type ListEmailsDto = z.infer<typeof ListEmailsSchema>;

export const FlagEmailSchema = z.object({
  read: z.boolean().optional(),
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type FlagEmailDto = z.infer<typeof FlagEmailSchema>;

export const ReclassifySchema = z.object({
  classification: z.enum(CLASSIFICATIONS).optional(),
  category: z.enum(MEDICAL_CATEGORIES).nullable().optional(),
  /** Also remember the sender: always medical / always personal / nothing. */
  rememberSender: z.enum(['medical', 'personal']).optional(),
  /** Whether the memory covers the whole domain or just this address. */
  scope: z.enum(['address', 'domain']).default('address'),
});
export type ReclassifyDto = z.infer<typeof ReclassifySchema>;

export const SenderRuleSchema = z.object({
  pattern: z.string().trim().toLowerCase().min(3).max(254),
  kind: z.enum(['address', 'domain']),
  rule: z.enum(['medical', 'personal']),
});
export type SenderRuleDto = z.infer<typeof SenderRuleSchema>;

export const SettingsSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
  processDocuments: z.boolean().optional(),
  aiAnalysis: z.boolean().optional(),
  autoLink: z.boolean().optional(),
  classifyEmails: z.boolean().optional(),
  notify: z.boolean().optional(),
});
export type SettingsDto = z.infer<typeof SettingsSchema>;

/** "Move to Medical" from Together City Mail, or "Move to Personal" back. */
export const MoveFromMailSchema = z.object({ mailMessageId: z.string().min(1).max(64), rememberSender: z.enum(['medical', 'personal']).optional() });
export type MoveFromMailDto = z.infer<typeof MoveFromMailSchema>;
