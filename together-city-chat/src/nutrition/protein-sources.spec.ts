import { tagsForIngredient } from './diet-tags';
import {
  PROTEIN_SOURCES, SCREENED_DIETS, complementaryPairsFor, gramsForProtein, proteinSourcesFor,
} from './protein-sources';

/**
 * p9, restated as a test: a vegetarian or Jain diner is never offered meat or
 * egg protein. Asserted through the shared screen rather than against a
 * hand-kept list, so adding a source cannot quietly leak one.
 */
describe('what a citizen is offered', () => {
  it('never offers meat, fish or egg to a vegetarian', () => {
    for (const diet of ['veg', 'vegetarian']) {
      const groups = proteinSourcesFor(diet).map((s) => s.group);
      expect(groups).not.toContain('meat');
      expect(groups).not.toContain('fish');
      expect(groups).not.toContain('egg');
    }
  });

  it('never offers meat, fish, egg or dairy to a vegan', () => {
    const groups = proteinSourcesFor('vegan').map((s) => s.group);
    for (const g of ['meat', 'fish', 'egg', 'dairy']) expect(groups).not.toContain(g);
  });

  it('never offers meat, fish or egg to a Jain — and does offer dairy', () => {
    const sources = proteinSourcesFor('jain');
    const groups = sources.map((s) => s.group);
    for (const g of ['meat', 'fish', 'egg']) expect(groups).not.toContain(g);
    // Jain is not a stricter vegan. Paneer and curd belong on a Jain plate.
    expect(groups).toContain('dairy');
  });

  it('offers fish but not meat to a pescatarian', () => {
    const groups = proteinSourcesFor('pesc').map((s) => s.group);
    expect(groups).toContain('fish');
    expect(groups).not.toContain('meat');
  });

  it('offers egg to an eggetarian but still no meat', () => {
    const groups = proteinSourcesFor('egg').map((s) => s.group);
    expect(groups).toContain('egg');
    expect(groups).not.toContain('meat');
    expect(groups).not.toContain('fish');
  });

  it('offers everything to a non-vegetarian', () => {
    expect(proteinSourcesFor('nonveg')).toHaveLength(PROTEIN_SOURCES.length);
  });
});

describe('the list is worth having, not just safe', () => {
  it('leaves every restricted diet with real options', () => {
    // A filter that returns nothing passes every safety assertion above.
    for (const diet of SCREENED_DIETS) {
      expect([diet, proteinSourcesFor(diet).length > 8]).toEqual([diet, true]);
    }
  });

  it('gives even a vegan several dense sources', () => {
    const dense = proteinSourcesFor('vegan').filter((s) => s.proteinPer100g >= 18);
    expect(dense.length).toBeGreaterThan(5);
  });

  it('ranks by protein density, richest first', () => {
    const v = proteinSourcesFor('vegan').map((s) => s.proteinPer100g);
    expect(v).toEqual([...v].sort((a, b) => b - a));
    expect(proteinSourcesFor('vegan')[0].key).toBe('soya-chunks');
  });
});

describe('the table itself', () => {
  it('has no duplicate keys', () => {
    const keys = PROTEIN_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('states a plausible protein figure for every source', () => {
    for (const s of PROTEIN_SOURCES) {
      expect([s.key, s.proteinPer100g > 0 && s.proteinPer100g <= 60]).toEqual([s.key, true]);
    }
  });

  it('marks dry weights, because that is the number that misleads', () => {
    // Dals and grains are listed dry and roughly treble when cooked. A plan
    // that treats 100 g dry dal as 100 g of what lands on the plate overstates
    // its protein about threefold.
    for (const key of ['toor', 'moong', 'rajma', 'soya-chunks', 'quinoa']) {
      expect([key, PROTEIN_SOURCES.find((s) => s.key === key)?.dry]).toEqual([key, true]);
    }
    // Things eaten as-is are not marked.
    for (const key of ['paneer', 'tofu', 'egg', 'milk']) {
      expect([key, PROTEIN_SOURCES.find((s) => s.key === key)?.dry]).toEqual([key, undefined]);
    }
  });

  it('names an ingredient the diet screen can actually read', () => {
    // If a source's ingredient string matched nothing, it would pass every
    // diet unnoticed — the animal ones are the proof the screen is engaged.
    for (const key of ['chicken', 'fish', 'egg', 'paneer', 'milk']) {
      const s = PROTEIN_SOURCES.find((x) => x.key === key);
      expect([key, tagsForIngredient(s?.ingredient ?? '').length > 0]).toEqual([key, true]);
    }
  });
});

describe('complementary pairing', () => {
  it('pairs a pulse with a cereal, and says why', () => {
    const pairs = complementaryPairsFor('vegan');
    expect(pairs.length).toBeGreaterThan(3);
    const dalGrain = pairs.find((p) => p.a.group === 'dal' && (p.b.group === 'grain' || p.b.group === 'millet'));
    expect(dalGrain).toBeDefined();
    expect(dalGrain?.why).toMatch(/complete protein/);
  });

  it('only ever pairs things this citizen may eat', () => {
    for (const diet of SCREENED_DIETS) {
      const allowed = new Set(proteinSourcesFor(diet).map((s) => s.key));
      for (const p of complementaryPairsFor(diet)) {
        expect([diet, allowed.has(p.a.key) && allowed.has(p.b.key)]).toEqual([diet, true]);
      }
    }
  });

  it('does not pair a source with itself, or list a pair twice', () => {
    const pairs = complementaryPairsFor('vegetarian');
    for (const p of pairs) expect(p.a.key).not.toBe(p.b.key);
    const seen = pairs.map((p) => [p.a.key, p.b.key].sort().join('+'));
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('gramsForProtein', () => {
  it('answers the question a plate actually asks', () => {
    const soya = PROTEIN_SOURCES.find((s) => s.key === 'soya-chunks');
    const curd = PROTEIN_SOURCES.find((s) => s.key === 'curd');
    if (!soya || !curd) throw new Error('missing fixture');
    // 20 g of protein: ~38 g of dry soya chunks, or ~571 g of curd. The gap is
    // the whole reason a plant-based plan needs the dense sources named.
    expect(gramsForProtein(soya, 20)).toBe(38);
    expect(gramsForProtein(curd, 20)).toBe(571);
  });
});
