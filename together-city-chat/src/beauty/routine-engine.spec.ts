import { buildRoutines } from './routine-engine';
import type { RecommendedProduct } from './beauty-engine';

/**
 * A routine is an order and a set of warnings. Both are the point.
 */

const product = (over: Partial<RecommendedProduct> & { id: string; category: string; usage: string }): RecommendedProduct => ({
  name: over.id, brand: 'A Brand', group: 'Skincare', tier: 'Budget', priceInr: 900, tags: [], profileKeys: [],
  suitableSkin: ['all'], actives: [], blurb: '', keyIngredient: '', ingredients: [], ingredientsSource: 'sheet',
  image: '', imageAlt: '', productUrl: '', matched: true,
  ...over,
} as RecommendedProduct);

const morningOf = (rs: ReturnType<typeof buildRoutines>) => rs.find((r) => r.timeOfDay === 'morning')!;
const eveningOf = (rs: ReturnType<typeof buildRoutines>) => rs.find((r) => r.timeOfDay === 'evening')!;
const weeklyOf = (rs: ReturnType<typeof buildRoutines>) => rs.find((r) => r.timeOfDay === 'weekly')!;
const bodyOf = (rs: ReturnType<typeof buildRoutines>) => rs.find((r) => r.timeOfDay === 'body')!;

describe('the order things go on in', () => {
  it('cleanses first and protects last', () => {
    const routines = buildRoutines([
      product({ id: 'spf', category: 'Sunscreen', usage: 'Morning' }),
      product({ id: 'cream', category: 'Moisturiser', usage: 'Morning & Night' }),
      product({ id: 'wash', category: 'Cleanser', usage: 'Morning & Night' }),
      product({ id: 'serum', category: 'Serum', usage: 'Morning' }),
    ]);
    expect(morningOf(routines).steps.map((s) => s.productId)).toEqual(['wash', 'serum', 'cream', 'spf']);
  });

  it('numbers steps 1..n after sorting, not by internal rank', () => {
    const routines = buildRoutines([
      product({ id: 'spf', category: 'Sunscreen', usage: 'Morning' }),
      product({ id: 'wash', category: 'Cleanser', usage: 'Morning' }),
    ]);
    expect(morningOf(routines).steps.map((s) => s.order)).toEqual([1, 2]);
  });

  it('is deterministic when two products share a slot', () => {
    const a = buildRoutines([product({ id: 'b', name: 'B Serum', category: 'Serum', usage: 'Morning' }), product({ id: 'a', name: 'A Serum', category: 'Serum', usage: 'Morning' })]);
    const b = buildRoutines([product({ id: 'a', name: 'A Serum', category: 'Serum', usage: 'Morning' }), product({ id: 'b', name: 'B Serum', category: 'Serum', usage: 'Morning' })]);
    expect(morningOf(a).steps.map((s) => s.productId)).toEqual(morningOf(b).steps.map((s) => s.productId));
  });
});

