import { BeautyService } from './beauty.service';
import { analysisQuota, analysisPrice, recordAccepted, EXTRA_ANALYSIS_INR, FREE_WINDOW_DAYS } from './analysis-quota';

/**
 * ONE FREE PHOTO ANALYSIS PER ROLLING 30 DAYS, ₹100 EACH AFTER — owner
 * decision, 5 Sep. The skin analysis and the Look share the counter; a
 * rejected read costs nothing and spends nothing.
 *
 * Two halves. The arithmetic is pure and tested on its own; the service test
 * proves the ORDER — priced before the model, charged after the result, never
 * on a rejected photograph — because that order is what makes the rule fair
 * and it is the part a refactor would quietly reverse.
 */

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-05T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('the arithmetic', () => {
  it('the first analysis is free', () => {
    expect(analysisPrice([], T0)).toBe(0);
    expect(analysisQuota([], T0)).toMatchObject({ freeAvailable: true, nextFreeAt: null, priceInr: 0 });
  });

  it('a second one inside thirty days is ₹100, and says when the next free one opens', () => {
    const q = analysisQuota([iso(T0 - 10 * DAY)], T0);
    expect(q.priceInr).toBe(EXTRA_ANALYSIS_INR);
    expect(q.freeAvailable).toBe(false);
    expect(q.nextFreeAt).toBe(iso(T0 - 10 * DAY + FREE_WINDOW_DAYS * DAY));
  });

  it('rolling, not calendar: thirty-one days after the last free one it is free again', () => {
    expect(analysisPrice([iso(T0 - 31 * DAY)], T0)).toBe(0);
    expect(analysisPrice([iso(T0 - 30 * DAY + 1)], T0)).toBe(EXTRA_ANALYSIS_INR);
  });

  it('paid analyses do not push the next free one out — the OLDEST in the window opens it', () => {
    const q = analysisQuota([iso(T0 - 20 * DAY), iso(T0 - 5 * DAY), iso(T0 - 1 * DAY)], T0);
    expect(q.nextFreeAt).toBe(iso(T0 - 20 * DAY + FREE_WINDOW_DAYS * DAY));
  });

  it('recording keeps the window intact and trims what nothing reads', () => {
    const list = recordAccepted([iso(T0 - 100 * DAY), iso(T0 - 29 * DAY), 'not a date'], T0);
    expect(list).toEqual([iso(T0 - 29 * DAY), iso(T0)]);
    expect(analysisPrice(list, T0 + 1)).toBe(EXTRA_ANALYSIS_INR);
  });

  it('a timestamp from the future is not an analysis that happened', () => {
    expect(analysisPrice([iso(T0 + DAY)], T0)).toBe(0);
  });
});

/**
 * A BeautyService with the four things this path touches and nothing else:
 * one profile row, a model that answers what the test says, a wallet that
 * records what it was asked, and a Look reader.
 */
function service(opts: {
  row?: Record<string, unknown> | null;
  review?: { quality: 'ok' | 'unclear' | 'suspect'; findings: string[]; note: string; face: null };
  lookReadBy?: 'ai' | 'fallback';
}) {
  const writes: unknown[] = [];
  const charges: { amountInr: number; label: string }[] = [];
  const preflights: number[] = [];
  let row: Record<string, unknown> | null = opts.row === undefined ? null : opts.row;
  const beautyProfile = {
    findUnique: async () => row,
    upsert: async (a: { update: Record<string, unknown>; create: Record<string, unknown> }) => {
      writes.push(a);
      row = { ...(row ?? a.create), ...a.update };
      return row;
    },
  };
  const tx = {
    beautyProfile,
    cityWallet: { findUnique: async () => ({ balanceInr: 900 }) },
  };
  const prisma = { beautyProfile, beautyOrder: { findMany: async () => [] } };
  const financial = {
    assertCanPay: async (_u: string, amountInr: number) => { preflights.push(amountInr); },
    paid: async (_u: string, input: { amountInr: number; label: string }, work: (t: unknown) => Promise<unknown>) => {
      charges.push({ amountInr: input.amountInr, label: input.label });
      return work(tx);
    },
  };
  const ai = {
    enabled: true,
    reviewSkinPhotos: async () => opts.review ?? { quality: 'ok' as const, findings: ['mild dryness'], note: '', face: null },
  };
  const looks = {
    analyze: async () => ({ id: 'l1', status: 'ready', readBy: opts.lookReadBy ?? 'ai', confidence: 0.8, steps: [], productMatches: [], attributes: {} }),
  };
  const medical = { sharedBiomarkers: async () => null };
  const masterProfile = { get: async () => null };
  const svc = new BeautyService(
    prisma as never, medical as never, financial as never, ai as never, masterProfile as never, looks as never,
  );
  return { svc, writes, charges, preflights, row: () => row };
}

