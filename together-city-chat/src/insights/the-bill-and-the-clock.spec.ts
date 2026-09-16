import { readFileSync } from 'fs';
import { join } from 'path';
import { AiLedgerService, errorKind } from '../ai/ai-ledger.service';
import { coveredMs } from './insights-math';
import { BEAT, PulseService, clampBeat } from './pulse.service';

/**
 * ── THE BILL AND THE CLOCK (owner, 16 Sep) ──────────────────────────────────
 *
 * What the investor dashboard called "not measured" is measured now: the AI
 * bill with its time and failures, time in the app, crash-free sessions and
 * uptime across deploys. Each instrument below is held to its caps, because an
 * instrument without a cap is a number anybody can inflate.
 */
const fakePrisma = () => {
  const calls: Array<{ sql?: string; params?: unknown[]; data?: unknown }> = [];
  return {
    calls,
    $executeRawUnsafe: jest.fn(async (sql: string, ...params: unknown[]) => { calls.push({ sql, params }); return 1; }),
    aiCall: { create: jest.fn(async ({ data }: { data: unknown }) => { calls.push({ data }); return data; }) },
  };
};

describe('the AI bill', () => {
  it('says how a call failed in one word, never in the provider’s words', () => {
    expect(errorKind(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }))).toBe('timeout');
    expect(errorKind(Object.assign(new Error('rate'), { status: 429 }))).toBe('rate_limit');
    expect(errorKind(Object.assign(new Error('Overloaded'), { status: 529 }))).toBe('overloaded');
    expect(errorKind(Object.assign(new Error('model: x'), { status: 404 }))).toBe('not_found');
    expect(errorKind(Object.assign(new Error('bad key'), { status: 401 }))).toBe('auth');
    expect(errorKind(Object.assign(new Error('boom'), { status: 500 }))).toBe('server');
    expect(errorKind('what')).toBe('other');
  });

  it('writes a success with its time, and a failure with its kind and no tokens', async () => {
    const p = fakePrisma();
    const ledger = new AiLedgerService(p as never);
    ledger.record('claude-sonnet-5', 'json', { input_tokens: 120, output_tokens: 40 }, 812.4);
    ledger.fail('claude-sonnet-5', 'json', Object.assign(new Error('prompt: secret words'), { status: 529 }), 30_000);
    await new Promise((r) => setImmediate(r));
    expect(p.calls.map((c) => c.data)).toEqual([
      expect.objectContaining({ model: 'claude-sonnet-5', tokensIn: 120, tokensOut: 40, ms: 812, failed: false, error: null }),
      expect.objectContaining({ tokensIn: 0, tokensOut: 0, ms: 30_000, failed: true, error: 'overloaded' }),
    ]);
    expect(JSON.stringify(p.calls)).not.toContain('secret words');
  });

  it('is written at every place a model answers or fails, and once per call', () => {
    const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const code = strip(readFileSync(join(__dirname, '..', 'ai', 'ai.service.ts'), 'utf8'));
    expect((code.match(/this\.client\.messages\.create\(/g) ?? []).length).toBe(3);
    expect((code.match(/this\.tally\(/g) ?? []).length).toBe(3);
    expect((code.match(/this\.ledger\?\.fail\(/g) ?? []).length).toBe(3);
    // A reply that came back and would not parse is not a failed call.
    expect((code.match(/if \(!answered\) this\.ledger\?\.fail\(/g) ?? []).length).toBe(2);
  });
});

describe('time in the app', () => {
  it('caps a beat at a minute and ignores nonsense', () => {
    expect(clampBeat(30)).toBe(30);
    expect(clampBeat(3600)).toBe(BEAT.maxSeconds);
    expect(clampBeat(-5)).toBe(0);
    expect(clampBeat('30')).toBe(0);
    expect(clampBeat(Number.NaN)).toBe(0);
  });

  it('drops beats that come too close together, and caps the day', async () => {
    const p = fakePrisma();
    const pulse = new PulseService(p as never);
    const t0 = new Date('2026-09-16T10:00:00Z');
    expect(await pulse.beat('u1', 30, t0)).toBe(true);
    expect(await pulse.beat('u1', 30, new Date(t0.getTime() + 5_000))).toBe(false);
    expect(await pulse.beat('u1', 30, new Date(t0.getTime() + 30_000))).toBe(true);
    expect(await pulse.beat('u2', 0, t0)).toBe(false);
    expect(p.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    const [sql, , userId, day, seconds] = p.$executeRawUnsafe.mock.calls[0] as unknown as [string, string, string, string, number];
    expect(sql).toContain(`LEAST(${BEAT.dayCap}`);
    expect([userId, day, seconds]).toEqual(['u1', '2026-09-16', 30]);
  });
});

describe('crash-free sessions', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('takes a random id, a platform word and a crash word — nothing else', async () => {
    const p = fakePrisma();
    const pulse = new PulseService(p as never);
    await pulse.session({ id, platform: 'ios' });
    await pulse.session({ id, platform: 'web', crash: 'render', message: 'Cannot read name of Asha' } as never);
    await pulse.session({ id: 'not-an-id', platform: 'web' });
    await pulse.session({ id, platform: 'toaster', crash: 'meltdown' });
    expect(p.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(p.$executeRawUnsafe.mock.calls[0].slice(1)).toEqual([id, 'ios']);
    expect(p.$executeRawUnsafe.mock.calls[1].slice(1)).toEqual([id, 'web', 'render']);
    expect(p.$executeRawUnsafe.mock.calls[2].slice(1)).toEqual([id, 'web']);
    expect(JSON.stringify(p.$executeRawUnsafe.mock.calls)).not.toContain('Asha');
  });
});

describe('uptime across deploys', () => {
  it('counts time covered by at least one run, once', () => {
    const h = 3_600_000;
    // Two overlapping runs (a deploy's handover), then a gap of an hour.
    const runs = [{ start: 0, end: 2 * h }, { start: 1.5 * h, end: 3 * h }, { start: 4 * h, end: 6 * h }];
    expect(coveredMs(runs, 0, 6 * h)).toBe(5 * h);
    expect(coveredMs(runs, 2.5 * h, 4.5 * h)).toBe(1 * h);
    expect(coveredMs([], 0, h)).toBe(0);
  });
});
