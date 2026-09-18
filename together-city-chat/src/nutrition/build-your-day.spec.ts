import {
  readDay, nextSlot, priorities, portionFor, scoreForNow, recommend, proteinFixes, advise, whatToDoNext,
  PORTION_MIN, SUPPLEMENT_THRESHOLD_G, type NutrientLine,
} from './build-your-day';
import type { PoolRecipe } from './meal-composer';

/**
 * Step 03 is a closed loop: the profile decides what is eligible, the day's
 * food decides what is still needed, and what is still needed decides what is
 * recommended next. These are the rules of that loop, each pinned to a number
 * the owner's brief used.
 */
const TARGETS = { kcal: 2050, protein: 125, carb: 210, fat: 65, fiber: 30 };
const EMPTY = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

const recipe = (id: string, cats: string[], m: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }, extra: Partial<PoolRecipe> = {}): PoolRecipe => ({
  id, name: id, cuisine: 'Indian', categories: cats, role: 'main',
  ...m, minutes: 20, grams: 250, diet: 'nonveg',
  ingredients: [{ name: 'Chicken', grams: 150 }],
  nutrients: { sodiumMg: 200, potassiumMg: 300, phosphorusMg: 150, sugarG: 2, addedSugarG: 0, satFatG: 3 },
  nutrientComplete: true, steps: [], imageUrl: null, ...extra,
} as unknown as PoolRecipe);

const by = (lines: NutrientLine[]) => Object.fromEntries(lines.map((l) => [l.key, l])) as Record<string, NutrientLine>;

describe('readDay — three words, not one', () => {
  it('calls calories a budget, protein and fibre targets, fat and carbohydrate ranges', () => {
    const l = by(readDay(TARGETS, EMPTY).lines);
    expect(l.kcal.kind).toBe('budget');
    expect(l.protein.kind).toBe('target');
    expect(l.fiber.kind).toBe('target');
    expect(l.fat.kind).toBe('range');
    expect(l.carbs.kind).toBe('range');
    expect(l.kcal.kindLabel).toBe('Estimated daily energy budget');
    expect(l.fat.kindLabel).toBe('Target range');
  });
  it('states the brief\'s numbers: 1,780 / 2,050 leaves 270; 83 / 125 g protein leaves 42 g', () => {
    const r = readDay(TARGETS, { kcal: 1780, protein: 83, carbs: 186, fat: 74, fiber: 18 });
    expect(r.remaining).toEqual({ kcal: 270, protein: 42, carbs: 24, fat: -9, fiber: 12 });
    const l = by(r.lines);
    expect(l.protein.said).toBe('42g remaining');
    expect(l.fiber.said).toBe('12g remaining');
    expect(l.kcal.said).toBe('270 kcal left');
  });
  it('says over when the budget is passed — 2,340 / 2,050 is 290 kcal over', () => {
    const l = by(readDay(TARGETS, { ...EMPTY, kcal: 2340 }).lines);
    expect(l.kcal.status).toBe('over');
    expect(l.kcal.said).toBe('290 kcal over');
  });
  it('a range is ±15%: 74 g fat against 65 is above the 75 g ceiling only past it', () => {
    expect(by(readDay(TARGETS, { ...EMPTY, fat: 74 }).lines).fat.status).toBe('ok');
    const over = by(readDay(TARGETS, { ...EMPTY, fat: 82 }).lines).fat;
    expect(over.status).toBe('over');
    expect(over.high).toBe(75);
    expect(over.said).toBe('7g above your range');
  });
  it('a target counts as reached at 95% — 119 / 125 g protein is not a gap worth a sentence', () => {
    expect(by(readDay(TARGETS, { ...EMPTY, protein: 119 }).lines).protein.status).toBe('ok');
    expect(by(readDay(TARGETS, { ...EMPTY, protein: 110 }).lines).protein.status).toBe('under');
  });
});

describe('nextSlot — the clock decides today, order decides a day ahead', () => {
  it('at 7:30 pm with breakfast, lunch and the evening course eaten, dinner is next', () => {
    expect(nextSlot(['b', 'l', 'es'], '19:30').slot).toBe('d');
  });
  it('at 9 am with nothing eaten, breakfast is next and its window is open', () => {
    const n = nextSlot([], '09:00');
    expect(n.slot).toBe('b');
    expect(n.open).toBe(true);
  });
  it('at 11 am breakfast\'s window has closed, so lunch is next even with nothing eaten', () => {
    expect(nextSlot([], '11:00').slot).toBe('l');
  });
  it('a day ahead has no clock: the first empty course in order', () => {
    expect(nextSlot(['b'], null).slot).toBe('l');
    expect(nextSlot(['b', 'l', 'es', 'd'], null).slot).toBe('d');
  });
});

