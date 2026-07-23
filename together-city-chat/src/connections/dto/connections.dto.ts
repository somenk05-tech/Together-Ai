import { z } from 'zod';

/**
 * Public connections API — a simple handle-based friend model.
 * (The DB keeps a richer typed model; these endpoints speak the friend graph
 * the app's UI uses. Domain-specific links — doctor/patient etc. — are created
 * by their own modules, not here.)
 */
export const CONNECTION_MODULES = [
  'chat', 'mail', 'social', 'nutrition', 'grocery', 'pantry', 'medical', 'travel',
  'calendar', 'entertainment', 'financial', 'jobs', 'beauty', 'fitness',
] as const;

/** Universal modules — every connection gets these automatically; they are
 *  never toggles and can never be revoked while the connection exists. */
export const UNIVERSAL_MODULES = ['chat', 'mail'] as const;

export const RequestConnectionSchema = z.object({
  handle: z.string().min(1).max(40),
  relationship: z.enum(['family', 'friend', 'partner', 'colleague', 'other']).optional(),
  modules: z.array(z.enum(CONNECTION_MODULES)).max(12).optional(),
});

export const UpdateModulesSchema = z.object({
  modules: z.array(z.enum(CONNECTION_MODULES)).max(14),
  relationship: z.enum(['family', 'friend', 'partner', 'colleague', 'other']).optional(),
});
export type UpdateModulesDto = z.infer<typeof UpdateModulesSchema>;
export type RequestConnectionDto = z.infer<typeof RequestConnectionSchema>;

export const RespondConnectionSchema = z.object({
  connectionId: z.string().min(1),
  status: z.enum(['accepted', 'blocked']),
});
export type RespondConnectionDto = z.infer<typeof RespondConnectionSchema>;
