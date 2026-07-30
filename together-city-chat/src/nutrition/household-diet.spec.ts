import { FORBIDDEN_BY_DIET, type DietKey } from './diet-tags';
import { householdForbids, normaliseDietKey, stricterThanOwner, strictestDiet } from './household-diet';

describe('normaliseDietKey', () => {
  it('accepts the spellings the column actually holds', () => {
    expect(normaliseDietKey('everything')).toBe('everything');
    expect(normaliseDietKey('non-veg')).toBe('everything');
    expect(normaliseDietKey('Non Vegetarian')).toBe('everything');
    expect(normaliseDietKey('eggetarian')).toBe('egg');
    expect(normaliseDietKey('VEG')).toBe('vegetarian');
    expect(normaliseDietKey(' vegan ')).toBe('vegan');
    expect(normaliseDietKey('jain')).toBe('jain');
    expect(normaliseDietKey('pescatarian')).toBe('pesc');
  });

  it('falls to vegetarian, never to everything, when it cannot read the value', () => {
    for (const bad of ['', null, undefined, 'keto', 'whatever', '???']) {
      expect(normaliseDietKey(bad)).toBe('vegetarian');
    }
  });
});

describe('strictestDiet', () => {
  it('leaves a household of one alone', () => {
    expect(strictestDiet(['everything'])).toBe('everything');
    expect(strictestDiet(['jain'])).toBe('jain');
  });

  it('one vegetarian at the table makes the plan vegetarian', () => {
    expect(strictestDiet(['everything', 'vegetarian'])).toBe('vegetarian');
    expect(strictestDiet(['everything', 'everything', 'veg', 'everything'])).toBe('vegetarian');
  });

  it('one Jain member makes the plan Jain', () => {
    expect(strictestDiet(['everything', 'jain'])).toBe('jain');
    expect(strictestDiet(['vegetarian', 'jain'])).toBe('jain');
  });

  it('a vegan and a Jain together give jainvegan, which nobody selects but the corpus has', () => {
    expect(strictestDiet(['vegan', 'jain'])).toBe('jainvegan');
    expect(strictestDiet(['everything', 'vegan', 'jain'])).toBe('jainvegan');
  });

  it('takes the stricter of two on the same axis', () => {
    expect(strictestDiet(['pesc', 'egg'])).toBe('egg');
    expect(strictestDiet(['egg', 'vegetarian'])).toBe('vegetarian');
    expect(strictestDiet(['vegetarian', 'vegan'])).toBe('vegan');
  });

  it('order never changes the answer', () => {
    const sets = [
      ['everything', 'jain', 'vegan'],
      ['pesc', 'vegetarian', 'everything'],
      ['egg', 'vegan'],
    ];
    for (const s of sets) {
      const first = strictestDiet(s);
      expect(strictestDiet([...s].reverse())).toBe(first);
      expect(strictestDiet([...s].sort())).toBe(first);
    }
  });

  it('is empty-safe', () => {
    expect(strictestDiet([])).toBe('everything');
  });

  /**
   * The property that matters, stated directly: whatever comes out must forbid
   * everything anybody at the table forbids. Any household of any two diets.
   */
  it('never returns a diet that permits something a member forbids', () => {
    const keys = Object.keys(FORBIDDEN_BY_DIET) as DietKey[];
    for (const a of keys) {
      for (const b of keys) {
        const chosen = FORBIDDEN_BY_DIET[strictestDiet([a, b])];
        for (const t of [...FORBIDDEN_BY_DIET[a], ...FORBIDDEN_BY_DIET[b]]) {
          expect(chosen).toContain(t);
        }
      }
    }
  });

  it('never returns a diet stricter than the table requires', () => {
    const keys = Object.keys(FORBIDDEN_BY_DIET) as DietKey[];
    for (const a of keys) {
      for (const b of keys) {
        const needed = householdForbids([a, b]);
        const chosen = FORBIDDEN_BY_DIET[strictestDiet([a, b])];
        // Everything it forbids beyond the union would be an unnecessary
        // restriction on the household — no meat for a table that eats meat.
        for (const t of chosen) expect([...needed]).toContain(t);
      }
    }
  });
});

describe('stricterThanOwner', () => {
  it('says nothing when the household eats the way the owner does', () => {
    expect(stricterThanOwner('everything', [{ name: 'Ravi', diet: 'everything' }])).toBeNull();
    expect(stricterThanOwner('vegetarian', [])).toBeNull();
    expect(stricterThanOwner('jain', [{ name: 'Ravi', diet: 'vegetarian' }])).toBeNull();
  });

  it('names the members whose diet moved the plan', () => {
    const r = stricterThanOwner('everything', [
      { name: 'Ravi', diet: 'everything' },
      { name: 'Meera', diet: 'jain' },
    ]);
    expect(r).not.toBeNull();
    expect(r!.diet).toBe('jain');
    expect(r!.because).toEqual(['Meera']);
  });

  it('names all of them when more than one did', () => {
    const r = stricterThanOwner('everything', [
      { name: 'Meera', diet: 'vegan' },
      { name: 'Anil', diet: 'jain' },
    ]);
    expect(r!.diet).toBe('jainvegan');
    expect(r!.because.sort()).toEqual(['Anil', 'Meera']);
  });
});

/**
 * The decision above is pure and well covered. What a pure test cannot catch is
 * the planner quietly going back to reading the owner's diet column — which is
 * how it was wrong in the first place, and would look like a one-line
 * simplification to anybody who did not know.
 */
describe('the household plan is built against the household diet', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const src: string = require('fs').readFileSync(require('path').join(__dirname, 'nutrition.service.ts'), 'utf8');

  const body = (signature: string) => {
    const at = src.indexOf(signature);
    if (at < 0) throw new Error(`${signature} has gone missing from nutrition.service.ts`);
    const end = src.indexOf('\n  }', at);
    return end < 0 ? src.slice(at) : src.slice(at, end);
  };

  it('generatePlan asks for the household constraints in family mode', () => {
    const b = body('private async generatePlan(');
    expect(b).toContain("mode === 'family'");
    expect(b).toContain('this.withHouseholdConstraints(');
    expect(b).toContain('h.diet');
  });

  it('composeFor does the same when it is composing for a household', () => {
    const b = body('private async composeFor(');
    expect(b).toContain('opts.household');
    expect(b).toContain('this.withHouseholdConstraints(');
    expect(b).toContain('householdDiet');
  });

  it('the household constraints include the members’ diets, not just their allergies', () => {
    const b = body('private async withHouseholdConstraints(');
    expect(b).toContain('strictestDiet(');
    expect(b).toContain('m.diet');
  });

  it('nothing is left calling the version that only merged allergies', () => {
    expect(src).not.toContain('withHouseholdAllergies');
  });
});
