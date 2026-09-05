/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
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
    delete process.env.ALLOW_INBOUND_SECRET_IN_URL;
    delete process.env.NODE_ENV;
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(guard['logger'], 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { process.env = saved; });

  it('refuses the right secret on the query string, because a URL is written down everywhere', () => {
    // The platform's access log, every proxy in front of it, the error
    // tracker's breadcrumbs, and the browser history of whoever opened the URL
    // to check it. This credential writes into any named citizen's inbox.
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    expect(() => guard.canActivate(ctxWith({ query: { secret: 'a-long-random-string' } }))).toThrow(ForbiddenException);
  });

  it('still takes it from the URL when a deployment opts in, so nobody is cut off mid-migration', () => {
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    process.env.ALLOW_INBOUND_SECRET_IN_URL = 'true';
    expect(guard.canActivate(ctxWith({ query: { secret: 'a-long-random-string' } }))).toBe(true);
    // ...and it is not a quiet allowance.
    expect(guard['logger'].warn).toHaveBeenCalled();
  });

  it('says in the LOG that the secret was right and the channel was wrong, and not in the response', () => {
    // Otherwise this is an outage with no visible cause: inbound mail stops
    // and every log line says only "invalid secret", which is the one thing
    // that is not the problem.
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    let thrown: unknown;
    try { guard.canActivate(ctxWith({ query: { secret: 'a-long-random-string' } })); } catch (e) { thrown = e; }
    expect((thrown as ForbiddenException).message).toBe('invalid inbound secret');
    expect(guard['logger'].error).toHaveBeenCalledWith(expect.stringContaining('query string'));
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
    process.env.ALLOW_INBOUND_SECRET_IN_URL = 'true';
    expect(() => guard.canActivate(ctxWith({ query: { secret: ['a-long-random-string'] } }))).toThrow(ForbiddenException);
  });

  it('does not let the opt-in weaken the comparison itself', () => {
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    process.env.ALLOW_INBOUND_SECRET_IN_URL = 'true';
    expect(() => guard.canActivate(ctxWith({ query: { secret: 'a-long-random-strin' } }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctxWith({ query: { secret: '' } }))).toThrow(ForbiddenException);
  });

  it('takes the bearer header whether or not the URL form is allowed', () => {
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    expect(guard.canActivate(ctxWith({ headers: { authorization: 'Bearer a-long-random-string' } }))).toBe(true);
    process.env.ALLOW_INBOUND_SECRET_IN_URL = 'true';
    expect(guard.canActivate(ctxWith({ headers: { authorization: 'Bearer a-long-random-string' } }))).toBe(true);
  });
});

/**
 * ── THE PROVIDER'S OWN SIGNATURE (launch gate, third reading, 4 Sep) ──────
 *
 * Resend configures a webhook as a URL and signs each delivery the Svix way
 * — it cannot set an Authorization header. With `?secret=` refused by
 * default and only the bearer form open, the first deploy would have stopped
 * inbound mail. The guard now verifies the Svix signature over the raw body
 * with RESEND_WEBHOOK_SECRET, and falls through to the shared-secret forms
 * only when no signature headers are present.
 */
import { createHmac } from 'crypto';
import { verifySvixSignature } from './inbound-secret.guard';

const WHSEC = `whsec_${Buffer.from('a-signing-key-of-thirty-two-bytes!!').toString('base64')}`;
const KEY = Buffer.from('a-signing-key-of-thirty-two-bytes!!');
const sign = (id: string, ts: string, body: string) => createHmac('sha256', KEY).update(`${id}.${ts}.${body}`).digest('base64');

const svixCtx = (opts: { body: string; headers: Record<string, string>; rawBody?: boolean }) => ({
  switchToHttp: () => ({ getRequest: () => ({ query: {}, headers: opts.headers, rawBody: opts.rawBody === false ? undefined : Buffer.from(opts.body) }) }),
}) as unknown as ExecutionContext;

describe('the provider’s own signature', () => {
  const saved = { ...process.env };
  let guard: InboundSecretGuard;
  const body = '{"type":"email.received","data":{"email_id":"e1"}}';
  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    guard = new InboundSecretGuard();
    process.env.RESEND_WEBHOOK_SECRET = WHSEC;
    delete process.env.RESEND_INBOUND_SECRET;
    delete process.env.ALLOW_INBOUND_SECRET_IN_URL;
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(guard['logger'], 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { process.env = saved; });

  it('accepts a request Resend signed, over the raw body', () => {
    const ts = String(now);
    const headers = { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': `v1,${sign('msg_1', ts, body)}` };
    expect(guard.canActivate(svixCtx({ body, headers }))).toBe(true);
  });

  it('any one of several signatures matching is enough — a rotated secret sends two', () => {
    const ts = String(now);
    const headers = { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': `v1,${Buffer.from('nope').toString('base64')} v1,${sign('msg_1', ts, body)}` };
    expect(guard.canActivate(svixCtx({ body, headers }))).toBe(true);
  });

  it('refuses a body that is not the one signed, a stale timestamp, and a wrong key', () => {
    const ts = String(now);
    const good = `v1,${sign('msg_1', ts, body)}`;
    expect(() => guard.canActivate(svixCtx({ body: body.replace('e1', 'e2'), headers: { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': good } }))).toThrow(ForbiddenException);
    const old = String(now - 6 * 60);
    expect(() => guard.canActivate(svixCtx({ body, headers: { 'svix-id': 'msg_1', 'svix-timestamp': old, 'svix-signature': `v1,${sign('msg_1', old, body)}` } }))).toThrow(ForbiddenException);
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('some-other-key-entirely-here-1234').toString('base64')}`;
    expect(() => guard.canActivate(svixCtx({ body, headers: { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': good } }))).toThrow(ForbiddenException);
  });

  it('refuses when the raw body was not captured — a re-serialised body is not what was signed', () => {
    const ts = String(now);
    const headers = { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': `v1,${sign('msg_1', ts, body)}` };
    expect(() => guard.canActivate(svixCtx({ body, headers, rawBody: false }))).toThrow(ForbiddenException);
    expect(verifySvixSignature(WHSEC, { id: 'a', timestamp: ts, signature: 'v1,x' }, undefined)).toMatchObject({ ok: false, why: expect.stringMatching(/raw body/) });
  });

  it('with no signature headers, a bearer secret still works — a hand-configured relay', () => {
    process.env.RESEND_INBOUND_SECRET = 'a-long-random-string';
    expect(guard.canActivate(ctxWith({ headers: { authorization: 'Bearer a-long-random-string' } }))).toBe(true);
    // And nothing at all is still refused.
    expect(() => guard.canActivate(ctxWith({}))).toThrow(ForbiddenException);
  });

  it('main.ts keeps the raw bytes for this route', () => {
    const main = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.ts'), 'utf8');
    expect(main).toMatch(/json\(\{ limit: '32mb', verify: \(req, _res, buf\) => \{ \(req as unknown as \{ rawBody\?: Buffer \}\)\.rawBody = buf; \} \}\)/);
  });
});
