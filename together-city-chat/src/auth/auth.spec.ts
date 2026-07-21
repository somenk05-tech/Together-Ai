import { AuthService } from './auth.service';
import { RecoveryService, assertStrongPassword } from './recovery.service';
import { VerificationService } from './verification.service';

/* ── in-memory fakes (no DB, no network) ── */
type Row = Record<string, unknown>;
const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]) => (v === null ? row[k] == null : row[k] === v));

class Table {
  rows: Row[] = [];
  private seq = 1;
  constructor(private defaults: Row = {}) {}
  create({ data }: { data: Row }) { const r = { id: `id_${this.seq++}`, ...this.defaults, ...data }; this.rows.push(r); return Promise.resolve(r); }
  findUnique({ where }: { where: Row }) { return Promise.resolve(this.rows.find((r) => matches(r, where)) ?? null); }
  findFirst({ where }: { where: Row }) { return Promise.resolve(this.rows.find((r) => matches(r, where)) ?? null); }
  update({ where, data }: { where: Row; data: Row }) { const r = this.rows.find((x) => matches(x, where))!; Object.assign(r, data); return Promise.resolve(r); }
  updateMany({ where, data }: { where: Row; data: Row }) { let n = 0; for (const r of this.rows) if (matches(r, where)) { Object.assign(r, data); n++; } return Promise.resolve({ count: n }); }
}

function makeFakes() {
  const prisma = { user: new Table({ emailVerified: false }), foodPref: new Table(), recoveryCode: new Table({ attempts: 0, resends: 0 }), verificationToken: new Table() };
  const mail = { lastBody: '', deliverSystem: (_u: string, r: { body: string }) => { (mail as { lastBody: string }).lastBody = r.body; return Promise.resolve({}); } };
  const tokens = { revokedAll: [] as string[], issuePair: () => Promise.resolve({ accessToken: 'a', refreshToken: 'r' }), revokeAll: (id: string) => { tokens.revokedAll.push(id); return Promise.resolve(); } };
  return { prisma, mail, tokens };
}
const otpFrom = (body: string) => (body.match(/\b(\d{6})\b/) ?? [])[1] ?? '';
const STRONG = 'Sup3r$ecret!!'; // 13 chars, all classes

