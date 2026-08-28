import { z } from 'zod';
import { MIN_DATING_AGE, isAdult } from '../../shared/age';
import { GENDER_IDENTITY, ORIENTATION } from '../../profile/sex-and-gender';

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
  /**
   * ── ASKED ONCE, AT THE FRONT DOOR (owner, 27 Aug) ─────────────────────────
   *
   * Four hubs used to ask this question separately — dating, beauty, nutrition,
   * fitness — and sex-and-gender.ts exists because they disagreed about what
   * they were asking. Asking at registration puts one answer on the Master
   * Profile before any hub has an opinion, and prefillFromMaster hands it to
   * the dating form rather than asking a second time.
   *
   * `GENDER_IDENTITY`, not a new list. This is the SOCIAL question — how the
   * app refers to somebody and what dating shows. The CLINICAL one
   * (`sexAtBirth`, which feeds Mifflin-St Jeor) is deliberately not asked here:
   * it belongs to the hub that needs a coefficient, and collapsing the two back
   * into one field is the exact bug sex-and-gender.ts was written to undo.
   *
   * ASKED ONCE IS NOT LOCKED. It stays editable on the Master Profile page, so
   * a citizen who transitions is not held to an answer they gave at sign-up.
   */
  gender: z.enum(GENDER_IDENTITY),
  /** Free text, only meaningful when gender is 'other'. Optional either way. */
  genderOther: z.string().trim().max(40).optional(),
  /**
   * ── SEXUAL ORIENTATION, NO LONGER ASKED AT THE DOOR (owner, 28 Aug) ───────
   *
   * Reverses the 27 Aug decision. This is SPECIAL-CATEGORY DATA under GDPR
   * Article 9, and requiring it here meant holding it about every citizen —
   * including everyone who only ever opens Jobs, Nutrition or Cars. The
   * sign-up form no longer sends it; the field stays OPTIONAL on the wire so
   * an older client that still offers it is not refused, and the profile is
   * where a citizen states or edits it.
   *
   * What still holds, unchanged, wherever a value does exist:
   *   · It never appears in a cross-citizen response. See
   *     `nothing-about-who-you-love.spec.ts`.
   *   · It drives nothing. The dating engine reads `gender` and `seeking`,
   *     which are stated separately in the hub and mean something precise.
   *   · `preferNotToSay` is one of the answers, distinct from not answering.
   */
  orientation: z.enum(ORIENTATION).optional(),
  /** Free text, only meaningful when orientation is 'other'. */
  orientationOther: z.string().trim().max(40).optional(),
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
