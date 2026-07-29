import { z } from 'zod';
import { apiGet, apiPost } from './http';
import { AuthResultSchema, TokenPairSchema, UserSchema, type AuthResult, type TokenPair, type User } from './schemas';

/** Request schemas (validate outbound payloads too). */
export const RegisterInput = z.object({
  handle: z.string().min(3), name: z.string().min(1), password: z.string().min(12),
  email: z.string().email(), phone: z.string().optional(),
});
const HandleAvailability = z.object({
  handle: z.string(), valid: z.boolean(), available: z.boolean(), suggestions: z.array(z.string()),
});
export type HandleAvailability = z.infer<typeof HandleAvailability>;
export const LoginInput = z.object({ handle: z.string().min(3), password: z.string().min(1) });
export type RegisterInput = z.infer<typeof RegisterInput>;
export type LoginInput = z.infer<typeof LoginInput>;

const OkSent = z.object({ sent: z.boolean(), delivery: z.enum(['live', 'unconfigured']).optional() });
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
  forgot: (identifier: string, channel: 'email' | 'sms' = 'email'): Promise<{ sent: boolean; delivery?: 'live' | 'unconfigured' }> =>
    apiPost('/auth/forgot', { identifier, channel }, OkSent),
  reset: (input: { identifier: string; code: string; newPassword: string }): Promise<{ ok: boolean }> =>
    apiPost<{ ok: boolean }>('/auth/reset', input, OkReset),
  verifyEmail: (token: string): Promise<TokenPair> =>
    apiPost('/auth/verify-email', { token }, TokenPairSchema),
  resendVerification: (email: string): Promise<{ ok: boolean; message: string }> =>
    apiPost('/auth/resend-verification', { email }, z.object({ ok: z.boolean(), message: z.string() })),
  /** Re-send the verification link to the SIGNED-IN user (no email typing). */
  sendVerification: (): Promise<{ ok?: boolean }> =>
    apiPost('/auth/send-verification', {}, z.object({ ok: z.boolean().optional() }).passthrough()),
  /** Permanently delete the signed-in account (password re-auth required). */
  deleteAccount: (password: string): Promise<{ ok: boolean }> =>
    apiPost('/auth/delete-account', { password }, z.object({ ok: z.boolean() })),
  me: (): Promise<User> => apiGet('/users/me', UserSchema),
};