describe('password policy', () => {
  it('accepts a strong password', () => { expect(() => assertStrongPassword(STRONG)).not.toThrow(); });
  it('rejects short / missing-class passwords', () => {
    for (const w of ['short1!A', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoNumbers!!!!', 'NoSpecial12345'])
      expect(() => assertStrongPassword(w)).toThrow();
  });
});

describe('registration', () => {
  const build = () => { const f = makeFakes(); const v = new VerificationService(f.prisma as never, f.mail as never, f.tokens as never); return { f, svc: new AuthService(f.prisma as never, f.tokens as never, f.mail as never, v) }; };

  it('creates a fully-initialised, verification-pending account', async () => {
    const { f, svc } = build();
    const res = await svc.register({ handle: 'John', name: 'John', email: 'John@Mail.com', password: STRONG } as never);
    expect(res.userId).toBeTruthy();
    const u = f.prisma.user.rows[0];
    expect(u.handle).toBe('john');           // lowercased
    expect(u.email).toBe('john@mail.com');   // lowercased
    expect(u.emailVerified).toBe(false);
    expect(f.prisma.foodPref.rows.length).toBe(1);          // master init
    expect(f.prisma.verificationToken.rows.length).toBe(1); // verification sent
  });
  it('rejects a weak password', async () => {
    const { svc } = build();
    await expect(svc.register({ handle: 'jane', name: 'Jane', email: 'j@e.com', password: 'weak' } as never)).rejects.toThrow();
  });
  it('rejects a duplicate handle', async () => {
    const { svc } = build();
    await svc.register({ handle: 'dup', name: 'A', email: 'a@e.com', password: STRONG } as never);
    await expect(svc.register({ handle: 'dup', name: 'B', email: 'b@e.com', password: STRONG } as never)).rejects.toThrow(/handle/i);
  });
  it('rejects a duplicate email', async () => {
    const { svc } = build();
    await svc.register({ handle: 'a1', name: 'A', email: 'same@e.com', password: STRONG } as never);
    await expect(svc.register({ handle: 'a2', name: 'B', email: 'same@e.com', password: STRONG } as never)).rejects.toThrow(/email/i);
  });
  it('reports handle availability + suggestions', async () => {
    const { f, svc } = build();
    f.prisma.user.rows.push({ id: 'x', handle: 'taken' });
    expect((await svc.handleAvailable('freeone')).available).toBe(true);
    const taken = await svc.handleAvailable('taken');
    expect(taken.available).toBe(false);
    expect(taken.suggestions.length).toBeGreaterThan(0);
    expect((await svc.handleAvailable('ab')).valid).toBe(false);
  });
  it('validates email availability + format', async () => {
    const { f, svc } = build();
    f.prisma.user.rows.push({ id: 'x', email: 'used@e.com' });
    expect((await svc.emailAvailable('new@e.com')).available).toBe(true);
    expect((await svc.emailAvailable('used@e.com')).available).toBe(false);
    expect((await svc.emailAvailable('bad')).valid).toBe(false);
  });
});

describe('email verification', () => {
  it('verifies a valid token, signs in, and is idempotent-safe', async () => {
    const f = makeFakes();
    const v = new VerificationService(f.prisma as never, f.mail as never, f.tokens as never);
    f.prisma.user.rows.push({ id: 'u1', handle: 'u', email: 'u@e.com', name: 'U', emailVerified: false });
    await v.send('u1');
    const raw = f.mail.lastBody.match(/token=([a-f0-9]+)/)![1];
    const res = await v.verify(raw);
    expect(res.ok).toBe(true);
    expect(res.accessToken).toBeTruthy();
    expect(f.prisma.user.rows[0].emailVerified).toBe(true);
    await expect(v.verify(raw)).rejects.toThrow(/invalid|used/i); // reuse blocked
  });
  it('rejects an unknown token', async () => {
    const f = makeFakes();
    const v = new VerificationService(f.prisma as never, f.mail as never, f.tokens as never);
    await expect(v.verify('deadbeef')).rejects.toThrow();
  });
});

describe('account recovery (OTP)', () => {
  const build = () => { const f = makeFakes(); return { f, svc: new RecoveryService(f.prisma as never, f.mail as never, f.tokens as never) }; };

  it('is anti-enumeration: returns a token whether or not the account exists', async () => {
    const { f, svc } = build();
    f.prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: 'x' });
    const hit = await svc.request('sam@e.com', 'email');
    const miss = await svc.request('nobody@e.com', 'email');
    expect(hit.recoveryToken).toBeTruthy();
    expect(miss.recoveryToken).toBeTruthy();
    expect(hit.message).toBe(miss.message);
    expect(f.prisma.recoveryCode.rows.length).toBe(1); // only the real one stored
  });

  it('verifies a correct OTP → resetToken, and resets the password + revokes sessions', async () => {
    const { f, svc } = build();
    const argon2 = await import('argon2');
    f.prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: await argon2.hash('OldPassw0rd!!') });
    const { recoveryToken } = await svc.request('sam@e.com', 'email');
    const otp = otpFrom(f.mail.lastBody);
    const { resetToken } = await svc.verify(recoveryToken, otp);
    expect(resetToken).toBeTruthy();
    const out = await svc.reset(resetToken, STRONG);
    expect(out.ok).toBe(true);
    expect(f.tokens.revokedAll).toContain('u1');           // signed out everywhere
    expect(await argon2.verify(f.prisma.user.rows[0].passwordHash as string, STRONG)).toBe(true);
  });

  it('locks after 5 wrong attempts', async () => {
    const { f, svc } = build();
    f.prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: 'x' });
    const { recoveryToken } = await svc.request('sam@e.com', 'email');
    for (let i = 0; i < 4; i++) await expect(svc.verify(recoveryToken, '000000')).rejects.toThrow(/incorrect/i);
    await expect(svc.verify(recoveryToken, '000000')).rejects.toThrow(/locked/i);
    // even the correct code is now locked out
    await expect(svc.verify(recoveryToken, otpFrom(f.mail.lastBody))).rejects.toThrow(/locked/i);
  });

  it('enforces the resend limit (3)', async () => {
    const { f, svc } = build();
    f.prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: 'x' });
    const { recoveryToken } = await svc.request('sam@e.com', 'email');
    for (let i = 0; i < 3; i++) await svc.resend(recoveryToken);
    await expect(svc.resend(recoveryToken)).rejects.toThrow(/too many/i);
  });

  it('reset rejects a weak or reused password', async () => {
    const { f, svc } = build();
    const argon2 = await import('argon2');
    f.prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: await argon2.hash(STRONG) });
    const { recoveryToken } = await svc.request('sam@e.com', 'email');
    const { resetToken } = await svc.verify(recoveryToken, otpFrom(f.mail.lastBody));
    await expect(svc.reset(resetToken, 'weak')).rejects.toThrow();          // policy
    await expect(svc.reset(resetToken, STRONG)).rejects.toThrow(/before/i); // same as current
  });
});

