import { AuthService } from './auth.service';
import { assertStrongPassword } from './password-policy';

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
  // Both dispatch methods, because the difference between them is now load-
  // bearing: deliverSystem files a copy in the citizen's in-app inbox, deliverTo
  // does not, and secrets must use deliverTo. `lastTo` records which one carried
  // what, so a change that quietly moves a code back into the inbox fails here.
  const mail = {
    lastBody: '',
    lastVia: '' as '' | 'system' | 'to',
    lastTo: '' as string,
    deliverSystem: (_u: string, r: { body: string }) => {
      Object.assign(mail, { lastBody: r.body, lastVia: 'system', lastTo: '' });
      return Promise.resolve({});
    },
    deliverTo: (_u: string, _c: string, target: string, r: { body: string }) => {
      Object.assign(mail, { lastBody: r.body, lastVia: 'to', lastTo: target });
      return Promise.resolve({ ok: true, provider: 'fake', status: 'queued' });
    },
    deliveryConfigured: () => true,
  };
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
  const build = () => { const f = makeFakes(); return { f, svc: new AuthService(f.prisma as never, f.tokens as never, f.mail as never) }; };

  it('creates a fully-initialised, verification-pending account', async () => {
    const { f, svc } = build();
    const res = await svc.register({ handle: 'John', name: 'John', email: 'John@Mail.com', password: STRONG } as never);
    expect(res.userId).toBeTruthy();
    const u = f.prisma.user.rows[0];
    expect(u.handle).toBe('john');           // lowercased
    expect(u.email).toBe('john@mail.com');   // lowercased
    expect(u.emailVerified).toBe(false);
    expect(f.prisma.foodPref.rows.length).toBe(1);          // master init
    // Registration deliberately mints NO verification token. Sign-up finishes on
    // the six-digit code screen; the 24-hour link flow was removed because its
    // email was filed in the citizen's in-app inbox, where any session holder
    // could click it.
    expect(f.prisma.verificationToken.rows.length).toBe(0);
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


/* AuthService.forgot/reset — the 6-digit code flow behind the "Forgot password?" tab. */
describe('forgot / reset (recovery code)', () => {
  /**
   * Stand-in for the PasswordReset table.
   *
   * This double had drifted behind the service in three separate ways at once,
   * and each one hid the next: forgot() called updateMany(), which did not
   * exist; reset() stopped passing `code` to findFirst() once codes were stored
   * argon2-hashed, so matching on code equality could never hit; and the
   * attempt counter is written as Prisma's atomic `{ increment: 1 }`, which a
   * plain Object.assign would store as an object and silently break the lockout.
   *
   * Kept deliberately close to the real query shapes rather than convenient
   * ones — a double that only answers the questions the tests happen to ask is
   * how all three of these got through.
   */
  class ResetTable {
    rows: Row[] = [];
    private seq = 1;

    create({ data }: { data: Row }) {
      const r = { id: `pr_${this.seq++}`, usedAt: null, attempts: 0, createdAt: new Date(), ...data };
      this.rows.push(r);
      return Promise.resolve(r);
    }

    /** The service asks for the NEWEST live code for a citizen — no code in the
     *  filter, because it is hashed and has to be verified rather than matched. */
    findFirst({ where }: { where: Row }) {
      const now = Date.now();
      const exp = where.expiresAt as { gt?: Date } | undefined;
      const found = this.rows
        .filter((r) =>
          r.userId === where.userId
          && (where.usedAt !== null || r.usedAt == null)
          && (!exp?.gt || new Date(r.expiresAt as Date).getTime() > now))
        .sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime())[0];
      return Promise.resolve(found ?? null);
    }

    update({ where, data }: { where: Row; data: Row }) {
      const r = this.rows.find((x) => x.id === where.id)!;
      Object.assign(r, ResetTable.applyOps(r, data));
      return Promise.resolve(r);
    }

    /** Retiring every outstanding code the moment a new one is requested. Runs
     *  BEFORE the new row is created, so the fresh code is never caught by it. */
    updateMany({ where, data }: { where: Row; data: Row }) {
      const matches = this.rows.filter((r) =>
        r.userId === where.userId && (where.usedAt === null ? r.usedAt == null : true));
      for (const r of matches) Object.assign(r, ResetTable.applyOps(r, data));
      return Promise.resolve({ count: matches.length });
    }

    /** Resolve Prisma's atomic number operators against the current row. */
    private static applyOps(row: Row, data: Row): Row {
      const out: Row = {};
      for (const [k, v] of Object.entries(data)) {
        const inc = (v as { increment?: number } | null)?.increment;
        out[k] = typeof inc === 'number' ? ((row[k] as number) ?? 0) + inc : v;
      }
      return out;
    }
  }

  const build = (configured = true) => {
    const prisma = { user: new Table(), passwordReset: new ResetTable() };
    // deliverTo alongside deliverSystem, and lastVia records which one ran. The
    // recovery code MUST go via deliverTo: deliverSystem files a copy in the
    // citizen's in-app inbox, which is readable by anyone holding a session, and
    // a reset code readable from inside a session is an account takeover.
    const mail = {
      lastBody: '',
      lastVia: '' as '' | 'system' | 'to',
      lastTo: '',
      deliverSystem: (_u: string, r: { body: string }) => {
        Object.assign(mail, { lastBody: r.body, lastVia: 'system', lastTo: '' });
        return Promise.resolve({});
      },
      deliverTo: (_u: string, _c: string, target: string, r: { body: string }) => {
        Object.assign(mail, { lastBody: r.body, lastVia: 'to', lastTo: target });
        return Promise.resolve({ ok: true, provider: 'fake', status: 'queued' });
      },
      deliveryConfigured: () => configured,
    };
    const tokens = { revokedAll: [] as string[], revokeAll: (id: string) => { tokens.revokedAll.push(id); return Promise.resolve(); } };
    const svc = new AuthService(prisma as never, tokens as never, mail as never);
    return { prisma, mail, tokens, svc };
  };

  it('never files the recovery code in the in-app inbox', async () => {
    // The regression that mattered. deliverSystem writes a copy into the
    // citizen's own Together City inbox; a reset code sitting there can be read
    // by anyone holding a session and used to take the account over. If someone
    // switches this back to deliverSystem for convenience, this fails.
    const { prisma, mail, svc } = build();
    const argon2 = await import('argon2');
    prisma.user.rows.push({ id: 'u9', handle: 'ash', email: 'ash@e.com', passwordHash: await argon2.hash('OldPassw0rd!!') });
    await svc.forgot({ identifier: 'ash@e.com', channel: 'email' } as never);
    expect(mail.lastVia).toBe('to');
    expect(mail.lastTo).toBe('ash@e.com');
    expect(mail.lastBody).toMatch(/\b\d{6}\b/); // it really was the code
  });

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

  it('retires every outstanding code as soon as a new one is requested', async () => {
    // A code read over someone's shoulder, or left sitting in an old inbox,
    // must stop working the moment the citizen asks for another. This rule was
    // shipped with no coverage at all, which is how it broke the suite unnoticed.
    const { prisma, mail, svc } = build();
    const argon2 = await import('argon2');
    prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: await argon2.hash('OldPassw0rd!!') });

    await svc.forgot({ identifier: 'sam@e.com', channel: 'email' } as never);
    const stolen = otpFrom(mail.lastBody);

    await svc.forgot({ identifier: 'sam@e.com', channel: 'email' } as never);
    const current = otpFrom(mail.lastBody);
    expect(current).not.toBe(stolen);

    await expect(svc.reset({ identifier: 'sam@e.com', code: stolen, newPassword: STRONG } as never))
      .rejects.toThrow(/invalid or has expired/i);
    // ...and the code they actually hold still works.
    await expect(svc.reset({ identifier: 'sam@e.com', code: current, newPassword: STRONG } as never))
      .resolves.toMatchObject({ ok: true });
  });

  it('reset enforces the password policy (no weak-password backdoor)', async () => {
    const { prisma, mail, svc } = build();
    prisma.user.rows.push({ id: 'u1', handle: 'sam', email: 'sam@e.com', passwordHash: 'x' });
    await svc.forgot({ identifier: 'sam@e.com', channel: 'email' } as never);
    const code = otpFrom(mail.lastBody);
    await expect(svc.reset({ identifier: 'sam@e.com', code, newPassword: 'weak' } as never)).rejects.toThrow();
  });
});
