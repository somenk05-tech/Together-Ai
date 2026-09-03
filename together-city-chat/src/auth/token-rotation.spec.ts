/**
 * Refresh-token rotation under concurrency — the "kicked out mid-use" defect.
 *
 * Rotation is single-use: the session row's hash is replaced in place. Correct
 * against theft, but two honest holders of the same token exist all the time —
 * a second browser tab, a retry after a lost response, hydrate racing a 401
 * interceptor. Before the grace window, the second caller got 'Invalid refresh
 * token' and the client signed the citizen out of a perfectly live session.
 *
 * The contract: a token rotated away moments ago is answered with the SAME new
 * pair the winner got (idempotent replay), for ROTATION_GRACE_MS. After the
 * window — or after any revocation — it is dead, exactly as before.
 */
import { TokenService, TokenPair } from './token.service';

type Row = { id: string; tokenHash: string; revoked: boolean; expiresAt: Date; userId: string };

function build() {
  const svc = Object.create(TokenService.prototype) as TokenService;
  // Object.create skips the constructor, so class-field initializers never ran.
  (svc as any).recentlyRotated = new Map();
  let counter = 0;
  const rows: Row[] = [];
  (svc as any).jwt = {
    signAsync: async () => `tok-${counter++}`,
    verifyAsync: async () => ({ sub: 'u1', handle: 'asha' }),
  };
  (svc as any).config = { get: (k: string) => ({ 'jwt.accessSecret': 'a', 'jwt.refreshSecret': 'r', 'jwt.accessTtl': 900, 'jwt.refreshTtl': 5184000 } as Record<string, unknown>)[k] };
  (svc as any).prisma = {
    refreshToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
      create: async ({ data }: { data: Row }) => { rows.push({ ...data, id: `s${rows.length}`, revoked: false }); return data; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = rows.find((x) => x.id === where.id)!; Object.assign(r, data); return r;
      },
      updateMany: async ({ data }: { data: Partial<Row> }) => { rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
    },
    // revokeAll also stamps User.sessionsRevokedAt, so that an ACCESS token
    // issued before the sign-out stops working too — see session-revocation.spec.
    // Both writes go in one transaction, so the fake has to model both.
    user: { updateMany: async () => ({ count: 1 }) },
    // ...and drops the account's push subscriptions, which is the third write
    // in that transaction (see session-revocation.spec).
    deviceToken: { deleteMany: async () => ({ count: 0 }) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { svc, rows };
}

describe('refresh rotation grace', () => {
  it('a replayed rotation inside the grace window gets the SAME pair, not a sign-out', async () => {
    const { svc } = build();
    const first: TokenPair = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    const winner = await svc.rotate(first.refreshToken);
    // Second honest holder (other tab / retry) presents the OLD token:
    const replay = await svc.rotate(first.refreshToken);
    expect(replay).toEqual(winner);
  });

  it('outside the grace window the old token is dead', async () => {
    const { svc } = build();
    const first = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    await svc.rotate(first.refreshToken);
    // Age the grace entry past its window instead of sleeping.
    const graceMap = (svc as any).recentlyRotated as Map<string, { pair: TokenPair; until: number }>;
    for (const v of graceMap.values()) v.until = Date.now() - 1;
    await expect(svc.rotate(first.refreshToken)).rejects.toThrow('Invalid refresh token');
  });

  it('any revocation slams the grace window shut', async () => {
    const { svc } = build();
    const first = await svc.issuePair({ sub: 'u1', handle: 'asha' });
    const winner = await svc.rotate(first.refreshToken);
    await svc.revokeAll('u1');
    await expect(svc.rotate(first.refreshToken)).rejects.toThrow('Invalid refresh token');
    void winner;
  });

  it('a token never seen is rejected as before', async () => {
    const { svc } = build();
    await svc.issuePair({ sub: 'u1', handle: 'asha' });
    await expect(svc.rotate('made-up-token')).rejects.toThrow();
  });
});
