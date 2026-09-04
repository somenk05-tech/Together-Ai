import { everythingIn, type BeautyProduct } from './beauty-engine';
import { isTopicallySafe, topicalExclusions } from '../shared/topical-sensitivities';
import { isSafeForConditions } from '../shared/topical-contraindications';
import { matchProducts } from './look-decode';

/**
 * The safety guards read the whole ingredient list, not only the actives.
 *
 * WHY (owner, 3 Sep: "is there a security grid for allergies and pregnancy").
 * There is — two of them, and both were reading `[...actives, keyIngredient]`
 * while the card had just started printing `ingredients`, a longer list. A
 * fragrance or a paraben named on the printed list but not among the two or
 * three actives passed a filter commented "hard filter". What the card shows,
 * the guard must read; this spec holds the two lists to one source.
 */

const base: Pick<BeautyProduct, 'actives' | 'keyIngredient' | 'ingredients'> = {
  actives: ['Niacinamide', 'Zinc PCA'], keyIngredient: 'Niacinamide',
  ingredients: ['Aqua', 'Niacinamide', 'Zinc PCA', 'Linalool', 'Limonene', 'Phenoxyethanol'],
};

describe('everythingIn()', () => {
  it('is the actives, the headline ingredient and the printed list, together', () => {
    expect(everythingIn(base)).toEqual(['Niacinamide', 'Zinc PCA', 'Niacinamide', 'Aqua', 'Niacinamide', 'Zinc PCA', 'Linalool', 'Limonene', 'Phenoxyethanol']);
  });
  it('survives a row with no printed list yet', () => {
    expect(everythingIn({ ...base, ingredients: undefined as unknown as string[] })).toEqual(['Niacinamide', 'Zinc PCA', 'Niacinamide']);
  });
});

describe('an allergen that is only on the printed list', () => {
  it('is still refused by the sensitivity guard', () => {
    // Linalool and limonene are fragrance allergens; neither is an active.
    expect(isTopicallySafe('Calm Serum', [...base.actives, base.keyIngredient], ['fragrance'])).toBe(true);   // the old read
    expect(isTopicallySafe('Calm Serum', everythingIn(base), ['fragrance'])).toBe(false);                     // the new one
  });

  it('is counted in the sentence that says the shelf is shorter', () => {
    const cut = topicalExclusions([{ name: 'Calm Serum', ingredients: everythingIn(base) }], ['fragrance']);
    expect(cut.removed).toBe(1);
  });

  it('is refused by the makeup matcher too', () => {
    const shelf = [{ id: 'x', name: 'Calm Serum', category: 'Serum', suitableSkin: ['all'], actives: base.actives, ingredients: base.ingredients }];
    const steps = [{ order: 1, step: 'Serum', how: '', categories: ['Serum'] }];
    const open = matchProducts(steps as never, shelf, { allergies: [] } as never);
    const cut = matchProducts(steps as never, shelf, { allergies: ['fragrance'] } as never);
    expect(open.length).toBeGreaterThan(cut.length);
  });
});

describe('a retinoid that is only on the printed list', () => {
  it('is still refused for a pregnant citizen', () => {
    const p = { actives: ['Peptides'], keyIngredient: 'Peptides', ingredients: ['Aqua', 'Retinyl Palmitate', 'Glycerin'] };
    expect(isSafeForConditions('Firm Cream', [...p.actives, p.keyIngredient], ['pregnancy'])).toBe(true);
    expect(isSafeForConditions('Firm Cream', everythingIn(p), ['pregnancy'])).toBe(false);
  });
});
