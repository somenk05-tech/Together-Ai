/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildKit, quality, ranked, KIT_NOTE } from './kit';
import { PRODUCTS, type Product } from './products';
import { SupplementsService } from './supplements.service';

/**
 * ── ONE PACK PER SUPPLEMENT, INSIDE A NUMBER THE CITIZEN SET (owner, 5 Sep) ──
 * "supplements show only one option for supplement based on budget — let user
 * set budget." The kit is one sellable pack per shortlisted supplement, the
 * review's own quality tags first and price only as the tie-break, filled
 * priority-first inside a monthly rupee figure the citizen saves on their
 * Training Profile. What does not fit is dropped from the end and NAMED.
 */
const P = (id: string, supplement: string, priceInr: number, tags: string[] = []): Product => ({
  id, supplement, brand: 'B', name: id, priceInr, tags, rx: false, pack: 'bottle-soft', colour: '#000', retailer: 'R', url: 'https://x',
});

const shelf: Product[] = [
  P('om-cheap', 'omega3', 359, ['Partly verified']),
  P('om-mid', 'omega3', 749, ['Heavy-metal tested']),
  P('om-dear', 'omega3', 1350, ['Vegan', 'Published CoA']),
  P('om-rx', 'omega3', 200, []), // made unsellable below
  P('d-cheap', 'vitd', 199, []),
  P('d-good', 'vitd', 420, ['Third-party tested']),
  P('mg-only', 'magnesium', 640, ['Glycinate']),
  P('zn-nop', 'zinc', 0, []),
];
shelf[3].rx = true;
shelf[7].priceInr = undefined;

const recs = [
  { id: 'vitd', bucket: 'priority', name: 'Vitamin D3' },
  { id: 'omega3', bucket: 'consider', name: 'Omega-3' },
  { id: 'magnesium', bucket: 'consider', name: 'Magnesium' },
  { id: 'zinc', bucket: 'consider', name: 'Zinc' },
  { id: 'psyllium', bucket: 'optional', name: 'Psyllium' },
  { id: 'multi', bucket: 'not-recommended', name: 'Multivitamin' },
];

describe('quality is the review’s tags, not the price', () => {
  it('a tested pack outranks an unverified one whatever they cost', () => {
    expect(quality(P('a', 'x', 1, ['Third-party tested', 'Vegan']))).toBe(2);
    expect(quality(P('b', 'x', 1, ['Partly verified', 'Composition unverified']))).toBe(-2);
    expect(ranked(shelf.filter((p) => p.supplement === 'omega3')).map((p) => p.id)).toEqual(['om-mid', 'om-dear', 'om-cheap']);
  });
  it('equal quality: cheaper first; unsellable packs are never candidates', () => {
    expect(ranked([P('x', 's', 900, ['GMP']), P('y', 's', 500, ['ISO 22000'])]).map((p) => p.id)).toEqual(['y', 'x']);
    expect(ranked(shelf.filter((p) => p.supplement === 'omega3')).some((p) => p.id === 'om-rx')).toBe(false);
  });
});

describe('the kit without a budget', () => {
  it('is one best pack per shortlisted supplement — optional and refused never enter it', () => {
    const kit = buildKit(recs, shelf, null);
    expect(kit.budgetInr).toBeNull();
    expect(kit.picks.map((p) => [p.supplement, p.productId])).toEqual([
      ['vitd', 'd-good'], ['omega3', 'om-mid'], ['magnesium', 'mg-only'],
    ]);
    expect(kit.totalInr).toBe(420 + 749 + 640);
    expect(kit.dropped).toEqual([]);
    expect(kit.note).toBe(KIT_NOTE);
  });
  it('a supplement with nothing sellable under it has no pick and is not called "dropped for budget"', () => {
    const kit = buildKit(recs, shelf, null);
    expect(kit.picks.some((p) => p.supplement === 'zinc')).toBe(false);
    expect(kit.dropped).toEqual([]);
  });
});

