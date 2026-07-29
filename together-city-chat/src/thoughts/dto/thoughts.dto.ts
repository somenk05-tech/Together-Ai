import { z } from 'zod';

/** Tags arrive as a list and are stored comma-separated, matching interests. */
const Tags = z.array(z.string().trim().min(1).max(24)).max(8).optional();

export const CreateThoughtSchema = z.object({
  title: z.string().trim().max(140).optional(),
  body: z.string().trim().min(1, 'Write something first.').max(20_000),
  mood: z.string().trim().max(24).optional(),
  tags: Tags,
}).strict();

export const UpdateThoughtSchema = z.object({
  title: z.string().trim().max(140).nullable().optional(),
  body: z.string().trim().min(1).max(20_000).optional(),
  mood: z.string().trim().max(24).nullable().optional(),
  tags: Tags,
}).strict();

export const ListThoughtsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
}).strict();

export type CreateThoughtDto = z.infer<typeof CreateThoughtSchema>;
export type UpdateThoughtDto = z.infer<typeof UpdateThoughtSchema>;
export type ListThoughtsDto = z.infer<typeof ListThoughtsSchema>;
