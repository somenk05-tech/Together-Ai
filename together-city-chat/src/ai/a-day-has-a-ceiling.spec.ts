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
import { AiService } from './ai.service';
import { runWithRequestStore } from '../shared/request-context';

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
  const svc = new ModelBudgetService(redis as never);
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

  it('charges nothing when the model is off — there is no call to charge', async () => {
    // The charge sits inside AiService, immediately before messages.create.
    // With no API key there is no client, the method returns its fallback
    // before the meter, and the budget never hears about it.
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { svc, counts } = build();
      const ai = new AiService(svc);
      expect(ai.enabled).toBe(false);
      for (let i = 0; i < 100; i++) await ai.json('s', 'u', { fallback: true });
      expect(counts.size).toBe(0);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
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

  /**
   * CHARGED AT THE CALL, FOR EVERYONE (launch gate, third reading, 4 Sep).
   * Two Beauty routes spent this by hand and twenty-one other model routes
   * spent nothing. The meter sits in AiService now, before each of the
   * three `messages.create` sites, reading the citizen from the request
   * context; a call with nobody behind it moves the global counter only.
   */
  it('charge() bills the citizen in the request context, and the city\'s day, once each', async () => {
    const { svc, counts } = build();
    await runWithRequestStore({ userId: 'u1' }, () => svc.charge('vision'));
    expect(counts.get(ModelBudgetService.keyFor('u1'))).toBe(1);
    expect(counts.get(ModelBudgetService.globalKeyFor())).toBe(1);
    // No citizen: the global day still moves, nobody's personal day does.
    await svc.charge('job');
    expect(counts.get(ModelBudgetService.globalKeyFor())).toBe(2);
    expect(counts.size).toBe(2);
  });

  it('the city\'s day has a ceiling of its own, and it refuses everybody past it', async () => {
    process.env.AI_DAILY_CALLS_GLOBAL = '2';
    try {
      const { svc } = build();
      await svc.charge('a'); await svc.charge('b');
      await expect(svc.charge('c')).rejects.toMatchObject({ status: 429 });
      await expect(runWithRequestStore({ userId: 'fresh' }, () => svc.charge('d'))).rejects.toMatchObject({ status: 429 });
    } finally { delete process.env.AI_DAILY_CALLS_GLOBAL; }
  });

  it('AiService meters every messages.create site, outside its try/catch, and nothing else charges by hand', () => {
    const src = readFileSync(join(__dirname, 'ai.service.ts'), 'utf8');
    const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const code = strip(src);
    const creates = (code.match(/this\.client\.messages\.create\(/g) ?? []).length;
    const meters = (code.match(/await this\.meter\(/g) ?? []).length;
    expect(creates).toBe(3);
    expect(meters).toBe(3);
    // Each meter precedes its call's try: between the meter and the create
    // there is no `catch`, so a 429 reaches the citizen and not the fallback.
    let from = 0;
    for (let i = 0; i < meters; i += 1) {
      const at = code.indexOf('await this.meter(', from);
      const create = code.indexOf('this.client.messages.create(', at);
      expect(at).toBeGreaterThan(-1);
      expect(create).toBeGreaterThan(at);
      expect(code.slice(at, create)).not.toMatch(/catch/);
      from = create;
    }
    // No service spends the budget by hand any more — a second charge bills twice.
    const beauty = strip(readFileSync(join(__dirname, '..', 'beauty', 'beauty.service.ts'), 'utf8'));
    expect(beauty).not.toMatch(/budget\?\.spend\(/);
  });

  it('the request context reaches the meter through an await', async () => {
    const { svc, counts } = build();
    await runWithRequestStore({ userId: 'u9' }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      await svc.charge('later');
    });
    expect(counts.get(ModelBudgetService.keyFor('u9'))).toBe(1);
  });
});
