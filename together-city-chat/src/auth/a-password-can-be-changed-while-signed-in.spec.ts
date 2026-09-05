/* eslint-disable @typescript-eslint/no-explicit-any */
import * as argon2 from 'argon2';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * ── A PASSWORD CAN BE CHANGED WHILE SIGNED IN (launch gate, third reading,
 *    4 Sep) ───────────────────────────────────────────────────────────────
 *
 * There was no route. The devices card said "until you change your
 * password" and Settings said "Coming soon"; a citizen who suspected a leak
 * had to sign out and hope the recovery email arrived. Now: the current
 * password proves it is them, the new one passes the door's policy, every
 * session ends — this one included — and this device is handed a fresh
 * pair in the same response.
 */
const STRONG = 'Harbour-lantern-quietly-42';
const STRONGER = 'Meadow-turbine-eleven-thousand-9';

function build(passwordHash: string) {
  const users = [{ id: 'u1', handle: 'somen', passwordHash, deletedAt: null, suspendedAt: null }];
  const updates: any[] = [];
  const prisma = {
    user: {
      findUnique: async ({ where }: any) => users.find((u) => u.id === where.id || u.handle === where.handle) ?? null,
      update: async ({ where, data }: any) => { const u = users.find((x) => x.id === where.id)!; Object.assign(u, data); updates.push(data); return u; },
    },
  };
  const tokens = {
    revokedAll: [] as string[],
    issued: [] as any[],
    revokeAll: async (id: string) => { tokens.revokedAll.push(id); },
    issuePair: async (user: any, meta: any) => { tokens.issued.push({ user, meta }); return { accessToken: 'new-access', refreshToken: 'new-refresh' }; },
  };
  const mail = { sent: [] as any[], deliverSystem: async (userId: string, m: any, kind: string) => { mail.sent.push({ userId, ...m, kind }); } };
  const svc = new AuthService(prisma as never, tokens as never, mail as never, { up: false } as never);
  return { svc, users, updates, tokens, mail };
}

describe('a password can be changed while signed in', () => {
  it('verifies the current password, applies the policy, signs out everywhere, and re-mints this device', async () => {
    const { svc, users, tokens, mail } = build(await argon2.hash(STRONG));
    const out = await svc.changePassword('u1', { currentPassword: STRONG, newPassword: STRONGER }, { device: 'Mac · Safari' });
    expect(out).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh', userId: 'u1' });
    expect(await argon2.verify(users[0].passwordHash, STRONGER)).toBe(true);
    expect(tokens.revokedAll).toEqual(['u1']);
    expect(tokens.issued[0].user).toEqual({ sub: 'u1', handle: 'somen' });
    expect(tokens.issued[0].meta.device).toBe('Mac · Safari');
    expect(mail.sent[0].kind).toBe('security');
  });

  it('a wrong current password changes nothing and revokes nothing', async () => {
    const { svc, users, tokens, updates } = build(await argon2.hash(STRONG));
    await expect(svc.changePassword('u1', { currentPassword: 'not-it-at-all-really', newPassword: STRONGER })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updates).toEqual([]);
    expect(tokens.revokedAll).toEqual([]);
    expect(await argon2.verify(users[0].passwordHash, STRONG)).toBe(true);
  });

  it('the new password meets the door’s policy, and is not the old one', async () => {
    const { svc, updates } = build(await argon2.hash(STRONG));
    await expect(svc.changePassword('u1', { currentPassword: STRONG, newPassword: 'password12345' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.changePassword('u1', { currentPassword: STRONG, newPassword: STRONG })).rejects.toThrow(/not used here before/);
    expect(updates).toEqual([]);
  });
});
