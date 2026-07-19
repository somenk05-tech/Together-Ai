import { z } from 'zod';

export const AddRecordSchema = z.object({
  kind: z.enum(['prescription', 'report', 'condition', 'allergy', 'vaccination', 'note']),
  title: z.string().min(1).max(160),
  detail: z.string().max(2000).optional(),
  fileUrl: z.string().url().optional(),
  recordedOn: z.string().datetime().optional(),
});
export type AddRecordDto = z.infer<typeof AddRecordSchema>;

/** Record a health document already uploaded to R2 (its bytes hit the 10 GB vault). */
export const UploadDocSchema = z.object({
  kind: z.enum(['prescription', 'report', 'condition', 'allergy', 'vaccination', 'note']),
  title: z.string().min(1).max(160),
  detail: z.string().max(2000).optional(),
  fileUrl: z.string().url(),
  fileKey: z.string().max(300).optional(),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().max(52428800),
});
export type UploadDocDto = z.infer<typeof UploadDocSchema>;

/** Extract markers from an uploaded blood report (already in R2). */
export const ExtractBloodSchema = z.object({
  fileUrl: z.string().url(),
  fileKey: z.string().max(300).optional(),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().nonnegative().max(52428800),
  title: z.string().max(160).optional(),
});
export type ExtractBloodDto = z.infer<typeof ExtractBloodSchema>;

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
