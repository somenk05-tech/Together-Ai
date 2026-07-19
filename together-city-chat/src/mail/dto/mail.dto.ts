import { z } from 'zod';

export const FolderQuerySchema = z.object({
  folder: z.enum(['inbox', 'sent', 'starred', 'trash']).default('inbox'),
});
export type FolderQueryDto = z.infer<typeof FolderQuerySchema>;

export const SendMailSchema = z.object({
  to: z.string().min(1, 'Recipient required').max(120),
  subject: z.string().max(200).default('(no subject)'),
  body: z.string().max(50000).default(''),
  threadId: z.string().max(64).optional(), // reply → append to this trail
});
export type SendMailDto = z.infer<typeof SendMailSchema>;

export const FlagSchema = z.object({
  starred: z.boolean().optional(),
  read: z.boolean().optional(),
});
export type FlagDto = z.infer<typeof FlagSchema>;
