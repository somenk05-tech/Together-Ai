/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
/**
 * ── A STALE TOKEN CLOSES THE SESSION (launch gate, third reading, 5 Sep) ──
 *
 * Two gaps in refresh rotation. A refresh token that had been rotated away
 * and was presented again outside the grace window got 'Invalid refresh
 * token' and nothing else — the session the thief had already advanced
 * stayed live. And every refresh extended the row by a full refreshTtl, so a
 * session slid forever as long as it was touched once in sixty days.
 *
 * Now: the refresh token names its session (`sid`); a late replay of a
 * rotated-away token revokes that session for both holders; and a row older
 * than the absolute ceiling (90 days from sign-in by default) is refused and
 * revoked however recently it refreshed.
 */
import { TokenService, TokenPair } from './token.service';

type Row = { id: string; tokenHash: string; revoked: boolean; expiresAt: Date; userId: string; createdAt: Date };

function build(opts: { absolute?: number } = {}) {
  const svc = Object.create(TokenService.prototype) as TokenService;
  (svc as any).recentlyRotated = new Map();
  (svc as any).logger = { warn: () => undefined, log: () => undefined };
  let counter = 0;
  const rows: Row[] = [];
  const claims = new Map<string, Record<string, unknown>>();
  (svc as any).jwt = {
    signAsync: async (payload: Record<string, unknown>) => { const t = `tok-${counter++}`; claims.set(t, payload); return t; },
    verifyAsync: async (t: string) => claims.get(t) ?? { sub: 'u1', handle: 'asha' },
  };
  (svc as any).config = { get: (k: string) => ({ 'jwt.accessSecret': 'a', 'jwt.refreshSecret': 'r', 'jwt.accessTtl': 900, 'jwt.refreshTtl': 5184000, 'jwt.refreshAbsoluteTtl': opts.absolute } as Record<string, unknown>)[k] };
  (svc as any).prisma = {
    refreshToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
      create: async ({ data }: { data: Row }) => { rows.push({ ...data, revoked: false, createdAt: new Date() }); return data; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = rows.find((x) => x.id === where.id)!; Object.assign(r, data); return r;
      },
      updateMany: async ({ where, data }: { where: { id?: string; userId?: string }; data: Partial<Row> }) => {
        const hit = rows.filter((r) => (!where.id || r.id === where.id) && (!where.userId || r.userId === where.userId));
        hit.forEach((r) => Object.assign(r, data)); return { count: hit.length };
      },
    },
    user: { updateMany: async () => ({ count: 1 }) },
    deviceToken: { deleteMany: async () => ({ count: 0 }) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const expireGrace = () => { for (const v of ((svc as any).recentlyRotated as Map<string, { until: number }>).values()) v.until = Date.now() - 1; };
  return { svc, rows, claims, expireGrace };
}

describe('the refresh token names its session', () => {
  it('sid on the refresh claim equals the row id; the access token carries no sid', async () => {
    const { svc, rows, claims } = build();
    const pair: TokenPair = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    expect(claims.get(pair.refreshToken)?.sid).toBe(rows[0].id);
    expect(claims.get(pair.accessToken)?.sid).toBeUndefined();
  });
});

describe('reuse detection', () => {
  it('a late replay of a rotated-away token revokes the session — the winner’s token dies with it', async () => {
    const { svc, rows, expireGrace } = build();
    const first = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    const winner = await svc.rotate(first.refreshToken);
    expireGrace();
    await expect(svc.rotate(first.refreshToken)).rejects.toThrow('Invalid refresh token');
    expect(rows[0].revoked).toBe(true);
    await expect(svc.rotate(winner.refreshToken)).rejects.toThrow('Invalid refresh token');
  });

  it('the honest replay inside the window still gets the same pair', async () => {
    const { svc, rows } = build();
    const first = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    const winner = await svc.rotate(first.refreshToken);
    expect(await svc.rotate(first.refreshToken)).toEqual(winner);
    expect(rows[0].revoked).toBe(false);
  });

  it('a signed token that names another citizen’s session revokes nothing', async () => {
    const { svc, rows, claims, expireGrace } = build();
    const mine = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    const theirs = await svc.issuePair({ sub: 'u2', handle: 'ravi' });
    await svc.rotate(mine.refreshToken);
    expireGrace();
    // forge a claim: u1's stale token but naming u2's session
    claims.set(mine.refreshToken, { sub: 'u1', handle: 'asha', sid: rows[1].id });
    await expect(svc.rotate(mine.refreshToken)).rejects.toThrow();
    expect(rows[1].revoked).toBe(false);
    void theirs;
  });
});

describe('the absolute ceiling', () => {
  it('a row older than the ceiling is refused and revoked, however fresh its last refresh', async () => {
    const { svc, rows } = build({ absolute: 86_400 });
    const first = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    rows[0].createdAt = new Date(Date.now() - 2 * 86_400_000);
    rows[0].expiresAt = new Date(Date.now() + 5_000_000_000);
    await expect(svc.rotate(first.refreshToken)).rejects.toThrow('Invalid refresh token');
    expect(rows[0].revoked).toBe(true);
  });

  it('inside the ceiling the rotation goes through', async () => {
    const { svc, rows } = build({ absolute: 86_400 });
    const first = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    rows[0].createdAt = new Date(Date.now() - 3_600_000);
    await expect(svc.rotate(first.refreshToken)).resolves.toBeDefined();
  });

  it('the default is ninety days and it cannot be set below a day', () => {
    const { svc } = build({ absolute: 60 });
    expect((svc as any).absoluteTtl()).toBe(90 * 86_400);
  });
});
