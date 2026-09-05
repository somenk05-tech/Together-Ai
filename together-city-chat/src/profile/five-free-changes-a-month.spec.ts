import { HttpException } from '@nestjs/common';
import { ProfileEditMeterService } from './profile-edit-meter.service';
import { editQuota, inSitting, monthStart, nextMonthStart, profileChanged, EXTRA_EDIT_INR, FREE_EDITS_PER_MONTH, SITTING_MINUTES } from './edit-quota';

/**
 * FIVE FREE PROFILE CHANGES A MONTH, THEN ₹50 — owner rule, 5 Sep.
 *
 * The arithmetic, the change test, and the ORDER of the meter: priced before
 * the write, refused with a 402 that names the choice when ₹50 is due and
 * nothing was offered to pay it with, charged after — and never for a save
 * that changed nothing.
 */

const T0 = Date.parse('2026-09-05T10:00:00.000Z');

describe('the arithmetic', () => {
  it('five are free, the sixth is ₹50, and they come back on the first', () => {
    expect(editQuota(0, T0)).toMatchObject({ freeLeft: 5, priceInr: 0, used: 0 });
    expect(editQuota(4, T0)).toMatchObject({ freeLeft: 1, priceInr: 0 });
    expect(editQuota(5, T0)).toMatchObject({ freeLeft: 0, priceInr: EXTRA_EDIT_INR });
    expect(editQuota(9, T0).priceInr).toBe(EXTRA_EDIT_INR);
    expect(editQuota(5, T0).resetsAt).toBe('2026-10-01T00:00:00.000Z');
    expect(FREE_EDITS_PER_MONTH).toBe(5);
  });

  it('a change is a sitting: saves within fifteen minutes of the last counted one are the same change', () => {
    const MIN = 60_000;
    expect(inSitting(T0 - 5 * MIN, T0)).toBe(true);
    expect(inSitting(T0 - (SITTING_MINUTES + 1) * MIN, T0)).toBe(false);
    expect(inSitting(null, T0)).toBe(false);
    expect(editQuota(5, T0, T0 - 5 * MIN)).toMatchObject({ priceInr: 0, inSitting: true, freeLeft: 0 });
    expect(editQuota(5, T0, T0 - 20 * MIN)).toMatchObject({ priceInr: EXTRA_EDIT_INR, inSitting: false });
  });

  it('a calendar month, in UTC', () => {
    expect(monthStart(T0).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(nextMonthStart(Date.parse('2026-12-31T23:59:59Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('what counts as a change', () => {
  const before = { skinType: 'Oily', goals: ['Glow', 'Even tone'], heightCm: 160, note: null, when: new Date('2026-01-02T00:00:00.000Z') };
  it('re-sending what is there is not a change', () => {
    expect(profileChanged(before, { skinType: 'Oily', goals: ['Glow', 'Even tone'], heightCm: 160 })).toBe(false);
    expect(profileChanged(before, { skinType: ' Oily ', note: undefined })).toBe(false);
    expect(profileChanged(before, { when: new Date('2026-01-02T00:00:00.000Z') })).toBe(false);
  });
  it('a moved answer is', () => {
    expect(profileChanged(before, { skinType: 'Dry' })).toBe(true);
    expect(profileChanged(before, { goals: ['Glow'] })).toBe(true);
    expect(profileChanged(before, { note: 'x' })).toBe(true);
    expect(profileChanged(before, { heightCm: null })).toBe(true);
  });
  it('a key the save does not mention is not compared', () => {
    expect(profileChanged(before, {})).toBe(false);
  });
});

function meter(editsThisMonth: number, lastAtMs: number | null = null) {
  const created: { hub: string; priceInr: number }[] = [];
  const charges: { amountInr: number; label: string; category: string }[] = [];
  const preflights: number[] = [];
  const profileEdit = {
    count: async () => editsThisMonth,
    findFirst: async () => (lastAtMs === null ? null : { createdAt: new Date(lastAtMs) }),
    create: async (a: { data: { hub: string; priceInr: number } }) => { created.push(a.data); return a.data; },
  };
  const prisma = { profileEdit };
  const financial = {
    assertCanPay: async (_u: string, amountInr: number) => { preflights.push(amountInr); },
    paid: async (_u: string, input: { amountInr: number; label: string; category: string }, work: (t: unknown) => Promise<unknown>) => {
      charges.push({ amountInr: input.amountInr, label: input.label, category: input.category });
      return work({ profileEdit, cityWallet: { findUnique: async () => ({ balanceInr: 450 }) } });
    },
  };
  return { svc: new ProfileEditMeterService(prisma as never, financial as never), created, charges, preflights };
}

describe('the meter, in order', () => {
  it('inside the five: free, counted, no wallet', async () => {
    const m = meter(2);
    expect(await m.svc.assertCanSave('u1')).toBe(0);
    await m.svc.record('u1', 'beauty', 0);
    expect(m.created).toEqual([{ userId: 'u1', hub: 'beauty', priceInr: 0 }]);
    expect(m.charges).toEqual([]);
    expect(m.preflights).toEqual([]);
  });

  it('past the five with nothing to pay with: refused before anything is written, naming the choice', async () => {
    const m = meter(5);
    await expect(m.svc.assertCanSave('u1')).rejects.toBeInstanceOf(HttpException);
    try { await m.svc.assertCanSave('u1'); } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(402);
      const body = err.getResponse() as { message: string; priceInr: number; resetsAt: string };
      expect(body.priceInr).toBe(EXTRA_EDIT_INR);
      expect(body.message).toMatch(/₹50/);
      expect(body.message).toMatch(/1 Oct/);
      expect(body.resetsAt).toMatch(/^\d{4}-\d{2}-01T00:00:00/);
    }
    expect(m.created).toEqual([]);
  });

  it('past the five with a wallet: checked first, charged after, one transaction with the record', async () => {
    const m = meter(7);
    const price = await m.svc.assertCanSave('u1', 'wallet');
    expect(price).toBe(EXTRA_EDIT_INR);
    expect(m.preflights).toEqual([EXTRA_EDIT_INR]);
    const out = await m.svc.record('u1', 'dating', price, 'wallet');
    expect(m.charges).toEqual([{ amountInr: EXTRA_EDIT_INR, label: 'Profile change · dating · beyond the free five', category: 'city' }]);
    expect(m.created).toEqual([{ userId: 'u1', hub: 'dating', priceInr: EXTRA_EDIT_INR }]);
    expect(out.payment).toEqual({ method: 'wallet', balanceInr: 450 });
  });

  it('inside the sitting of the last change, past the five: nothing asked, nothing charged, nothing written', async () => {
    const m = meter(5, Date.now() - 3 * 60_000);
    expect(await m.svc.assertCanSave('u1')).toBe(0);
    await m.svc.record('u1', 'master', 0);
    expect(m.created).toEqual([]);
    expect(m.charges).toEqual([]);
  });

  it('the quota says what the next one costs and when the five come back', async () => {
    const q = await meter(5).svc.quota('u1', T0);
    expect(q).toMatchObject({ used: 5, freeLeft: 0, priceInr: EXTRA_EDIT_INR, resetsAt: '2026-10-01T00:00:00.000Z' });
  });
});
