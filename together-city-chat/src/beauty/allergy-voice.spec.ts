import { assessBeauty } from './beauty-analysis';
import { topicalExclusions } from '../shared/topical-sensitivities';

/**
 * Beauty says what its sensitivity rule did. (K5.66, the second half.)
 *
 * The filtering has been correct since the substring test was replaced. What it
 * has never done is mention itself — a citizen sees a shorter shelf and a
 * routine with a step missing and cannot tell our rule from our range.
 */

describe('what a declared sensitivity takes off the shelf', () => {
  const shelf = [
    { name: 'Almond Glow Serum', ingredients: ['almond oil', 'vitamin e'] },
    { name: 'Ceramide Cream', ingredients: ['ceramides', 'glycerin'] },
    { name: 'Marzipan Lip Balm', ingredients: ['shea butter'] },
  ];

  it('counts what went and names what the citizen typed', () => {
    const cut = topicalExclusions(shelf, ['tree nuts']);
    expect(cut.removed).toBe(2);              // almond oil, and marzipan
    expect(cut.matched).toEqual(['tree nuts']); // NOT "treenut", the family key
    expect(cut.examples).toContain('Almond Glow Serum');
  });

  it('nothing declared, nothing counted', () => {
    expect(topicalExclusions(shelf, [])).toEqual({ matched: [], removed: 0, examples: [] });
  });

  it('a declaration that hits nothing is not reported as if it had', () => {
    expect(topicalExclusions(shelf, ['parabens']).removed).toBe(0);
  });
});

describe('the assessment caution is an event, not a profile fact', () => {
  const base = {
    skinType: 'oily', skinGoals: ['oil control'], skinConcerns: ['acne'],
    hairType: 'straight', hairGoals: [], hairConcerns: [],
  };
  const cautions = (p: Parameters<typeof assessBeauty>[0]) => assessBeauty(p).cautions.join(' | ');

  it('speaks when a declared sensitivity actually changed a suggestion', () => {
    // Salicylic acid is what an oily/acne profile is otherwise handed.
    const said = cautions({ ...base, allergies: ['salicylates'] });
    expect(said).toContain('Some suggestions were changed because you told us about salicylates');
  });

  it('stays quiet when a declared sensitivity changed nothing here', () => {
    // Declared, honoured, and irrelevant to this profile's suggestions. The old
    // line fired on the mere presence of the declaration, which said something
    // true about the profile and something unproven about this assessment.
    const said = cautions({ ...base, allergies: ['shellfish'] });
    expect(said).not.toContain('you told us about');
    // The discriminator: the old line was "Avoiding your flagged sensitivities:
    // shellfish." and fired here. Naming the term is what must not happen.
    expect(said).not.toContain('shellfish');
    expect(said).not.toContain('sensitivities');
  });

  it('says nothing at all when nothing was declared', () => {
    expect(cautions({ ...base })).not.toContain('you told us about');
  });
});
