/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CronLease, leased } from './cron-lease';

/**
 * ── ONE INSTANCE RUNS A CRON, NOT EVERY INSTANCE (5 Sep) ────────────────────
 * Railway overlaps two instances on every deploy; every @Cron ran on both.
 */
function fakeRedis(store = new Map<string, string>()) {
  const raw = {
    set: async (k: string, v: string, _px: string, _ttl: number, nx: string) => {
      if (nx === 'NX' && store.has(k)) return null;
      store.set(k, v); return 'OK';
    },
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => { store.delete(k); return 1; },
  };
  return { up: true, raw, store };
}

describe('the lease', () => {
  it('two instances, one firing: one runs, the other is told it was taken', async () => {
    const redis = fakeRedis();
    const a = new CronLease(redis as any); const b = new CronLease(redis as any);
    let runs = 0;
    const slow = () => new Promise<void>((r) => setTimeout(() => { runs += 1; r(); }, 20));
    const [ra, rb] = await Promise.all([a.run('j', 5_000, slow), b.run('j', 5_000, slow)]);
    expect(runs).toBe(1);
    expect([ra.skipped, rb.skipped].sort()).toEqual([false, true]);
  });
  it('releases its own lease afterwards, and only its own', async () => {
    const redis = fakeRedis();
    const a = new CronLease(redis as any);
    await a.run('j', 5_000, async () => undefined);
    expect(redis.store.has('cron:lease:j')).toBe(false);
    redis.store.set('cron:lease:j', 'somebody-else');
    await a.run('j', 5_000, async () => undefined); // skipped
    expect(redis.store.get('cron:lease:j')).toBe('somebody-else');
  });
  it('runs without Redis, and says so once', async () => {
    const lease = new CronLease(undefined);
    (lease as any).logger = { warn: jest.fn() };
    let runs = 0;
    await lease.run('j', 1_000, async () => { runs += 1; });
    await lease.run('j', 1_000, async () => { runs += 1; });
    expect(runs).toBe(2);
    expect((lease as any).logger.warn).toHaveBeenCalledTimes(1);
  });
  it('a throwing job still releases the lease', async () => {
    const redis = fakeRedis();
    const a = new CronLease(redis as any);
    await expect(a.run('j', 5_000, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(redis.store.has('cron:lease:j')).toBe(false);
  });
  it('the one-line form runs the job when no lease is wired', async () => {
    let ran = false;
    await leased(undefined, 'j', 1_000, async () => { ran = true; });
    expect(ran).toBe(true);
  });
});

describe('every @Cron in the tree takes the lease', () => {
  const SRC = join(__dirname, '..', '..');
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p); } };
  walk(SRC);
  it('no @Cron method runs its body without `leased(`', () => {
    const bare: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/@Cron\([^)]*\)\s*\n\s*async (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/g)) {
        if (!/\bleased\(/.test(m[2])) bare.push(`${f.slice(SRC.length + 1)} ${m[1]}`);
      }
    }
    expect(bare).toEqual([]);
  });
  it('finds the crons at all', () => {
    const n = files.reduce((acc, f) => acc + (readFileSync(f, 'utf8').match(/@Cron\(/g)?.length ?? 0), 0);
    expect(n).toBeGreaterThanOrEqual(8);
  });
});
