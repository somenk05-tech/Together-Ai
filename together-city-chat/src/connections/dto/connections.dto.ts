import { z } from 'zod';

/**
 * Public connections API — a simple handle-based friend model.
 * (The DB keeps a richer typed model; these endpoints speak the friend graph
 * the app's UI uses. Domain-specific links — doctor/patient etc. — are created
 * by their own modules, not here.)
 */
export const RequestConnectionSchema = z.object({
  handle: z.string().min(1).max(40),
});
export type RequestConnectionDto = z.infer<typeof RequestConnectionSchema>;

export const RespondConnectionSchema = z.object({
  connectionId: z.string().min(1),
  status: z.enum(['accepted', 'blocked']),
});
export type RespondConnectionDto = z.infer<typeof RespondConnectionSchema>;