describe('priorities — read off the gaps, in the order the page leads with', () => {
  it('protein short and fat over → protein first, then lower fat', () => {
    const p = priorities(readDay(TARGETS, { kcal: 1500, protein: 60, carbs: 150, fat: 90, fiber: 25 }).lines);
    expect(p).toEqual(['protein', 'fibre', 'lower-fat']);
  });
  it('a day that lands with the budget nearly spent has one priority: keep it light', () => {
    expect(priorities(readDay(TARGETS, { kcal: 2000, protein: 125, carbs: 210, fat: 65, fiber: 30 }).lines)).toEqual(['light']);
  });
  it('a day half-way through with everything on track has nothing to correct', () => {
    expect(priorities(readDay(TARGETS, { kcal: 1200, protein: 120, carbs: 200, fat: 60, fiber: 29 }).lines)).toEqual([]);
  });
  it('over the budget is light', () => {
    expect(priorities(readDay(TARGETS, { kcal: 2340, protein: 125, carbs: 210, fat: 65, fiber: 30 }).lines)).toEqual(['light']);
  });
});

describe('portionFor — the dish is scaled to what is left, not the other way round', () => {
  it('a 540 kcal tikka against 350 kcal left is served at 60%', () => {
    const r = recipe('tikka', ['dinner'], { kcal: 540, protein: 48, carbs: 12, fat: 22, fiber: 3 });
    expect(portionFor(r, 350)).toEqual({ pct: 60, fits: true });
  });
  it('a dish that fits whole is served whole', () => {
    const r = recipe('salad', ['dinner'], { kcal: 200, protein: 8, carbs: 20, fat: 8, fiber: 6 });
    expect(portionFor(r, 680).pct).toBe(100);
  });
  it(`below ${PORTION_MIN}% it stops being a meal — says it does not fit`, () => {
    const r = recipe('biryani', ['dinner'], { kcal: 800, protein: 30, carbs: 90, fat: 30, fiber: 4 });
    expect(portionFor(r, 200)).toEqual({ pct: PORTION_MIN, fits: false });
    expect(portionFor(r, 0).fits).toBe(false);
  });
});

describe('recommend — nutrition requirement → recipe', () => {
  const pool = [
    recipe('Chicken Tikka + Salad', ['dinner'], { kcal: 540, protein: 48, carbs: 12, fat: 22, fiber: 6 }),
    recipe('Butter Naan', ['dinner', 'side'], { kcal: 320, protein: 8, carbs: 50, fat: 10, fiber: 2 }),
    recipe('Gulab Jamun', ['dessert'], { kcal: 350, protein: 4, carbs: 60, fat: 12, fiber: 0 }),
    recipe('Poha', ['breakfast'], { kcal: 250, protein: 6, carbs: 45, fat: 6, fiber: 3 }),
  ];
  const ctxAt730pm = () => {
    const lines = readDay(TARGETS, { kcal: 1370, protein: 82, carbs: 170, fat: 50, fiber: 18 }).lines;
    return { remaining: readDay(TARGETS, { kcal: 1370, protein: 82, carbs: 170, fat: 50, fiber: 18 }).remaining, targets: TARGETS, priorities: priorities(lines), slot: 'd' as const, prefs: { cuisines: ['Indian'], favourites: ['chicken'] } };
  };
  it('at 7:30 pm with 680 kcal and 43 g protein left, the tikka comes first, whole, and says why', () => {
    const [top] = recommend(pool, ctxAt730pm(), 3);
    expect(top.component.name).toBe('Chicken Tikka + Salad');
    expect(top.portionPct).toBe(100);
    expect(top.why).toMatch(/closes your protein gap/);
    expect(top.why).toMatch(/inside what is left of your calorie budget/);
  });
  it('only dishes of the course being filled are offered — breakfast poha is not a dinner', () => {
    const names = recommend(pool, ctxAt730pm(), 4).map((r) => r.component.name);
    expect(names).not.toContain('Poha');
  });
  it('a dish that overruns the budget scores below one that fits', () => {
    const ctx = { ...ctxAt730pm(), remaining: { kcal: 300, protein: 43, carbs: 40, fat: 15, fiber: 12 } };
    const naan = recipe('naan', ['dinner'], { kcal: 320, protein: 8, carbs: 50, fat: 10, fiber: 2 });
    const dal = recipe('dal', ['dinner'], { kcal: 180, protein: 12, carbs: 24, fat: 4, fiber: 7 });
    expect(scoreForNow(dal, ctx)).toBeGreaterThan(scoreForNow(naan, ctx));
  });
});

