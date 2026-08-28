/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { errorSnapshot, recordError, resetErrorLog } from './error-log';

/**
 * ── AN ERROR NOBODY READS DID NOT HAPPEN (launch audit, 28 Aug) ──
 *
 * `SENTRY_DSN` is unset in production. The wiring behind it was never the
 * problem — the exception filter reports every 5xx with the route and nothing
 * about the citizen — so `report()` is simply a no-op, and a 500 becomes a
 * line in a log stream nobody is reading on the morning it matters.
 *
 * The floor under that is a tally the process keeps for itself: read by the
 * operator page, and carried by the daily digest, which is the one message a
 * console holder receives rather than visits. It is explicitly not a Sentry
 * replacement — no stack traces, no history, dies with the process — it is
 * what is true before somebody sets the DSN.
 *
 * What it must never become is a second place citizen data collects, which is
 * the failure mode of every "just log it" idea. Hence the last two tests.
 */
function fire(exception: unknown, req: { method?: string; route?: { path: string }; path?: string } = {}) {
  const filter = new AllExceptionsFilter();
  (filter as any).logger = { error: () => undefined };
  const res = { setHeader: () => undefined, status: () => ({ json: () => undefined }) };
  filter.catch(exception, {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as never);
}

describe('the tally under the missing DSN', () => {
  beforeEach(() => resetErrorLog());

  it('starts empty, and says since when', () => {
    const s = errorSnapshot();
    expect(s.total).toBe(0);
    expect(s.recent).toEqual([]);
    expect(Date.parse(s.since)).not.toBeNaN();
  });

  it('counts a 500 the filter saw, with the route and the method', () => {
    fire(new Error('boom'), { method: 'POST', route: { path: '/dating/profile' } });
    const s = errorSnapshot();
    expect(s.total).toBe(1);
    expect(s.recent[0]).toMatchObject({ status: 500, method: 'POST', route: '/dating/profile' });
    expect(s.recent[0].message).toContain('boom');
  });

  it('does not count what is not the server’s fault', () => {
    fire(new BadRequestException('nope'), { method: 'POST', route: { path: '/dating/like' } });
    fire(new NotFoundException('gone'), { method: 'GET', route: { path: '/dating/x' } });
    expect(errorSnapshot().total).toBe(0);
  });

  it('names the route failing most, which is the question actually asked', () => {
    for (let i = 0; i < 3; i += 1) recordError({ status: 500, method: 'GET', route: '/dating/stack', message: 'x' });
    recordError({ status: 500, method: 'GET', route: '/mail', message: 'y' });
    expect(errorSnapshot().worstRoute).toEqual({ route: '/dating/stack', count: 3 });
  });

  it('keeps the newest twenty and no more — a storm cannot eat the process', () => {
    for (let i = 0; i < 60; i += 1) recordError({ status: 500, route: `/r${i}`, message: `m${i}` });
    const s = errorSnapshot();
    expect(s.total).toBe(60);
    expect(s.recent).toHaveLength(20);
    expect(s.recent[0].route).toBe('/r59');
  });

  it('holds no request body — only the class and the message, truncated', () => {
    fire(new Error('x'.repeat(500)), { method: 'POST', route: { path: '/p' } });
    const entry = errorSnapshot().recent[0];
    expect(entry.message.length).toBeLessThanOrEqual(200);
    expect(Object.keys(entry).sort()).toEqual(['at', 'message', 'method', 'route', 'status']);
  });

  it('falls back to a name rather than recording a path it was not given', () => {
    fire(new Error('boom'), {});
    expect(errorSnapshot().recent[0]).toMatchObject({ route: 'unknown', method: '?' });
  });
});