const photos = [{ slot: 'face', base64: 'x'.repeat(32) }, { slot: 'left', base64: 'y'.repeat(32) }];
const baseRow = { userId: 'u1', skinType: 'normal', hairType: 'straight', concerns: '', extras: '{}', photosJson: '[]', progressJson: '[]', analysisJson: null, analyzedAt: null };

describe('the service, in order', () => {
  it('the first accepted analysis is free, touches no wallet, and is recorded', async () => {
    const s = service({ row: baseRow });
    const out = await s.svc.analyzePhotos('u1', photos);
    expect(out.priceInr).toBe(0);
    expect(out).not.toHaveProperty('payment');
    expect(s.charges).toEqual([]);
    expect(s.preflights).toEqual([]);
    const accepted = JSON.parse(String(s.row()?.acceptedAnalysesJson)) as string[];
    expect(accepted).toHaveLength(1);
    expect(out.uploads?.freeAvailable).toBe(false);
    expect(out.uploads?.priceInr).toBe(EXTRA_ANALYSIS_INR);
  });

  it('the second inside the window is checked before the model and charged ₹100 after it', async () => {
    const s = service({ row: { ...baseRow, acceptedAnalysesJson: JSON.stringify([iso(Date.now() - 3 * DAY)]) } });
    const out = await s.svc.analyzePhotos('u1', photos, undefined, 'wallet');
    expect(s.preflights).toEqual([EXTRA_ANALYSIS_INR]);
    expect(s.charges).toEqual([{ amountInr: EXTRA_ANALYSIS_INR, label: 'Photo analysis · extra this month' }]);
    expect(out.priceInr).toBe(EXTRA_ANALYSIS_INR);
    expect('payment' in out ? out.payment : undefined).toEqual({ method: 'wallet', balanceInr: 900 });
    // The record and the charge were one transaction: the write went through tx.
    expect(s.writes).toHaveLength(1);
  });

  it('a rejected photograph is never charged and never spends the free one', async () => {
    const s = service({ row: { ...baseRow, acceptedAnalysesJson: JSON.stringify([iso(Date.now() - 3 * DAY)]) }, review: { quality: 'unclear', findings: [], note: '', face: null } });
    const out = await s.svc.analyzePhotos('u1', photos, undefined, 'wallet');
    expect(s.preflights).toEqual([EXTRA_ANALYSIS_INR]); // checked, honestly, before the read
    expect(s.charges).toEqual([]);
    expect(out.priceInr).toBe(0);
    const accepted = JSON.parse(String(s.row()?.acceptedAnalysesJson)) as string[];
    expect(accepted).toHaveLength(1); // unchanged
    // …but the weekly run log still counts it: a rejected read is still a read.
    expect(JSON.parse(String(s.row()?.analysisLogJson))).toHaveLength(1);
  });

  it('a Look shares the counter: free first, then ₹100, and a fallback Look is not an analysis', async () => {
    const free = service({ row: baseRow });
    const first = await free.svc.analyzeLook('u1', { base64: 'z'.repeat(32) });
    expect(first.priceInr).toBe(0);
    expect(free.charges).toEqual([]);
    expect(JSON.parse(String(free.row()?.acceptedAnalysesJson))).toHaveLength(1);

    const paid = service({ row: free.row() });
    const second = await paid.svc.analyzeLook('u1', { base64: 'z'.repeat(32) }, 'wallet');
    expect(second.priceInr).toBe(EXTRA_ANALYSIS_INR);
    expect(paid.charges).toEqual([{ amountInr: EXTRA_ANALYSIS_INR, label: 'Look analysis · extra this month' }]);

    const dud = service({ row: free.row(), lookReadBy: 'fallback' });
    const third = await dud.svc.analyzeLook('u1', { base64: 'z'.repeat(32) }, 'wallet');
    expect(third.priceInr).toBe(0);
    expect(dud.charges).toEqual([]);
  });

  it('after the skin analysis, a Look inside the window is the paid one — one counter, not two', async () => {
    const s = service({ row: baseRow });
    await s.svc.analyzePhotos('u1', photos);
    const look = await s.svc.analyzeLook('u1', { base64: 'z'.repeat(32) }, 'wallet');
    expect(look.priceInr).toBe(EXTRA_ANALYSIS_INR);
  });
});
