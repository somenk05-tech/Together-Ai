import { z } from 'zod';

export const AddRecordSchema = z.object({
  kind: z.enum(['prescription', 'report', 'condition', 'allergy', 'vaccination', 'note']),
  title: z.string().min(1).max(160),
  detail: z.string().max(2000).optional(),
  fileUrl: z.string().url().optional(),
  recordedOn: z.string().datetime().optional(),
});
export type AddRecordDto = z.infer<typeof AddRecordSchema>;

export const BookConsultSchema = z.object({
  doctorId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  scheduledAt: z.string().datetime().optional(),
  method: z.enum(['wallet', 'card']).default('wallet'),
});
export type BookConsultDto = z.infer<typeof BookConsultSchema>;

export const ConsentSchema = z.object({
  hub: z.enum(['nutrition', 'beauty', 'fitness']),
  granted: z.boolean(),
});
export type ConsentDto = z.infer<typeof ConsentSchema>;