describe('proteinFixes — real amounts of real food, computed to close THIS gap', () => {
  it('43 g short, non-veg: chicken 140 g closes it; eggs are counted, not weighed', () => {
    const fixes = proteinFixes(43, 'nonveg', []);
    const chicken = fixes.find((f) => f.name === 'Chicken breast')!;
    expect(chicken.amount).toBe('140 g');
    expect(chicken.proteinG).toBe(43);
    expect(chicken.closes).toBe(true);
    const eggs = fixes.find((f) => f.name === 'Eggs')!;
    expect(eggs.amount).toMatch(/eggs$/);
  });
  it('food first: below the threshold no supplement is listed at all', () => {
    expect(proteinFixes(SUPPLEMENT_THRESHOLD_G - 1, 'nonveg', []).some((f) => f.kind === 'supplement')).toBe(false);
  });
  it('a large gap names the supplement, after the food', () => {
    const fixes = proteinFixes(60, 'vegetarian', []);
    const idx = fixes.findIndex((f) => f.kind === 'supplement');
    expect(idx).toBeGreaterThan(0);
    expect(fixes.slice(0, idx).every((f) => f.kind === 'food')).toBe(true);
  });
  it('respects the diet: a vegan is never offered paneer, yogurt, eggs or whey', () => {
    const names = proteinFixes(60, 'vegan', []).map((f) => f.name);
    expect(names).not.toContain('Paneer');
    expect(names).not.toContain('Greek yogurt');
    expect(names).not.toContain('Eggs');
    expect(names).not.toContain('Whey protein');
    expect(names).toContain('Tofu');
    expect(names).toContain('Plant protein');
  });
  it('respects an allergy: no dairy means no paneer, yogurt or whey', () => {
    const names = proteinFixes(60, 'vegetarian', ['dairy']).map((f) => f.name);
    expect(names).not.toContain('Paneer');
    expect(names).not.toContain('Greek yogurt');
    expect(names).not.toContain('Whey protein');
    expect(names).toContain('Tofu');
  });
});

describe('advise — sentences from the numbers, never a score', () => {
  const opts = { diet: 'nonveg' as const, excluded: [], eatenAnything: true };
  it('over the budget: says how far, and helps rather than saying stop', () => {
    const [a] = advise(readDay(TARGETS, { kcal: 2340, protein: 125, carbs: 210, fat: 65, fiber: 30 }).lines, opts);
    expect(a.kind).toBe('over-budget');
    expect(a.headline).toBe('You\'re 290 kcal over your daily budget.');
    expect(a.body).not.toMatch(/stop eating/i);
    expect(a.options).toContain('Clear soup');
  });
  it('short on protein: the gap in grams and fixes that close it', () => {
    const a = advise(readDay(TARGETS, { kcal: 1500, protein: 82, carbs: 180, fat: 55, fiber: 30 }).lines, opts).find((x) => x.kind === 'protein')!;
    expect(a.headline).toBe('You need approximately 43 g more protein today.');
    expect(a.body).toMatch(/with food/);
    expect(a.fixes?.some((f) => f.closes)).toBe(true);
  });
  it('fat over: the next meal engine changes what it prioritises', () => {
    const a = advise(readDay(TARGETS, { kcal: 1600, protein: 125, carbs: 180, fat: 90, fiber: 30 }).lines, opts).find((x) => x.kind === 'fat')!;
    expect(a.headline).toMatch(/15 g above your range/);
    expect(a.priorities).toContain('lower-fat');
  });
  it('fibre short: the gap and the foods that bring it up', () => {
    const a = advise(readDay(TARGETS, { kcal: 1600, protein: 125, carbs: 180, fat: 60, fiber: 18 }).lines, opts).find((x) => x.kind === 'fibre')!;
    expect(a.headline).toBe('You\'re 12 g short on fibre.');
    expect(a.options?.some((o) => /Legumes/.test(o))).toBe(true);
  });
  it('a day that lands says so, once', () => {
    const all = advise(readDay(TARGETS, { kcal: 2000, protein: 125, carbs: 210, fat: 65, fiber: 30 }).lines, opts);
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe('done');
  });
  it('an empty day is a start, not a list of every gap', () => {
    const all = advise(readDay(TARGETS, EMPTY).lines, { ...opts, eatenAnything: false });
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe('start');
  });
});

describe('whatToDoNext', () => {
  it('reads the priorities as one instruction', () => {
    expect(whatToDoNext(['protein', 'fibre', 'lower-fat'])).toBe('Prioritise protein + fibre, keep fat low.');
    expect(whatToDoNext([])).toMatch(/Nothing to correct/);
  });
});
