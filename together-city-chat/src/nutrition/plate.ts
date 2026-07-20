/**
 * Indian thali "plate builder". Lunch and dinner are assembled as a complete
 * plate — the chosen main dish + a dal/secondary + a carb + a vegetable + curd
 * + salad — rather than a single recipe, so plans read like a real Indian meal.
 * Deterministic (seeded by the day) and diet/goal/diabetes-aware. No AI.
 */

export interface Macro { kcal: number; protein: number; carbs: number; fat: number; fiber: number }
export interface Comp extends Macro { role: 'main' | 'secondary' | 'carb' | 'vegetable' | 'dairy' | 'salad'; icon: string; name: string; portion: string }
export interface Plate { components: Comp[]; totals: Macro }

export interface PlateOpts {
  diet: string;               // everything | veg | nonveg | pesc | egg | vegan | jain
  goal: 'lose' | 'maintain' | 'gain';
  diabetes: boolean;          // trim refined carbs / rice
  dairy: boolean;             // include curd (false for vegan / lactose-free)
  jain: boolean;              // avoid onion in salad
}

type Item = { name: string; ref: number; per: 'g' | 'pc' | 'katori' | 'bowl'; m: Macro; veg: boolean; vegan: boolean };

// ── component library (nutrition at the reference portion `ref`) ──
const DALS: Item[] = [
  { name: 'Moong Dal', ref: 120, per: 'g', m: { kcal: 140, protein: 9, carbs: 18, fat: 3, fiber: 5 }, veg: true, vegan: true },
  { name: 'Toor Dal (Tadka)', ref: 120, per: 'g', m: { kcal: 150, protein: 9, carbs: 20, fat: 4, fiber: 5 }, veg: true, vegan: true },
  { name: 'Masoor Dal', ref: 120, per: 'g', m: { kcal: 145, protein: 9, carbs: 19, fat: 3, fiber: 5 }, veg: true, vegan: true },
  { name: 'Chana Dal', ref: 120, per: 'g', m: { kcal: 160, protein: 9, carbs: 22, fat: 4, fiber: 6 }, veg: true, vegan: true },
  { name: 'Rajma', ref: 150, per: 'g', m: { kcal: 170, protein: 9, carbs: 25, fat: 2, fiber: 7 }, veg: true, vegan: true },
  { name: 'Chickpea (Chana) Masala', ref: 130, per: 'g', m: { kcal: 165, protein: 8, carbs: 23, fat: 4, fiber: 6 }, veg: true, vegan: true },
  { name: 'Paneer Bhurji', ref: 80, per: 'g', m: { kcal: 220, protein: 14, carbs: 4, fat: 17, fiber: 1 }, veg: true, vegan: false },
  { name: 'Tofu Bhurji', ref: 100, per: 'g', m: { kcal: 130, protein: 12, carbs: 3, fat: 8, fiber: 1 }, veg: true, vegan: true },
];
const VEGS: Item[] = [
  { name: 'Sautéed Spinach', ref: 100, per: 'g', m: { kcal: 60, protein: 3, carbs: 4, fat: 3, fiber: 3 }, veg: true, vegan: true },
  { name: 'Mixed Vegetable Sabzi', ref: 150, per: 'g', m: { kcal: 95, protein: 3, carbs: 12, fat: 4, fiber: 4 }, veg: true, vegan: true },
  { name: 'Bhindi (Okra) Sabzi', ref: 120, per: 'g', m: { kcal: 85, protein: 3, carbs: 10, fat: 4, fiber: 4 }, veg: true, vegan: true },
  { name: 'Cauliflower Sabzi', ref: 120, per: 'g', m: { kcal: 85, protein: 3, carbs: 9, fat: 4, fiber: 4 }, veg: true, vegan: true },
  { name: 'Cabbage Poriyal', ref: 120, per: 'g', m: { kcal: 70, protein: 2, carbs: 9, fat: 3, fiber: 4 }, veg: true, vegan: true },
  { name: 'Green Beans Thoran', ref: 120, per: 'g', m: { kcal: 80, protein: 3, carbs: 10, fat: 3, fiber: 4 }, veg: true, vegan: true },
];
// Carbs: roti-type are per-piece; rice-type per katori (~150 g cooked).
const ROTIS: Item[] = [
  { name: 'Whole Wheat Roti', ref: 1, per: 'pc', m: { kcal: 110, protein: 3, carbs: 18, fat: 3, fiber: 3 }, veg: true, vegan: true },
  { name: 'Phulka', ref: 1, per: 'pc', m: { kcal: 90, protein: 3, carbs: 16, fat: 1, fiber: 3 }, veg: true, vegan: true },
  { name: 'Jowar Roti', ref: 1, per: 'pc', m: { kcal: 95, protein: 3, carbs: 18, fat: 1, fiber: 4 }, veg: true, vegan: true },
  { name: 'Bajra Roti', ref: 1, per: 'pc', m: { kcal: 105, protein: 3, carbs: 19, fat: 2, fiber: 4 }, veg: true, vegan: true },
];
const RICES: Item[] = [
  { name: 'Brown Rice', ref: 1, per: 'katori', m: { kcal: 165, protein: 4, carbs: 34, fat: 1, fiber: 3 }, veg: true, vegan: true },
  { name: 'Jeera Rice', ref: 1, per: 'katori', m: { kcal: 205, protein: 4, carbs: 42, fat: 3, fiber: 1 }, veg: true, vegan: true },
  { name: 'Steamed Rice', ref: 1, per: 'katori', m: { kcal: 200, protein: 4, carbs: 44, fat: 1, fiber: 1 }, veg: true, vegan: true },
  { name: 'Millet (Foxtail)', ref: 1, per: 'katori', m: { kcal: 155, protein: 5, carbs: 30, fat: 1, fiber: 4 }, veg: true, vegan: true },
];
const DAIRY: Item = { name: 'Plain Curd', ref: 100, per: 'g', m: { kcal: 60, protein: 3.5, carbs: 5, fat: 3, fiber: 0 }, veg: true, vegan: false };
const SALADS = ['Cucumber, Tomato & Onion Salad', 'Green Garden Salad', 'Sprouts & Carrot Salad', 'Beetroot & Carrot Salad'];
const SALAD_JAIN = ['Cucumber & Tomato Salad', 'Green Garden Salad'];

