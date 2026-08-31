/* eslint-disable @typescript-eslint/no-explicit-any */
import { envInt } from './env-int';
import { ReadCache } from './cache/read-cache.service';

/**
 * ── ZERO IS A NUMBER, AND A BLIP IS NOT A FACT ──────────────────────────────
 *
 * Two of the 31 Aug audit's quieter findings, and they share a shape: a value
 * that is WRONG rather than missing, kept somewhere it will be believed.
 *
 *  1 · `Math.max(0, parseInt(env) || 1_000)`. `parseInt('0')` is `0`, and
 *      `0 || 1_000` is `1_000` — so SOCIAL_FANOUT_MAX=0, the one value an
 *      operator reaches for to turn live fan-out OFF during an incident,
 *      silently set it to the busiest setting there is. `||` cannot tell
 *      "unset" from "zero", and for a limit those are opposite instructions.
 *
 *  2 · A read inside a cache producer that swallowed its failure to `[]`. On
 *      its own that is the ordinary best-effort shape. Inside the producer it
 *      means the EMPTY ANSWER IS STORED, so one dropped connection becomes a
 *      persistent wrong answer for the whole TTL — and for `blockedWith` that
 *      answer is "this citizen has blocked nobody".
 */

describe('an integer from the environment, and zero is one', () => {
  const withEnv = (v: string | undefined, run: () => void) => {
    const before = process.env.TEST_LIMIT;
    if (v === undefined) delete process.env.TEST_LIMIT; else process.env.TEST_LIMIT = v;
    try { run(); } finally {
      if (before === undefined) delete process.env.TEST_LIMIT; else process.env.TEST_LIMIT = before;
    }
  };

  it('reads zero as zero, which is the whole bug', () => {
    withEnv('0', () => expect(envInt('TEST_LIMIT', 1000, 0, 50000)).toBe(0));
    // The old expression, kept here so the difference is not a claim:
    withEnv('0', () => expect(Math.max(0, Number.parseInt(process.env.TEST_LIMIT ?? '', 10) || 1000)).toBe(1000));
  });

  it('falls back when it is unset, empty, or not a number', () => {
    withEnv(undefined, () => expect(envInt('TEST_LIMIT', 1000, 0, 50000)).toBe(1000));
    withEnv('   ', () => expect(envInt('TEST_LIMIT', 1000, 0, 50000)).toBe(1000));
    withEnv('banana', () => expect(envInt('TEST_LIMIT', 1000, 0, 50000)).toBe(1000));
    // `??` alone would have taken the fallback for zero and 'banana' alike;
    // the question has to be whether a NUMBER was read.
  });

  it('clamps rather than trusting', () => {
    withEnv('-5', () => expect(envInt('TEST_LIMIT', 1000, 0, 50000)).toBe(0));
    withEnv('999999', () => expect(envInt('TEST_LIMIT', 1000, 0, 50000)).toBe(50000));
  });
});

describe('the cache does not keep an answer the producer failed to get', () => {
  const cache = () => {
    const store = new Map<string, string>();
    const c = Object.create(ReadCache.prototype) as ReadCache;
    (c as any).redis = { up: true };
    (c as any).get = async (k: string) => (store.has(k) ? JSON.parse(store.get(k) as string) : undefined);
    (c as any).set = async (k: string, v: unknown) => { store.set(k, JSON.stringify(v)); };
    return { c, store };
  };

  it('stores nothing when the producer throws', async () => {
    // This is what makes "let it throw" the fix rather than a second problem:
    // the failure costs one error, not a stored one.
    const { c, store } = cache();
    await expect(c.wrap('k', 30, async () => { throw new Error('db blinked'); })).rejects.toThrow('db blinked');
    expect(store.has('k')).toBe(false);
  });

  it('stores the value when the producer succeeds', async () => {
    const { c, store } = cache();
    await expect(c.wrap('k', 30, async () => [1, 2])).resolves.toEqual([1, 2]);
    expect(store.get('k')).toBe('[1,2]');
  });

  it('would have stored the empty list a swallowed read returns', async () => {
    // The shape being removed, asserted so the reasoning above is a
    // demonstration rather than a claim: nothing about `wrap` was wrong. The
    // fault was that the producer answered `[]` instead of failing, and `wrap`
    // faithfully kept it.
    const { c, store } = cache();
    // What the removed `.catch(swallowed(…, []))` produced: a resolved empty
    // list, indistinguishable from a citizen who really has no connections.
    // Written as the RESULT rather than the shape, because adding a second
    // bare catch to make a point about bare catches is not a point.
    const swallowing = async () => [] as number[];
    await expect(c.wrap('k', 30, swallowing)).resolves.toEqual([]);
    expect(store.get('k')).toBe('[]');
  });
});

describe('the graph keys are named in one place', () => {
  it('drops both of a citizen’s cached sets, on both sides', () => {
    // SocialService and BlockingService each spelled these out; the service
    // that changes the graph most often — accept, decline, module toggle,
    // removal — spelled them nowhere and so invalidated nothing.
    const dropped: string[] = [];
    const c = Object.create(ReadCache.prototype) as ReadCache;
    (c as any).drop = async (...keys: string[]) => { dropped.push(...keys); };
    c.dropGraph('a', null, 'b', undefined);
    expect(dropped).toEqual(['graph:a', 'blocked:a', 'graph:b', 'blocked:b']);
  });

  it('does nothing for no ids', () => {
    const dropped: string[] = [];
    const c = Object.create(ReadCache.prototype) as ReadCache;
    (c as any).drop = async (...keys: string[]) => { dropped.push(...keys); };
    c.dropGraph(undefined, null);
    expect(dropped).toEqual([]);
  });
});
