import { z } from 'zod';

export const BookTicketSchema = z.object({
  tier: z.string().min(1).max(60),
  qty: z.number().int().min(1).max(10),
  method: z.enum(['wallet', 'card']).default('wallet'),
});
export type BookTicketDto = z.infer<typeof BookTicketSchema>;

export const EventQuerySchema = z.object({
  category: z.string().optional(),
  city: z.string().optional(),
});
export type EventQueryDto = z.infer<typeof EventQuerySchema>;
