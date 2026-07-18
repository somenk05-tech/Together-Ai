import { z } from 'zod';
import { apiGet, apiPost } from './http';
import { AuthResultSchema, TokenPairSchema, UserSchema, type AuthResult, type TokenPair, type User } from './schemas';

/** Request schemas (validate outbound payloads too). */
export const RegisterInput = z.object({
  handle: z.string().min(3), name: z.string().min(1), password: z.string().min(8),
  email: z.string().email().optional(), phone: z.string().optional(),
});
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
  refresh: (refreshToken: string): Promise<TokenPair> =>
    apiPost('/auth/refresh', { refreshToken }, TokenPairSchema),
  logout: (): Promise<{ ok: boolean }> =>
    apiPost<{ ok: boolean }>('/auth/logout', {}, z.object({ ok: z.boolean() })),
  forgot: (identifier: string, channel: 'email' | 'sms' = 'email'): Promise<{ sent: boolean }> =>
    apiPost<{ sent: boolean }>('/auth/forgot', { identifier, channel }, OkSent),
  reset: (input: { identifier: string; code: string; newPassword: string }): Promise<{ ok: boolean }> =>
    apiPost<{ ok: boolean }>('/auth/reset', input, OkReset),
  me: (): Promise<User> => apiGet('/users/me', UserSchema),
};
