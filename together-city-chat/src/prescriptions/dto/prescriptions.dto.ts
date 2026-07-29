import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const Times = z.array(z.string().regex(HHMM, 'Use 24-hour HH:MM')).min(1).max(6);

export const UploadPrescriptionSchema = z.object({
  fileKey: z.string().min(1).max(300),
  mimeType: z.string().max(120).optional(),
  note: z.string().trim().max(500).optional(),
}).strict();

/** A correction to one extracted line. Anything the citizen types is trusted. */
export const ReviewItemSchema = z.object({
  medicineName: z.string().trim().min(1).max(120).optional(),
  dosage: z.string().trim().max(80).optional(),
  frequency: z.string().trim().max(80).optional(),
  durationDays: z.number().int().min(1).max(365).nullable().optional(),
  instructions: z.string().trim().max(500).nullable().optional(),
  timesLocal: Times.optional(),
}).strict();

/** A line the citizen types themselves — from an unreadable photo, or no photo. */
export const AddItemSchema = z.object({
  medicineName: z.string().trim().min(1).max(120),
  dosage: z.string().trim().min(1).max(80),
  frequency: z.string().trim().min(1).max(80),
  durationDays: z.number().int().min(1).max(365).optional(),
  instructions: z.string().trim().max(500).optional(),
  timesLocal: Times.optional(),
}).strict();

export const ConfirmPrescriptionSchema = z.object({
  /** IANA zone the schedules run in. Falls back to the citizen's saved zone. */
  timezone: z.string().max(64).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export const DoseActionSchema = z.object({
  scheduleId: z.string().uuid(),
  scheduledAtUtc: z.string().datetime(),
  action: z.enum(['taken', 'skipped']),
  dosageTaken: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
}).strict();

export const LogsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().uuid().optional(),
}).strict();

export type UploadPrescriptionDto = z.infer<typeof UploadPrescriptionSchema>;
export type AddItemDto = z.infer<typeof AddItemSchema>;
export type ReviewItemDto = z.infer<typeof ReviewItemSchema>;
export type ConfirmPrescriptionDto = z.infer<typeof ConfirmPrescriptionSchema>;
export type DoseActionDto = z.infer<typeof DoseActionSchema>;
export type LogsQueryDto = z.infer<typeof LogsQuerySchema>;
