/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccountThrottlerGuard } from './account-throttler.guard';

/**
 * ── A LIMIT BELONGS TO A PERSON, NOT TO AN ADDRESS (fifth audit, 29 Aug) ────
 *
 * Every ceiling in this app — the global 120/minute and every `@Throttle` the
 * dating hub added on 28 Aug — was counted per `req.ip`, because that is what
 * the throttler's default tracker returns. It was wrong in both directions at
 * once: an office, a campus or an Indian mobile carrier is ONE bucket for
 * everybody behind it, and somebody with a proxy pool had no bucket at all —
 * which is precisely the person the report, like and upload ceilings exist to
 * stop.
 */
const tracker = (req: Record<string, unknown>) =>
  (new AccountThrottlerGuard({ throttlers: [] } as any, {} as any, {} as any) as any).getTracker(req);

describe('a rate limit is counted against the account', () => {
  it('keys on the JWT subject when there is one', async () => {
    await expect(tracker({ user: { sub: 'u1' }, ip: '1.2.3.4' })).resolves.toBe('u:u1');
  });

  it('gives two people behind one address two buckets', async () => {
    const a = await tracker({ user: { sub: 'u1' }, ip: '10.0.0.1' });
    const b = await tracker({ user: { sub: 'u2' }, ip: '10.0.0.1' });
    expect(a).not.toBe(b);
  });

  it('and one person on two addresses one bucket', async () => {
    const a = await tracker({ user: { sub: 'u1' }, ip: '10.0.0.1' });
    const b = await tracker({ user: { sub: 'u1' }, ip: '198.51.100.9' });
    expect(a).toBe(b);
  });

  it('falls back to the address where nobody has proved who they are', async () => {
    // Login, register, forgot — the routes an unauthenticated flood targets,
    // and the routes where per-address is the only honest answer.
    await expect(tracker({ ip: '1.2.3.4' })).resolves.toBe('ip:1.2.3.4');
    await expect(tracker({ user: {}, ip: '1.2.3.4' })).resolves.toBe('ip:1.2.3.4');
    await expect(tracker({ user: { sub: '' }, ip: '1.2.3.4' })).resolves.toBe('ip:1.2.3.4');
  });

  it('keeps the two namespaces apart, so an id can never inherit an address’s count', async () => {
    expect(await tracker({ user: { sub: '1.2.3.4' }, ip: '9.9.9.9' }))
      .not.toBe(await tracker({ ip: '1.2.3.4' }));
  });
});

describe('and the guards are ordered so that it can be', () => {
  const app = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');

  it('runs the throttler AFTER authentication, because `req.user` is what it reads', () => {
    // Nest runs APP_GUARDs in declaration order. Declared first, the tracker
    // would find no user on every request and silently key on the IP again —
    // the change would look landed and do nothing.
    expect(app.indexOf('useClass: JwtAuthGuard')).toBeLessThan(app.indexOf('useClass: AccountThrottlerGuard'));
  });

  it('and no longer registers the stock guard at all', () => {
    expect(app).not.toMatch(/useClass: ThrottlerGuard/);
  });
});

describe('the chat has ceilings of its own', () => {
  const messages = readFileSync(join(__dirname, '..', 'messages', 'messages.controller.ts'), 'utf8');
  const media = readFileSync(join(__dirname, '..', 'media', 'media.controller.ts'), 'utf8');

  it('sending is capped at the number the socket already used', () => {
    // The gateway's own comment claimed the HTTP path used the same number. It
    // did not: the socket was 60/minute and HTTP was the global 120, shared
    // with every read in the app.
    expect(messages).toMatch(/SEND_LIMIT = \{ default: \{ limit: 60, ttl: 60_000 \} \}/);
    expect(messages.slice(messages.indexOf("@Post('messages')"), messages.indexOf('send('))).toMatch(/@Throttle\(SEND_LIMIT\)/);
  });

  it('search is tighter, because of what it costs rather than what it does', () => {
    // `contains … insensitive` across every conversation the citizen is in,
    // with no index behind it.
    expect(messages).toMatch(/SEARCH_LIMIT = \{ default: \{ limit: 20/);
    expect(messages.slice(messages.indexOf("@Get('messages/search')"), messages.indexOf('search('))).toMatch(/@Throttle\(SEARCH_LIMIT\)/);
  });

  it('and a presign is a write into the bucket, so it has one too', () => {
    expect(media).toMatch(/@Throttle\(PRESIGN_LIMIT\)/);
  });
});
