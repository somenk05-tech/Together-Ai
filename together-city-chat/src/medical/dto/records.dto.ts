import { z } from 'zod';
import { RECORD_KINDS } from '../record-reader';

// kind is a category slug the frontend controls (blood-test, imaging, prescription, …).
export const AddRecordSchema = z.object({
  kind: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  detail: z.string().max(2000).optional(),
  fileUrl: z.string().url().optional(),
  recordedOn: z.string().datetime().optional(),
});
export type AddRecordDto = z.infer<typeof AddRecordSchema>;

/** Extract markers from an uploaded blood report (already in the private vault). */
export const ExtractBloodSchema = z.object({
  fileKey: z.string().min(1).max(300),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().nonnegative().max(52428800),
  title: z.string().max(160).optional(),
});
export type ExtractBloodDto = z.infer<typeof ExtractBloodSchema>;

/** Upload → auto-analyse in one step: file the report once, read its markers, and
 *  (when readable) create the linked panel + run the analysis automatically. */
export const IngestBloodSchema = z.object({
  fileKey: z.string().min(1).max(300),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().nonnegative().max(52428800),
  title: z.string().max(160).optional(),
  detail: z.string().max(2000).optional(),
});
export type IngestBloodDto = z.infer<typeof IngestBloodSchema>;

/** Upload with no category: the server reads the document and files it
 *  (owner, 10 Sep). `name` is the file's own name, kept only as the title of
 *  last resort when the document cannot be read. */
export const SortedUploadSchema = z.object({
  fileKey: z.string().min(1).max(300),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().nonnegative().max(52428800),
  name: z.string().max(200).optional(),
});
export type SortedUploadDto = z.infer<typeof SortedUploadSchema>;

/** The citizen's answer when the vault asks what a document is — and the
 *  same move when they re-file one the reader put in the wrong folder. */
export const TagRecordSchema = z.object({
  kind: z.enum(RECORD_KINDS),
});
export type TagRecordDto = z.infer<typeof TagRecordSchema>;

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
