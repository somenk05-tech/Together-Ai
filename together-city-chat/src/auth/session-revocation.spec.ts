import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { TokenService } from './token.service';

/**
 * "YOU HAVE BEEN SIGNED OUT OF ALL SESSIONS" WAS TRUE FIFTEEN MINUTES LATE.
 *
 * Revoking sessions marked every RefreshToken revoked, which stops the next
 * silent refresh — and did nothing whatever to an ACCESS token already issued.
 * Those are signed, stateless and valid for their full TTL with no database in
 * the path. So after a password reset, whoever held a stolen access token kept
 * full read and write on the account, Medical vault included, for up to another
 * quarter of an hour, while the confirmation email said otherwise.
 *
 * JwtStrategy already re-read the user row on every request — it has since the
 * deleted-account fix — so the cutoff costs one more column on a query that was
 * already happening.
 */

type Row = { id: string; handle: string; deletedAt: Date | null; sessionsRevokedAt: Date | null };

function strategyOver(row: Row | null) {
  // Object.create skips the constructor, which would otherwise want a real
  // ConfigService and set up passport — neither is what `validate` does.
  const s = Object.create(JwtStrategy.prototype) as JwtStrategy;
  (s as unknown as { prisma: unknown }).prisma = {
    user: { findUnique: async () => row },
  };
  return s;
}

const at = (iso: string) => new Date(iso);
const iatOf = (iso: string) => Math.floor(at(iso).getTime() / 1000);

const live: Row = { id: 'u1', handle: 'asha', deletedAt: null, sessionsRevokedAt: null };

describe('an access token issued before a sign-out is refused', () => {
  it('accepts a token when the account has never revoked', async () => {
    const s = strategyOver(live);
    await expect(s.validate({ sub: 'u1', handle: 'asha', iat: iatOf('2026-08-04T09:00:00Z') }))
      .resolves.toEqual({ sub: 'u1', handle: 'asha' });
  });

  it('refuses a token minted BEFORE the revocation', async () => {
    const s = strategyOver({ ...live, sessionsRevokedAt: at('2026-08-04T10:00:00Z') });
    await expect(s.validate({ sub: 'u1', handle: 'asha', iat: iatOf('2026-08-04T09:59:59Z') }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a token minted AFTER it — signing back in must work', async () => {
    const s = strategyOver({ ...live, sessionsRevokedAt: at('2026-08-04T10:00:00Z') });
    await expect(s.validate({ sub: 'u1', handle: 'asha', iat: iatOf('2026-08-04T10:00:01Z') }))
      .resolves.toEqual({ sub: 'u1', handle: 'asha' });
  });

  it('accepts a token issued in the SAME second as the revocation', async () => {
    // `iat` is seconds and the cutoff is milliseconds. Comparing them raw makes
    // a token signed at 10:00:00.000 look older than a revocation at
    // 10:00:00.750, and a freshly-issued token would be refused on sight.
    const s = strategyOver({ ...live, sessionsRevokedAt: new Date(at('2026-08-04T10:00:00Z').getTime() + 750) });
    await expect(s.validate({ sub: 'u1', handle: 'asha', iat: iatOf('2026-08-04T10:00:00Z') }))
      .resolves.toEqual({ sub: 'u1', handle: 'asha' });
  });

  it('refuses a token with no iat, but only on an account that has revoked', async () => {
    // We sign every token ourselves and jsonwebtoken always stamps iat, so an
    // absent one means something unaccounted-for is presenting a token to an
    // account that asked to be signed out of everything. Fail closed.
    const revoked = strategyOver({ ...live, sessionsRevokedAt: at('2026-08-04T10:00:00Z') });
    await expect(revoked.validate({ sub: 'u1', handle: 'asha' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    // …and never on an account that has not: an iat-less token was fine
    // yesterday and this check is not the place to start refusing it.
    const never = strategyOver(live);
    await expect(never.validate({ sub: 'u1', handle: 'asha' }))
      .resolves.toEqual({ sub: 'u1', handle: 'asha' });
  });

  it('still refuses a deleted account and an unknown one', async () => {
    const gone = strategyOver({ ...live, deletedAt: at('2026-07-01T00:00:00Z') });
    await expect(gone.validate({ sub: 'u1', handle: 'asha', iat: iatOf('2026-08-04T09:00:00Z') })).rejects.toThrow();
    await expect(strategyOver(null).validate({ sub: 'u1', handle: 'asha', iat: 1 })).rejects.toThrow();
  });

  it('reads the handle from the row, not the token', async () => {
    const s = strategyOver({ ...live, handle: 'asha-new' });
    await expect(s.validate({ sub: 'u1', handle: 'asha-old', iat: iatOf('2026-08-04T09:00:00Z') }))
      .resolves.toEqual({ sub: 'u1', handle: 'asha-new' });
  });
});

describe('revokeAll writes the cutoff, in the same transaction', () => {
  function build() {
    const svc = Object.create(TokenService.prototype) as TokenService;
    (svc as unknown as { recentlyRotated: Map<string, unknown> }).recentlyRotated = new Map();
    const calls: string[] = [];
    let stamped: Date | null = null;
    let inTransaction = false;
    (svc as unknown as { prisma: unknown }).prisma = {
      refreshToken: { updateMany: async () => { calls.push('tokens'); return { count: 2 }; } },
      user: {
        updateMany: async ({ data }: { data: { sessionsRevokedAt: Date } }) => {
          calls.push('user'); stamped = data.sessionsRevokedAt; return { count: 1 };
        },
      },
      deviceToken: { deleteMany: async () => { calls.push('devices'); return { count: 3 }; } },
      $transaction: async (ops: Promise<unknown>[]) => { inTransaction = true; return Promise.all(ops); },
    };
    return { svc, calls, stamped: () => stamped, inTransaction: () => inTransaction };
  }

  it('revokes the refresh tokens AND stamps the account', async () => {
    const h = build();
    await h.svc.revokeAll('u1');
    expect(h.calls.sort()).toEqual(['devices', 'tokens', 'user']);
    expect(h.stamped()).toBeInstanceOf(Date);
  });

  it('and drops the push subscriptions, or the signed-out device keeps buzzing', async () => {
    /*
     * Push is keyed on the browser's push endpoint, not on a session, and the
     * send path never re-checks — so a stolen laptop kept receiving message
     * previews, dating pushes, invoice amounts and moderation verdicts after
     * "sign out everywhere" said it had been signed out. Account deletion went
     * the same way: it calls revokeAll on an already-scrubbed row, so
     * DeviceToken's cascade never fires.
     */
    const h = build();
    await h.svc.revokeAll('u1');
    expect(h.calls).toContain('devices');
    expect(h.inTransaction()).toBe(true);
  });

  it('does both in one transaction — a half-applied sign-out is the bug', async () => {
    const h = build();
    await h.svc.revokeAll('u1');
    expect(h.inTransaction()).toBe(true);
  });
});
