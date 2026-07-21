import { z } from 'zod';

export const RegisterSchema = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z0-9_.]+$/i),
  name: z.string().min(1).max(80),
  password: z.string().min(12).max(128),         // policy enforced in the service
  email: z.string().email().max(160),            // required — verification + receipts
  phone: z.string().max(24).optional(),          // optional primary phone
  profileImage: z.string().url().optional(),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const ForgotSchema = z.object({
  identifier: z.string().min(1),                      // primary email, phone, or handle
  channel: z.enum(['email', 'sms']).default('email'), // where to send the code
});
export type ForgotDto = z.infer<typeof ForgotSchema>;

export const ResetSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(4).max(12),
  newPassword: z.string().min(8).max(128),
});
export type ResetDto = z.infer<typeof ResetSchema>;

export const LoginSchema = z.object({
  handle: z.string().min(1),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({ refreshToken: z.string().min(10) });
export type RefreshDto = z.infer<typeof RefreshSchema>;
