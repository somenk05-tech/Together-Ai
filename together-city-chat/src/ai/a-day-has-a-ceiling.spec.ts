/**
 * A DAY HAS A CEILING.
 *
 * Every model route is throttled per minute, and nothing was throttled per
 * day (launch gate, 1 and 2 Sep): twenty vision calls a minute, all day, is
 * 28,800 from one account and within every limit the API had. This is the
 * daily one — one Redis counter per citizen per UTC day — and the four things
 * that make it a cap rather than a suggestion:
 *
 *   1. it refuses past the ceiling, with a 429, and the refusal is BEFORE
 *      the model is asked (beauty spends it ahead of reviewSkinPhotos);
 *   2. it charges nothing when the model is off — fallbacks cost nothing;
 *   3. it fails open when Redis is away, once, in the log — the per-minute
 *      throttle still holds, and refusing everyone is the worse outage;
 *   4. the key is a UTC day, so every replica agrees when it resets.
 */
import { HttpException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ModelBudgetService } from './model-budget.service';

function build(opts: { enabled?: boolean; up?: boolean; failIncr?: boolean } = {}) {
  const counts = new Map<string, number>();
  const expires: string[] = [];
  const redis = {
    up: opts.up ?? true,
    raw: {
      incr: async (k: string) => { if (opts.failIncr) throw new Error('ECONNRESET'); const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n; },
      expire: async (k: string) => { expires.push(k); return 1; },
    },
  };
  const ai = { enabled: opts.enabled ?? true };
  const svc = new ModelBudgetService(redis as never, ai as never);
  return { svc, counts, expires };
}

describe('a day has a ceiling', () => {
  const saved = process.env.AI_DAILY_CALLS_PER_CITIZEN;
  afterEach(() => { if (saved === undefined) delete process.env.AI_DAILY_CALLS_PER_CITIZEN; else process.env.AI_DAILY_CALLS_PER_CITIZEN = saved; });

  it('lets the cap through and refuses the call after it, with a 429', async () => {
    process.env.AI_DAILY_CALLS_PER_CITIZEN = '3';
    const { svc } = build();
    await svc.spend('u1', 'test'); await svc.spend('u1', 'test'); await svc.spend('u1', 'test');
    await expect(svc.spend('u1', 'test')).rejects.toBeInstanceOf(HttpException);
    await expect(svc.spend('u1', 'test')).rejects.toMatchObject({ status: 429 });
    // Another citizen's day is their own.
    await expect(svc.spend('u2', 'test')).resolves.toBeUndefined();
  });

  it('sets the expiry once, on the first call of the day', async () => {
    const { svc, expires } = build();
    await svc.spend('u1', 'a'); await svc.spend('u1', 'b');
    expect(expires).toHaveLength(1);
    expect(expires[0]).toBe(ModelBudgetService.keyFor('u1'));
  });

  it('charges nothing when the model is off', async () => {
    const { svc, counts } = build({ enabled: false });
    for (let i = 0; i < 100; i++) await svc.spend('u1', 'x');
    expect(counts.size).toBe(0);
  });

  it('fails open when Redis is away, and when a command fails', async () => {
    process.env.AI_DAILY_CALLS_PER_CITIZEN = '1';
    const down = build({ up: false });
    for (let i = 0; i < 5; i++) await expect(down.svc.spend('u1', 'x')).resolves.toBeUndefined();
    const broken = build({ failIncr: true });
    for (let i = 0; i < 5; i++) await expect(broken.svc.spend('u1', 'x')).resolves.toBeUndefined();
  });

  it('keys the day in UTC, and reads a sane default', () => {
    expect(ModelBudgetService.keyFor('u1', new Date('2026-09-02T23:59:59Z'))).toBe('ai:budget:2026-09-02:u1');
    expect(ModelBudgetService.keyFor('u1', new Date('2026-09-03T00:00:01Z'))).toBe('ai:budget:2026-09-03:u1');
    delete process.env.AI_DAILY_CALLS_PER_CITIZEN;
    expect(build().svc.dailyCap).toBe(ModelBudgetService.DEFAULT_DAILY);
    process.env.AI_DAILY_CALLS_PER_CITIZEN = 'nonsense';
    expect(build().svc.dailyCap).toBe(ModelBudgetService.DEFAULT_DAILY);
  });

  it('beauty spends it BEFORE the model is asked, on both routes', () => {
    const src = readFileSync(join(__dirname, '..', 'beauty', 'beauty.service.ts'), 'utf8');
    const photos = src.slice(src.indexOf('async analyzePhotos('), src.indexOf('async analyzePhotos(') + 4000);
    expect(photos.indexOf("this.budget?.spend(userId, 'beauty.photos')")).toBeGreaterThan(-1);
    expect(photos.indexOf("this.budget?.spend(userId, 'beauty.photos')")).toBeLessThan(photos.indexOf('this.ai.reviewSkinPhotos('));
    const look = src.slice(src.indexOf('async analyzeLook('));
    expect(look.indexOf("this.budget?.spend(userId, 'beauty.looks')")).toBeGreaterThan(-1);
    expect(look.indexOf("this.budget?.spend(userId, 'beauty.looks')")).toBeLessThan(look.indexOf('this.looks.analyze('));
  });
});