describe('which routine a product lands in', () => {
  it('puts a Morning & Night product in both', () => {
    const r = buildRoutines([product({ id: 'x', category: 'Serum', usage: 'Morning & Night' })]);
    expect(morningOf(r).steps).toHaveLength(1);
    expect(eveningOf(r).steps).toHaveLength(1);
  });

  it('keeps a Night product out of the morning', () => {
    const r = buildRoutines([product({ id: 'x', category: 'Treatment', usage: 'Night' })]);
    expect(morningOf(r).steps).toHaveLength(0);
    expect(eveningOf(r).steps).toHaveLength(1);
  });

  it('sends a Weekly product to the weekly routine only', () => {
    const r = buildRoutines([product({ id: 'mask', category: 'Hair mask', usage: 'Weekly' })]);
    expect(weeklyOf(r).steps).toHaveLength(1);
    expect(morningOf(r).steps).toHaveLength(0);
    // "Once a week" stopped being true when shampoo joined this band: you wash
    // your hair when you wash it, and the band is named for the day, not a count.
    expect(weeklyOf(r).steps[0].frequency).toBe('On wash day');
  });

  it('sends a Body product to the body band and nowhere else', () => {
    const r = buildRoutines([product({ id: 'lotion', category: 'Body lotion', usage: 'Body' })]);
    expect(bodyOf(r).steps).toHaveLength(1);
    expect([morningOf(r).steps.length, eveningOf(r).steps.length, weeklyOf(r).steps.length]).toEqual([0, 0, 0]);
  });

  it('washes, then conditions, then finishes — hair has its own order', () => {
    const r = buildRoutines([
      product({ id: 'cond', name: 'C', category: 'Conditioner', usage: 'Weekly' }),
      product({ id: 'serum', name: 'S', category: 'Hair serum', usage: 'Weekly' }),
      product({ id: 'oil', name: 'O', category: 'Hair oil', usage: 'Weekly' }),
      product({ id: 'poo', name: 'P', category: 'Shampoo', usage: 'Weekly' }),
    ]);
    expect(weeklyOf(r).steps.map((s) => s.productId)).toEqual(['oil', 'poo', 'cond', 'serum']);
  });

  it('ignores products the engine did not match to this person', () => {
    // A shelf suggestion is not something to tell somebody to put on their face.
    const r = buildRoutines([product({ id: 'x', category: 'Serum', usage: 'Morning', matched: false })]);
    expect(morningOf(r).steps).toHaveLength(0);
  });

  it('always returns all four bands, even when empty', () => {
    const r = buildRoutines([]);
    expect(r.map((x) => x.timeOfDay)).toEqual(['morning', 'evening', 'weekly', 'body']);
    expect(r.every((x) => x.steps.length === 0)).toBe(true);
  });
});

describe('the warnings that matter', () => {
  const retinoid = product({ id: 'ret', name: 'Retinal 0.05% Night', category: 'Treatment', usage: 'Night', keyIngredient: 'Retinaldehyde', actives: ['Retinaldehyde 0.05%'] });

  it('warns that a retinoid is not for pregnancy', () => {
    const r = buildRoutines([retinoid]);
    expect(eveningOf(r).steps[0].warnings.join(' ')).toMatch(/pregnan/i);
  });

  it('tells you to build a retinoid up slowly', () => {
    const r = buildRoutines([retinoid]);
    expect(eveningOf(r).steps[0].warnings.join(' ')).toMatch(/twice a week/i);
  });

  it('flags an exfoliant as making you burn more easily', () => {
    const r = buildRoutines([product({ id: 'bha', name: 'Tonic', category: 'Haircare', usage: 'Morning', actives: ['Salicylic acid'] })]);
    expect(morningOf(r).steps[0].warnings.join(' ')).toMatch(/sun sensitivity/i);
  });

  it('says so when a morning routine has no sunscreen', () => {
    // The commonest way a good routine is wasted.
    const r = buildRoutines([product({ id: 'serum', category: 'Serum', usage: 'Morning' })]);
    expect(morningOf(r).notes.join(' ')).toMatch(/no sunscreen/i);
  });

  it('says nothing about sunscreen when there is some', () => {
    const r = buildRoutines([
      product({ id: 'serum', category: 'Serum', usage: 'Morning' }),
      product({ id: 'spf', category: 'Sunscreen', usage: 'Morning' }),
    ]);
    expect(morningOf(r).notes.join(' ')).not.toMatch(/no sunscreen/i);
  });

  it('does not nag about sunscreen in an empty morning routine', () => {
    const r = buildRoutines([product({ id: 'x', category: 'Treatment', usage: 'Night' })]);
    expect(morningOf(r).notes).toEqual([]);
  });

  it('separates vitamin C from a retinoid rather than layering them', () => {
    const r = buildRoutines([
      product({ id: 'vitc', name: 'Vitamin C 15% Serum', category: 'Serum', usage: 'Morning', actives: ['L-ascorbic acid 15%'] }),
      retinoid,
    ]);
    const notes = [...morningOf(r).notes, ...eveningOf(r).notes].join(' ');
    expect(notes).toMatch(/vitamin c in the morning and the retinoid at night/i);
  });

  it('warns when too many actives arrive at once', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) => product({ id, name: `${id} serum`, category: 'Serum', usage: 'Morning' }));
    expect(morningOf(buildRoutines(many)).notes.join(' ')).toMatch(/one at a time/i);
  });
});
