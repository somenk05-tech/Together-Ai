import { z } from 'zod';
import { apiGet, apiPost } from './http';
import { AuthResultSchema, TokenPairSchema, UserSchema, type AuthResult, type TokenPair, type User } from './schemas';

/** Request schemas (validate outbound payloads too). */
export const RegisterInput = z.object({
  handle: z.string().min(3), name: z.string().min(1), password: z.string().min(12),
  email: z.string().email(), phone: z.string().optional(),
  /** Required. The city is 18+ and the server refuses anything younger. */
  dateOfBirth: z.string(),
  /** Required, asked once. The SOCIAL answer — the city's one vocabulary,
   *  matching GENDER_IDENTITY on the server. Clinical sex is a separate
   *  question and is not asked at the door. */
  gender: z.enum(['male', 'female', 'nonBinary', 'other']),
  /** Only meaningful alongside 'other'. Optional either way. */
  genderOther: z.string().optional(),
  /** Cloudflare Turnstile, when the site key is set. Absent otherwise. */
  turnstileToken: z.string().optional(),
});
const HandleAvailability = z.object({
  handle: z.string(), valid: z.boolean(), available: z.boolean(), suggestions: z.array(z.string()),
});
export type HandleAvailability = z.infer<typeof HandleAvailability>;
export const LoginInput = z.object({ handle: z.string().min(3), password: z.string().min(1), turnstileToken: z.string().optional() });
export type RegisterInput = z.infer<typeof RegisterInput>;
export type LoginInput = z.infer<typeof LoginInput>;

const OkSent = z.object({ sent: z.boolean(), delivery: z.enum(['live', 'failed', 'unconfigured']).optional() });

/** Six-digit verification of a real email address or phone number (p2, p3, p19). */
export const VerificationChannel = z.enum(['email', 'phone']);
export type VerificationChannel = z.infer<typeof VerificationChannel>;

const CodeSent = z.object({
  sent: z.boolean(),
  channel: VerificationChannel,
  /** Masked — s****i@gbcapl.com. Enough to recognise, not enough to harvest. */
  target: z.string(),
  /** 'failed' means the provider refused it — no code is on its way. */
  delivery: z.enum(['live', 'failed', 'unconfigured']),
  reason: z.string().optional(),
  retryAfterMs: z.number(),
});
export type CodeSent = z.infer<typeof CodeSent>;

const CodeConfirmed = z.object({
  verified: z.literal(true),
  channel: VerificationChannel,
  target: z.string(),
  verifiedAt: z.coerce.date(),
});
export type CodeConfirmed = z.infer<typeof CodeConfirmed>;

const ChannelStatus = z.object({
  target: z.string().nullable(),
  verified: z.boolean(),
  verifiedAt: z.coerce.date().nullable(),
});
const VerificationStatus = z.object({
  email: ChannelStatus,
  phone: ChannelStatus,
  emailConfigured: z.boolean(),
  smsConfigured: z.boolean(),
});
export type VerificationStatus = z.infer<typeof VerificationStatus>;
const OkReset = z.object({ ok: z.boolean() });
const Ok = z.object({ ok: z.boolean() });

const SessionSchema = z.object({
  id: z.string(), device: z.string().nullable(), ip: z.string().nullable(),
  createdAt: z.string(), lastUsedAt: z.string(), current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionSchema>;

export const authApi = {
  register: (input: RegisterInput): Promise<AuthResult> =>
    apiPost('/auth/register', RegisterInput.parse(input), AuthResultSchema),
  login: (input: LoginInput): Promise<AuthResult> =>
    apiPost('/auth/login', LoginInput.parse(input), AuthResultSchema),
  handleAvailable: (handle: string): Promise<HandleAvailability> =>
    apiGet(`/auth/handle-available?handle=${encodeURIComponent(handle)}`, HandleAvailability),
  emailAvailable: (email: string): Promise<{ email: string; valid: boolean; available: boolean }> =>
    apiGet(`/auth/email-available?email=${encodeURIComponent(email)}`, z.object({ email: z.string(), valid: z.boolean(), available: z.boolean() })),
  // refreshToken is optional — the HttpOnly cookie is used when it isn't passed.
  refresh: (refreshToken?: string): Promise<TokenPair> =>
    apiPost('/auth/refresh', refreshToken ? { refreshToken } : {}, TokenPairSchema),
  logout: (): Promise<{ ok: boolean }> =>
    apiPost<{ ok: boolean }>('/auth/logout', {}, Ok),
  // Multi-device session management.
  sessions: (): Promise<SessionInfo[]> => apiGet('/auth/sessions', z.array(SessionSchema)),
  revokeSession: (id: string): Promise<{ ok: boolean }> => apiPost('/auth/sessions/revoke', { id }, Ok),
  logoutOthers: (): Promise<{ ok: boolean }> => apiPost('/auth/logout-others', {}, Ok),
  logoutAll: (): Promise<{ ok: boolean }> => apiPost('/auth/logout-all', {}, Ok),
  forgot: (identifier: string, channel: 'email' | 'sms' = 'email'): Promise<{ sent: boolean; delivery?: 'live' | 'failed' | 'unconfigured' }> =>
    apiPost('/auth/forgot', { identifier, channel }, OkSent),
  reset: (input: { identifier: string; code: string; newPassword: string }): Promise<{ ok: boolean }> =>
    apiPost<{ ok: boolean }>('/auth/reset', input, OkReset),
  /**
   * Ask for a six-digit code. `target` is optional for email (defaults to the
   * address on the account) and is how you change either channel: supplying a
   * new one writes it as unverified and sends the code there.
   */
  sendCode: (channel: VerificationChannel, target?: string): Promise<CodeSent> =>
    apiPost('/auth/verification/send', { channel, ...(target ? { target } : {}) }, CodeSent),
  confirmCode: (channel: VerificationChannel, code: string): Promise<CodeConfirmed> =>
    apiPost('/auth/verification/confirm', { channel, code }, CodeConfirmed),
  verificationStatus: (): Promise<VerificationStatus> =>
    apiGet('/auth/verification/status', VerificationStatus),
  /** Permanently delete the signed-in account (password re-auth required). */
  deleteAccount: (password: string): Promise<{ ok: boolean }> =>
    apiPost('/auth/delete-account', { password }, z.object({ ok: z.boolean() })),
  me: (): Promise<User> => apiGet('/users/me', UserSchema),
};