/* AuthService.forgot/reset — the 6-digit code flow behind the "Forgot password?" tab. */
describe('forgot / reset (recovery code)', () => {
  class ResetTable {
    rows: Row[] = [];
    private seq = 1;
    create({ data }: { data: Row }) { const r = { id: `pr_${this.seq++}`, usedAt: null, createdAt: new Date(), ...data }; this.rows.push(r); return Promise.resolve(r); }
    findFirst({ where }: { where: Row }) {
      const now = Date.now();
      const exp = where.expiresAt as { gt?: Date } | undefined;
      const found = this.rows
        .filter((r) => r.userId === where.userId && r.code === where.code && r.usedAt == null && (!exp?.gt || new Date(r.expiresAt as Date).getTime() > now))
        .sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime())[0];
      return Promise.resolve(found ?? null);
    }
    update({ where, data }: { where: Row; data: Row }) { const r = this.rows.find((x) => x.id === where.id)!; Object.assign(r, data); return Promise.resolve(r); }
  }
  const build = (configured = true) => {
    const prisma = { user: new Table(), passwordReset: new ResetTable() };
    const mail = { lastBody: '', deliverSystem: (_u: string, r: { body: string }) => { (mail as { lastBody: string }).lastBody = r.body; return Promise.resolve({}); }, deliveryConfigured: () => configured };
    const tokens = { revokedAll: [] as string[], revokeAll: (id: string) => { tokens.revokedAll.push(id); return Promise.resolve(); } };
    const svc = new AuthService(prisma as never, tokens as never, mail as never, {} as never);
    return { prisma, mail, tokens, svc };
  };

  it('lets a user who recovered by PHONE actually reset by phone (regression)', async () => {
    const { prisma, mail, svc } = build();
    const argon2 = await import('argon2');
    prisma.user.rows.push({ id: 'u1', handle: 'priya', email: 'priya@e.com', phone: '+15551234567', passwordHash: await argon2.hash('OldPassw0rd!!') });
    const out = await svc.forgot({ identifier: '+15551234567', channel: 'sms' } as never);
    expect(out.delivery).toBe('live');
    const code = otpFrom(mail.lastBody);
    expect(code).toHaveLength(6);
    const done = await svc.reset({ identifier: '+15551234567', code, newPassword: STRONG } as never);
    expect(done.ok).toBe(true);
    expect(await argon2.verify(prisma.user.rows[0].passwordHash as string, STRONG)).toBe(true);
  });

  it('reports delivery:"unconfigured" when no messaging provider is wired', async () => {
    const { prisma, svc } = build(false);
    prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: 'x' });
    const out = await svc.forgot({ identifier: 'sam@e.com', channel: 'email' } as never);
    expect(out.delivery).toBe('unconfigured');
  });

  it('is anti-enumeration and rejects a wrong/expired code the same way', async () => {
    const { prisma, svc } = build();
    prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: 'x' });
    // Unknown account still returns sent:true (no leak).
    const miss = await svc.forgot({ identifier: 'nobody@e.com', channel: 'email' } as never);
    expect(miss.sent).toBe(true);
    // Wrong code → rejected.
    await expect(svc.reset({ identifier: 'sam@e.com', code: '000000', newPassword: STRONG } as never)).rejects.toThrow(/invalid or has expired/i);
  });

  it('reset enforces the password policy (no weak-password backdoor)', async () => {
    const { prisma, mail, svc } = build();
    prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: 'x' });
    await svc.forgot({ identifier: 'sam@e.com', channel: 'email' } as never);
    const code = otpFrom(mail.lastBody);
    await expect(svc.reset({ identifier: 'sam@e.com', code, newPassword: 'weak' } as never)).rejects.toThrow();
  });
});
