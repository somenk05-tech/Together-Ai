import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { InboundSecretGuard } from './inbound-secret.guard';

/**
 * THE ONLY THING BETWEEN A PUBLIC WRITE AND A STRANGER.
 *
 * POST /api/mail/inbound is the one route in this API that mutates without a
 * JWT — a mail provider has no session and cannot mint one — so it writes into a
 * named citizen's mailbox on the strength of this guard alone.
 *
 * The version this replaces did the check inside MailService.ingestInbound and
 * refused only when NODE_ENV was 'production'. That is an open mail-injection
 * endpoint on every preview and staging deploy, all of them on public URLs, and
 * it is invisible to route-inventory.ts — which reads controllers to answer
 * "what is reachable without a token" and cannot see into a service.
 */
const ctxWith = (opts: { query?: Record<string, unknown>; headers?: Record<string, unknown> }) => ({
  switchToHttp: () => ({ getRequest: () => ({ query: opts.query ?? {}, headers: opts.headers ?? {} }) }),
}) as unknown as ExecutionContext;

describe('InboundSecretGuard', () => {
  const saved = { ...process.env };
  let guard: InboundSecretGuard;

  beforeEach(() => {
    guard = new InboundSecretGuard();
    delete process.env.RESEND_INBOUND_SECRET;
    delete process.env.ALLOW_UNSIGNED_INBOUND;
    delete process.env.NODE_ENV;
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(guard['logger'], 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { process.env = saved; });

  it('accepts the secret on the query string', () => {
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    expect(guard.canActivate(ctxWith({ query: { secret: 'a-long-random-string' } }))).toBe(true);
  });

  it('accepts the secret as a bearer token, case-insensitively', () => {
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    expect(guard.canActivate(ctxWith({ headers: { authorization: 'Bearer a-long-random-string' } }))).toBe(true);
    expect(guard.canActivate(ctxWith({ headers: { authorization: 'bearer a-long-random-string' } }))).toBe(true);
  });

  it('refuses a wrong secret, and a missing one', () => {
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    expect(() => guard.canActivate(ctxWith({ query: { secret: 'nope' } }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctxWith({}))).toThrow(ForbiddenException);
    // A prefix must not pass: timingSafeEqualStr compares length first.
    expect(() => guard.canActivate(ctxWith({ query: { secret: 'a-long-random-strin' } }))).toThrow(ForbiddenException);
  });

  it('refuses everything when no secret is configured — in EVERY environment', () => {
    // This is the change. The old check refused only in production, which left
    // every preview deploy accepting mail injection from anyone.
    for (const env of ['production', 'staging', 'development', undefined]) {
      if (env) process.env.NODE_ENV = env; else delete process.env.NODE_ENV;
      expect(() => guard.canActivate(ctxWith({ query: { secret: 'anything' } }))).toThrow(ForbiddenException);
    }
  });

  it('allows unsigned inbound only when explicitly opted in, and never in production', () => {
    process.env.ALLOW_UNSIGNED_INBOUND = 'true';
    process.env.NODE_ENV = 'development';
    expect(guard.canActivate(ctxWith({}))).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(() => guard.canActivate(ctxWith({}))).toThrow(ForbiddenException);
  });

  it('ignores a non-string secret on the query string', () => {
    // ?secret=a&secret=b arrives as an array; it must not be coerced into a
    // comparison that could accidentally match.
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    expect(() => guard.canActivate(ctxWith({ query: { secret: ['a-long-random-string'] } }))).toThrow(ForbiddenException);
  });
});
