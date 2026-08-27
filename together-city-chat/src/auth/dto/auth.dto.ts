import { z } from 'zod';
import { MIN_DATING_AGE, UNDER_AGE_MESSAGE, isAdult } from '../../shared/age';

/**
 * ── 18+ IS THE RULE FOR THE WHOLE CITY (owner, 27 Aug) ──────────────────────
 *
 * The launch audit found the age rule enforced in exactly one place — inside
 * the dating hub's moderation, after the row was written — while registration
 * asked for no date of birth at all and the Terms checkbox was gated only in
 * the browser. The server had no record that anybody had ever claimed to be an
 * adult.
 *
 * So the question moves to the front door. Nobody gets an account without a
 * date of birth, and no date of birth under eighteen gets an account. The
 * dating gate STAYS — it is now the second line rather than the only one, and
 * it is what catches a date that arrived by some other path.
 *
 * EXISTING ACCOUNTS ARE NOT LOCKED OUT. They predate this field and hold no
 * date of birth; signing them out of a city they already live in would be a
 * punishment for our own omission. They meet the same rule the moment they
 * enter a date anywhere — the dating profile, the master profile — because
 * both refuse an under-18 date now.
 */
export const RegisterSchema = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z0-9_.]+$/i),
  name: z.string().min(1).max(80),
  password: z.string().min(12).max(128),         // policy enforced in the service
  email: z.string().email().max(160),            // required — verification + receipts
  phone: z.string().max(24).optional(),          // optional primary phone
  profileImage: z.string().url().optional(),
  /** Cloudflare Turnstile token; required only when TURNSTILE_SECRET is set. */
  turnstileToken: z.string().max(4096).optional(),
  /** Required. The city is 18+, and this is where that is established. */
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
}).refine((v) => isAdult(v.dateOfBirth), {
  message: `You must be ${MIN_DATING_AGE} or older to join Together City.`,
  path: ['dateOfBirth'],
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
  turnstileToken: z.string().max(4096).optional(),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const RefreshSchema = z.object({ refreshToken: z.string().min(10) });
export type RefreshDto = z.infer<typeof RefreshSchema>;