describe('the kit inside a budget', () => {
  it('spends up to the cap while reserving the cheapest pack for everything still to come', () => {
    // floor = 199 + 359 + 640 = 1198. With ₹1,800: D3 takes d-good (420) since
    // 1800-0-(359+640)=801 ≥ 420; omega-3 has 1800-420-640=740 → om-cheap (359,
    // the only one ≤ 740 — om-mid is 749); magnesium takes the rest.
    const kit = buildKit(recs, shelf, 1800);
    expect(kit.picks.map((p) => p.productId)).toEqual(['d-good', 'om-cheap', 'mg-only']);
    expect(kit.totalInr).toBe(420 + 359 + 640);
    expect(kit.totalInr).toBeLessThanOrEqual(1800);
    expect(kit.dropped).toEqual([]);
  });
  it('a roomier number buys the better omega-3 rather than a second bottle of anything', () => {
    const kit = buildKit(recs, shelf, 2200);
    expect(kit.picks.map((p) => p.productId)).toEqual(['d-good', 'om-mid', 'mg-only']);
  });
  it('when the cheapest of everything does not fit, the LAST supplements are dropped and named with the price that brings them back', () => {
    const kit = buildKit(recs, shelf, 500);
    expect(kit.picks.map((p) => p.productId)).toEqual(['d-good']); // 420 ≤ 500, once the rest is gone
    expect(kit.dropped).toEqual([
      { supplement: 'omega3', name: 'Omega-3', cheapestInr: 359 },
      { supplement: 'magnesium', name: 'Magnesium', cheapestInr: 640 },
    ]);
  });
  it('a tight number buys the cheap pack of each before it drops anything', () => {
    // floor 1198 > 700 → magnesium goes; 199 + 359 = 558 fits, so both stay, cheap.
    const kit = buildKit(recs, shelf, 700);
    expect(kit.picks.map((p) => p.productId)).toEqual(['d-cheap', 'om-cheap']);
    expect(kit.dropped.map((d) => d.supplement)).toEqual(['magnesium']);
  });
  it('priority is the last thing to go', () => {
    const kit = buildKit(recs, shelf, 100);
    expect(kit.picks).toEqual([]);
    expect(kit.dropped.map((d) => d.supplement)).toEqual(['vitd', 'omega3', 'magnesium']);
  });
  it('zero is a cap of nothing, not "no cap"', () => {
    expect(buildKit(recs, shelf, 0).picks).toEqual([]);
    expect(buildKit(recs, shelf, null).picks.length).toBe(3);
  });
});

describe('the real shelf', () => {
  it('every product resolves to at most one pick per supplement, and the kit never exceeds the number', () => {
    const all = [...new Set(PRODUCTS.map((p) => p.supplement))].map((id) => ({ id, bucket: 'consider', name: id }));
    for (const cap of [500, 2000, 5000, 20000]) {
      const kit = buildKit(all, PRODUCTS, cap);
      expect(kit.totalInr).toBeLessThanOrEqual(cap);
      expect(new Set(kit.picks.map((p) => p.supplement)).size).toBe(kit.picks.length);
    }
  });
});

describe('the store carries the kit, and the budget is the citizen’s to set', () => {
  it('store() computes the kit beside the badges, from the saved budget, and null when there is no plan', async () => {
    const svc: any = Object.create(SupplementsService.prototype);
    svc.plan = async () => ({ gated: false, plan: [{ id: 'omega-3', bucket: 'consider', name: 'Omega-3', why: [], needsClinician: false }], basis: {} });
    svc.prisma = { fitnessProfile: { findUnique: async () => ({ supplementBudgetInr: 800 }) } };
    const out = await svc.store('u1');
    expect(out.kit.budgetInr).toBe(800);
    expect(out.kit.picks).toHaveLength(1);
    expect(out.kit.picks[0].supplement).toBe('omega-3');
    expect(out.kit.picks[0].priceInr).toBeLessThanOrEqual(800);

    svc.plan = async () => ({ gated: true, plan: [], basis: {} });
    expect((await svc.store('u1')).kit).toBeNull();
  });
  it('setBudget upserts the number without touching answeredAt', async () => {
    const svc: any = Object.create(SupplementsService.prototype);
    const calls: unknown[] = [];
    svc.prisma = { fitnessProfile: { upsert: async (a: unknown) => { calls.push(a); return {}; } } };
    expect(await svc.setBudget('u1', 1500)).toEqual({ monthlyInr: 1500 });
    expect(calls[0]).toEqual({ where: { userId: 'u1' }, create: { userId: 'u1', supplementBudgetInr: 1500 }, update: { supplementBudgetInr: 1500 } });
    expect(JSON.stringify(calls[0])).not.toMatch(/answeredAt/);
  });
  it('the route is a PUT of the whole value and null clears it', () => {
    const ctrl = readFileSync(join(__dirname, '..', 'fitness.controller.ts'), 'utf8');
    expect(ctrl).toMatch(/@Put\('store\/budget'\)/);
    const dto = readFileSync(join(__dirname, '..', 'dto', 'supplements.dto.ts'), 'utf8');
    expect(dto).toMatch(/monthlyInr: z\.number\(\)\.int\(\)\.min\(0\)\.max\(100000\)\.nullable\(\)/);
  });
});
