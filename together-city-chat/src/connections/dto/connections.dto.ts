import { z } from 'zod';

export const ConnectionTypeEnum = z.enum([
  'FRIEND',
  'COUPLE',
  'FAMILY',
  'BUSINESS_CUSTOMER',
  'DOCTOR_PATIENT',
  'NUTRITIONIST_CLIENT',
  'LAWYER_CLIENT',
  'MARKETPLACE_BUYER_SELLER',
  'EVENT_PARTICIPANT',
]);

export const RequestConnectionSchema = z.object({
  targetUserId: z.string().uuid(),
  connectionType: ConnectionTypeEnum,
});
export type RequestConnectionDto = z.infer<typeof RequestConnectionSchema>;

export const RespondConnectionSchema = z.object({
  connectionId: z.string().uuid(),
  action: z.enum(['ACCEPT', 'DECLINE', 'BLOCK', 'REMOVE']),
});
export type RespondConnectionDto = z.infer<typeof RespondConnectionSchema>;
