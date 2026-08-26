import { DatingService } from './dating.service';

/**
 * The three list reads are kept for a minute per viewer, and thrown away the
 * moment that viewer does anything that changes them. A stub Redis is enough
 * to show both halves; the arithmetic underneath is not exercised here.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function build(up = true) {
  const store = new Map<string, string>();
  const s: any = Object.create(DatingService.prototype);
  s.redis = { up, raw: {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => { store.set(k, v); return 'OK'; },
    incr: async (k: string) => { const n = Number(store.get(k) ?? 0) + 1; store.set(k, String(n)); return n; },
  } };
  let computed = 0;
  s.matchesUncached = async () => { computed += 1; return [{ score: 90, n: computed }]; };
  return { s, computed: () => computed, store };
}

describe('the list cache', () => {
  it('scores once and answers from the cache until the viewer acts', async () => {
    const { s, computed } = build();
    await s.matches('me', 'romantic', 48);
    await s.matches('me', 'romantic', 48);
    expect(computed()).toBe(1);
    // A different page is a different answer.
    await s.matches('me', 'romantic', 96);
    expect(computed()).toBe(2);
    // The viewer liked somebody: everything they had cached is stale.
    await s.bumpListVersion('me');
    await s.matches('me', 'romantic', 48);
    expect(computed()).toBe(3);
  });

  it('is one viewer’s cache, never another’s', async () => {
    const { s, computed } = build();
    await s.matches('me', 'romantic', 48);
    await s.matches('you', 'romantic', 48);
    expect(computed()).toBe(2);
  });

  it('is simply absent when Redis is down', async () => {
    const { s, computed } = build(false);
    await s.matches('me', 'romantic', 48);
    await s.matches('me', 'romantic', 48);
    expect(computed()).toBe(2);
  });
});
