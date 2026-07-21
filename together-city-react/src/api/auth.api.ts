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

const OkSent = z.object({ sent: z.boolean() });
const OkReset = z.object({ ok: z.boolean() });

export const authApi = {
  register: (input: RegisterInput): Promise<AuthResult> =>
    apiPost('/auth/register', RegisterInput.parse(input), AuthResultSchema),
  login: (input: LoginInput): Promise<AuthResult> =>
    apiPost('/auth/login', LoginInput.parse(input), AuthResultSchema),
  handleAvailable: (handle: string): Promise<HandleAvailability> =>
    apiGet(`/auth/handle-available?handle=${encodeURIComponent(handle)}`, HandleAvailability),
  emailAvailable: (email: string): Promise<{ email: string; valid: boolean; available: boolean }> =>
    apiGet(`/auth/email-available?email=${encodeURIComponent(email)}`, z.object({ email: z.string(), valid: z.boolean(), available: z.boolean() })),
  refresh: (refreshToken: string): Promise<TokenPair> =>
    apiPost('/auth/refresh', { refreshToken }, TokenPairSchema),
  logout: (): Promise<{ ok: boolean }> =>
    apiPost<{ ok: boolean }>('/auth/logout', {}, z.object({ ok: z.boolean() })),
  forgot: (identifier: string, channel: 'email' | 'sms' = 'email'): Promise<{ sent: boolean }> =>
    apiPost<{ sent: boolean }>('/auth/forgot', { identifier, channel }, OkSent),
  reset: (input: { identifier: string; code: string; newPassword: string }): Promise<{ ok: boolean }> =>
    apiPost<{ ok: boolean }>('/auth/reset', input, OkReset),
  oauthProviders: (): Promise<Record<string, boolean>> =>
    apiGet('/auth/oauth/providers', z.record(z.string(), z.boolean())),
  oauthComplete: (input: { registrationToken: string; handle: string; password: string; phone?: string }): Promise<TokenPair> =>
    apiPost('/auth/oauth/complete', input, TokenPairSchema),
  verifyEmail: (token: string): Promise<TokenPair> =>
    apiPost('/auth/verify-email', { token }, TokenPairSchema),
  resendVerification: (email: string): Promise<{ ok: boolean; message: string }> =>
    apiPost('/auth/resend-verification', { email }, z.object({ ok: z.boolean(), message: z.string() })),
  me: (): Promise<User> => apiGet('/users/me', UserSchema),
};
