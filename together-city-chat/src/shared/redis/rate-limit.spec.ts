import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RedisThrottlerStorage } from './throttler-redis.storage';
import type { RedisService } from './redis.service';

/**
 * THE RATE LIMIT HAS TO BE ONE NUMBER FOR THE WHOLE CITY.
 *
 * It was two things that are not rate limiting:
 *
 *   · a counter in a plain object in ONE process, so the real limit was
 *     120 × however many instances Render happened to be running, and it reset
 *     on every deploy;
 *   · keyed on a socket IP that is the platform proxy's, because `trust proxy`
 *     was never set — so every caller shared one bucket and the login endpoint
 *     was protected by a number nobody chose.
 *
 * Both are fixed here. This file holds the counter to its contract and holds
 * the wiring to the two lines that make it real.
 */

const fakeRedis = (opts: { up: boolean; incr?: () => number; throws?: boolean; pttl?: number }) => {
  const pexpired: Array<[string, number]> = [];
  let hits = 0;
  const svc = {
    up: opts.up,
    raw: {
      multi: () => ({
        incr: () => ({
          pttl: () => ({
            exec: async () => {
              if (opts.throws) throw new Error('connection lost');
              hits = opts.incr ? opts.incr() : hits + 1;
              return [[null, hits], [null, opts.pttl ?? (hits === 1 ? -1 : 41_000)]];
            },
          }),
        }),
      }),
      pexpire: async (k: string, ms: number) => { pexpired.push([k, ms]); return 1; },
    },
  };
  return { svc: svc as unknown as RedisService, pexpired };
};

describe('the rate-limit counter lives in Redis', () => {
  it('counts in Redis and namespaces the key', async () => {
    const { svc, pexpired } = fakeRedis({ up: true });
    const store = new RedisThrottlerStorage(svc);
    const first = await store.increment('ip:1.2.3.4', 60_000);
    expect(first.totalHits).toBe(1);
    // The first hit of a window is the one that sets the expiry, and the key is
    // prefixed so a throttle bucket can never collide with presence or sockets.
    expect(pexpired).toEqual([['throttle:ip:1.2.3.4', 60_000]]);
  });

  it('does not re-stamp the expiry on later hits — a fixed window, not a sliding one', async () => {
    const { svc, pexpired } = fakeRedis({ up: true });
    const store = new RedisThrottlerStorage(svc);
    await store.increment('k', 60_000);
    const second = await store.increment('k', 60_000);
    expect(second.totalHits).toBe(2);
    // Re-stamping here would mean a caller who keeps knocking never falls out of
    // the window, and the limit would never release them.
    expect(pexpired).toHaveLength(1);
  });

  it('returns timeToExpire in SECONDS, because it becomes Retry-After', async () => {
    const { svc } = fakeRedis({ up: true, pttl: 41_000 });
    const store = new RedisThrottlerStorage(svc);
    await store.increment('k', 60_000);
    const second = await store.increment('k', 60_000);
    expect(second.timeToExpire).toBe(41);          // not 41000
  });

  it('falls back to memory when Redis is down, and still counts', async () => {
    const { svc, pexpired } = fakeRedis({ up: false });
    const store = new RedisThrottlerStorage(svc);
    const a = await store.increment('k', 60_000);
    const b = await store.increment('k', 60_000);
    expect([a.totalHits, b.totalHits]).toEqual([1, 2]);
    expect(pexpired).toEqual([]);
    store.onApplicationShutdown();   // the fallback's decay timers
    // Worse than Redis, no worse than yesterday. What it must NOT do is throw:
    // a throttler that fails closed turns a cache outage into a total outage.
  });

  it('falls back to memory when Redis throws mid-request', async () => {
    const { svc } = fakeRedis({ up: true, throws: true });
    const store = new RedisThrottlerStorage(svc);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const a = await store.increment('k', 60_000);
    const b = await store.increment('k', 60_000);
    expect([a.totalHits, b.totalHits]).toEqual([1, 2]);
    // Said once, not on every request — an outage must not also be a log flood.
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    store.onApplicationShutdown();
  });
});

describe('the wiring that makes the counter and the key real', () => {
  const API = join(__dirname, '..', '..', '..');
  const read = (p: string) => readFileSync(join(API, 'src', p), 'utf8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

  it('ThrottlerModule is given the Redis storage, not the default', () => {
    const mod = strip(read('app.module.ts'));
    expect(mod).toMatch(/storage:\s*new RedisThrottlerStorage\(/);
    // forRoot with a bare array is the in-process default returning by the back
    // door; the async form is what lets the storage be injected at all.
    expect(mod).not.toMatch(/ThrottlerModule\.forRoot\(\[/);
  });

  it('Express is told to trust exactly one proxy hop', () => {
    const main = strip(read('main.ts'));
    expect(main).toMatch(/set\('trust proxy', Number\.isFinite\(hops\) && hops > 0 \? hops : 1\)/);
    // `true` believes the entire X-Forwarded-For chain, whose left-hand end the
    // CLIENT writes — so a caller could mint a new address per request and never
    // be limited. One hop means only what the proxy itself appended.
    expect(main).not.toMatch(/set\('trust proxy',\s*true\)/);
  });
});