const round = (n: number) => Math.round(n);
function scale(it: Item, portion: number): Macro {
  const f = portion / it.ref;
  return { kcal: round(it.m.kcal * f), protein: round(it.m.protein * f), carbs: round(it.m.carbs * f), fat: round(it.m.fat * f), fiber: round(it.m.fiber * f) };
}
function pick<T>(arr: T[], seed: number): T { return arr[Math.abs(seed) % arr.length]; }
function allowsDairy(o: PlateOpts, it: Item): boolean { return it.vegan || (it.veg && o.diet !== 'vegan' && o.dairy); }

const RICE_MAIN = /biryani|pulao|pilaf|fried rice|\bpongal\b|khichdi|\bfried-rice\b|\brice\b/i;

/**
 * Assemble a complete lunch/dinner plate around a chosen main dish, sized to the
 * meal's calorie budget so the plate total never overshoots the target. The main,
 * dal, vegetable, curd and salad are fixed; the CARB flexes to fill the gap to the
 * target (and is dropped entirely when the main is already a rice dish).
 */
export function assemblePlate(
  main: { name: string; kcal: number; protein: number; carbs: number; fat: number; fiber: number; gramsPerServing: number; diet: string },
  slot: 'l' | 'd',
  o: PlateOpts,
  seed: number,
  targetKcal = slot === 'l' ? 780 : 720,
): Plate {
  const mainIcon = /chicken|mutton|fish|prawn|egg|beef|pork|salmon/i.test(main.name) ? '🍗' : '🍲';
  const components: Comp[] = [
    { role: 'main', icon: mainIcon, name: main.name, portion: `${main.gramsPerServing} g`, kcal: main.kcal, protein: main.protein, carbs: main.carbs, fat: main.fat, fiber: main.fiber },
  ];
  const riceMain = RICE_MAIN.test(main.name);
  const trimRice = o.diabetes || o.goal === 'lose'; // diabetes / weight-loss → favour roti

  if (riceMain) {
    // A biryani/pulao is already rice + protein — serve it the traditional way:
    // just raita (curd) + salad. No dal, no extra roti/rice piled on top.
    if (allowsDairy(o, DAIRY)) components.push({ role: 'dairy', icon: '🥛', name: 'Raita (Curd)', portion: '100 g', ...scale(DAIRY, 100) });
    const salad = pick(o.jain ? SALAD_JAIN : SALADS, seed + 5);
    components.push({ role: 'salad', icon: '🥗', name: salad, portion: 'unlimited', kcal: 20, protein: 1, carbs: 4, fat: 0, fiber: 2 });
  } else {
    // Full thali: dal + vegetable + curd + salad, then a carb sized to the target.
    const dalPool = DALS.filter((d) => (o.diet === 'vegan' ? d.vegan : true));
    const dal = pick(dalPool, seed + 1);
    const dalPortion = o.goal === 'gain' ? Math.round(dal.ref * 1.2) : o.goal === 'lose' ? Math.round(dal.ref * 0.85) : dal.ref;
    components.push({ role: 'secondary', icon: '🥣', name: dal.name, portion: `${dalPortion} g`, ...scale(dal, dalPortion) });

    const veg = pick(VEGS, seed + 4);
    components.push({ role: 'vegetable', icon: '🥬', name: veg.name, portion: `${veg.ref} g`, ...scale(veg, veg.ref) });

    if (allowsDairy(o, DAIRY)) {
      const curdG = o.goal === 'gain' ? 150 : 100;
      components.push({ role: 'dairy', icon: '🥛', name: DAIRY.name, portion: `${curdG} g`, ...scale(DAIRY, curdG) });
    }
    const salad = pick(o.jain ? SALAD_JAIN : SALADS, seed + 5);
    components.push({ role: 'salad', icon: '🥗', name: salad, portion: 'unlimited', kcal: 20, protein: 1, carbs: 4, fat: 0, fiber: 2 });

    // Carbohydrate — fill the gap to the meal target the way a dietitian plates it:
    // LUNCH is rice-centric (rice the main carb, roti only for a big remainder);
    // DINNER is lighter — roti only, no rice (lower refined carb at night).
    const gap = targetKcal - components.reduce((s, c) => s + c.kcal, 0);
    if (gap > 40) {
      if (slot === 'l' && !trimRice) {
        const rice = pick(RICES, seed + 3);
        const katori = Math.max(1, Math.min(2, Math.round(gap / rice.m.kcal)));
        components.push({ role: 'carb', icon: '🍚', name: rice.name, portion: `${katori} katori`, ...scale(rice, katori) });
        const remaining = gap - rice.m.kcal * katori;
        if (remaining > 90) {
          const roti = pick(ROTIS, seed + 2);
          const rotiN = Math.min(2, Math.round(remaining / roti.m.kcal));
          if (rotiN > 0) components.push({ role: 'carb', icon: '🍞', name: roti.name, portion: `${rotiN} pcs`, ...scale(roti, rotiN) });
        }
      } else {
        const roti = pick(ROTIS, seed + 2);
        const rotiN = Math.max(1, Math.min(4, Math.round(gap / roti.m.kcal)));
        components.push({ role: 'carb', icon: '🍞', name: roti.name, portion: `${rotiN} pcs`, ...scale(roti, rotiN) });
      }
    }
  }

  const totals = components.reduce<Macro>((t, c) => ({
    kcal: t.kcal + c.kcal, protein: t.protein + c.protein, carbs: t.carbs + c.carbs, fat: t.fat + c.fat, fiber: t.fiber + c.fiber,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

  return { components, totals: { kcal: round(totals.kcal), protein: round(totals.protein), carbs: round(totals.carbs), fat: round(totals.fat), fiber: round(totals.fiber) } };
}
