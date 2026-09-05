/**
 * A PAID CALL IS NEVER REFUSED.
 *
 * Owner, 4 Sep: "there should be no cap for paid services for AI." Both daily
 * ceilings — the citizen's sixty and the city's twenty thousand — exist for a
 * reason that is only true of FREE work: a free call is unbounded, so
 * something has to bound it. A paid call arrives bounded twice already, by the
 * money and by what the money bought (₹99 is five minutes of spoken
 * consultation, about ten turns, and not an eleventh). The third bound could
 * only ever refuse somebody who had paid.
 *
 * The four things that make that safe rather than merely generous:
 *
 *   1. PAID MEANS THIS WORK, NOT THIS PERSON. `runAsPaidWork` wraps the work
 *      a settled charge bought, and ends with it. One ₹99 purchase is not a
 *      bypass token for the rest of the day.
 *   2. NOTHING FROM OUTSIDE CAN SET IT. The request interceptor never writes
 *      `paidWork`; only server code that took the money does.
 *   3. IT IS STILL COUNTED, on its own keys, so an exemption is visible. A
 *      retry loop in a paid path would otherwise spend silently.
 *   4. FREE WORK IS UNCHANGED. The ceilings still refuse, exactly as before.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { ModelBudgetService } from './model-budget.service';
import { runWithRequestStore, runAsPaidWork, isPaidWork } from '../shared/request-context';

function build(opts: { up?: boolean } = {}) {
  const counts = new Map<string, number>();
  const redis = {
    up: opts.up ?? true,
    raw: {
      incr: async (k: string) => { const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n; },
      expire: async () => 1,
    },
  };
  return { svc: new ModelBudgetService(redis as never), counts };
}

describe('a paid call is never refused', () => {
  const savedUser = process.env.AI_DAILY_CALLS_PER_CITIZEN;
  const savedGlobal = process.env.AI_DAILY_CALLS_GLOBAL;
  afterEach(() => {
    if (savedUser === undefined) delete process.env.AI_DAILY_CALLS_PER_CITIZEN;
    else process.env.AI_DAILY_CALLS_PER_CITIZEN = savedUser;
    if (savedGlobal === undefined) delete process.env.AI_DAILY_CALLS_GLOBAL;
    else process.env.AI_DAILY_CALLS_GLOBAL = savedGlobal;
  });

  it('goes past a citizen ceiling that would have refused a free call', async () => {
    process.env.AI_DAILY_CALLS_PER_CITIZEN = '2';
    const { svc } = build();
    await runWithRequestStore({ userId: 'u1' }, async () => {
      await svc.charge('free'); await svc.charge('free');
      // The third free one is refused …
      await expect(svc.charge('free')).rejects.toMatchObject({ status: 429 });
      // … and the paid ones that follow are not, however many there are.
      await runAsPaidWork(async () => {
        for (let i = 0; i < 25; i++) await svc.charge('voice-turn');
      });
    });
  });

  it('goes past the city ceiling too — a paying citizen is not held up by a busy day', async () => {
    process.env.AI_DAILY_CALLS_GLOBAL = '2';
    const { svc } = build();
    await runWithRequestStore({ userId: 'u1' }, async () => {
      await svc.charge('free'); await svc.charge('free');
      await expect(svc.charge('free')).rejects.toBeInstanceOf(HttpException);
      await runAsPaidWork(async () => { await expect(svc.charge('voice-turn')).resolves.toBeUndefined(); });
    });
  });

  it('counts paid work on its own keys, so the exemption is visible', async () => {
    const { svc, counts } = build();
    await runWithRequestStore({ userId: 'u7' }, () => runAsPaidWork(async () => {
      await svc.charge('voice-turn'); await svc.charge('voice-turn');
    }));
    expect(counts.get(ModelBudgetService.paidKeyFor('u7'))).toBe(2);
    expect(counts.get(ModelBudgetService.paidGlobalKeyFor())).toBe(2);
    // And nothing landed on the free counters.
    expect(counts.get(ModelBudgetService.keyFor('u7'))).toBeUndefined();
    expect(counts.get(ModelBudgetService.globalKeyFor())).toBeUndefined();
  });

  it('keeps paid and free counters apart, so paid work never pushes anyone into a ceiling', async () => {
    process.env.AI_DAILY_CALLS_PER_CITIZEN = '3';
    const { svc, counts } = build();
    await runWithRequestStore({ userId: 'u9' }, async () => {
      await runAsPaidWork(async () => { for (let i = 0; i < 10; i++) await svc.charge('voice-turn'); });
      // Ten paid calls later, all three free ones are still there.
      await svc.charge('free'); await svc.charge('free'); await svc.charge('free');
      await expect(svc.charge('free')).rejects.toMatchObject({ status: 429 });
    });
    expect(counts.get(ModelBudgetService.paidKeyFor('u9'))).toBe(10);
  });

  it('is this piece of work, not this citizen — the exemption ends with it', async () => {
    process.env.AI_DAILY_CALLS_PER_CITIZEN = '1';
    const { svc } = build();
    await runWithRequestStore({ userId: 'u2' }, async () => {
      await runAsPaidWork(async () => { await svc.charge('voice-turn'); });
      expect(isPaidWork()).toBe(false);
      await svc.charge('free');
      await expect(svc.charge('free')).rejects.toMatchObject({ status: 429 });
    });
  });

  it('keeps the citizen inside paid work, so the count is somebody’s', async () => {
    const { svc, counts } = build();
    await runWithRequestStore({ userId: 'u3' }, () => runAsPaidWork(async () => {
      expect(isPaidWork()).toBe(true);
      await svc.charge('voice-turn');
    }));
    expect(counts.get(ModelBudgetService.paidKeyFor('u3'))).toBe(1);
  });

  it('charges a paid call with no citizen behind it to the global paid day only', async () => {
    const { svc, counts } = build();
    await runAsPaidWork(async () => { await svc.charge('job'); });
    expect(counts.get(ModelBudgetService.paidGlobalKeyFor())).toBe(1);
  });

  it('does not hold up a paid call when Redis is away', async () => {
    const { svc } = build({ up: false });
    await runWithRequestStore({ userId: 'u4' }, () => runAsPaidWork(async () => {
      await expect(svc.charge('voice-turn')).resolves.toBeUndefined();
    }));
  });

  it('nothing arriving from outside can claim to be paid', () => {
    const src = readFileSync(join(__dirname, '../shared/request-context.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    // The interceptor builds its store from the JWT subject and nothing else.
    const interceptor = src.slice(src.indexOf('class RequestContextInterceptor'));
    expect(interceptor).toMatch(/const store: RequestStore = \{ userId: req\?\.user\?\.sub \};/);
    expect(interceptor).not.toMatch(/paidWork/);
  });
});
