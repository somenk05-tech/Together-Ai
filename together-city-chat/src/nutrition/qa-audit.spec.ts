import { computeTargets } from './nutrition.service';
import { composeWeek, type ComposerPrefs, type Diet } from './meal-composer';
import { COMPONENT_SEEDS, componentId, isPantryStaple } from './component-recipes';

/**
 * Post-deployment QA harness for the composite Nutrition engine. Exercises the
 * real composer + clinical target engine across the full profile matrix and
 * records findings. Logs a structured report; assertions are intentionally
 * lenient so the full report always prints.
 */

const seedDiet = new Map(COMPONENT_SEEDS.map((s) => [componentId(s.name), s.diet]));
const dietLadder: Record<Diet, Diet[]> = {
  vegan: ['vegan'], vegetarian: ['vegan', 'vegetarian'],
  eggetarian: ['vegan', 'vegetarian', 'eggetarian'], nonveg: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'],
};

interface Finding { sev: 'CRIT' | 'HIGH' | 'MED' | 'LOW'; area: string; msg: string }
const findings: Finding[] = [];
const add = (sev: Finding['sev'], area: string, msg: string) => findings.push({ sev, area, msg });

function targetsFor(p: { age?: number; sex?: string; goal?: string; conditions?: string[]; flags?: Record<string, string> }) {
  return computeTargets({
    weightKg: 70, heightCm: 172, age: p.age ?? 30, sex: p.sex ?? 'male',
    activity: 1.4, goal: (p.goal as never) ?? 'maintain', conditions: p.conditions ?? [], flags: p.flags ?? {},
  });
}

const PROFILES: Array<{ name: string; diet: Diet; goal?: string; age?: number; conditions?: string[]; flags?: Record<string, string>; excluded?: string[] }> = [
  { name: 'Individual vegetarian maintain', diet: 'vegetarian' },
  { name: 'Vegan maintain', diet: 'vegan' },
  { name: 'Eggetarian maintain', diet: 'eggetarian' },
  { name: 'Non-veg maintain', diet: 'nonveg' },
  { name: 'Jain (as veg + exclusions)', diet: 'vegetarian', excluded: ['onion', 'garlic', 'potato'] },
  { name: 'Weight loss', diet: 'vegetarian', goal: 'lose' },
  { name: 'Muscle gain', diet: 'nonveg', goal: 'gain' },
  { name: 'Diabetes', diet: 'vegetarian', conditions: ['diabetes'], flags: { hba1c: 'high' } },
  { name: 'CKD stage 3', diet: 'vegetarian', conditions: ['kidney disease stage 3'] },
  { name: 'Dialysis', diet: 'nonveg', conditions: ['kidney failure on dialysis'] },
  { name: 'Fatty liver', diet: 'vegetarian', conditions: ['fatty liver'] },
  { name: 'Hypertension', diet: 'vegetarian', conditions: ['hypertension'] },
  { name: 'High cholesterol', diet: 'vegetarian', conditions: ['high cholesterol'], flags: { ldl: 'high' } },
  { name: 'Gout', diet: 'nonveg', conditions: ['gout'] },
  { name: 'Senior 72', diet: 'vegetarian', age: 72 },
  { name: 'Child 10', diet: 'vegetarian', age: 10 },
  { name: 'Multi-condition (DM+CKD+HTN)', diet: 'vegetarian', conditions: ['diabetes', 'kidney disease stage 3', 'hypertension'] },
];

function auditWeek(name: string, prefs: ComposerPrefs, targets: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }) {
  const wk = composeWeek(targets, prefs, 7, 7);
  const bfCount = new Map<string, number>();
  let lastLunchMain = ''; let lastDinnerMain = '';

  for (const day of wk.days) {
    const slots = day.meals.map((m) => m.slot).join(',');
    if (!prefs.fasting?.enabled && slots !== 'b,l,s,es,d') add('CRIT', 'Structure', `${name}: day ${day.dayIndex + 1} slots = ${slots}`);
    for (const m of day.meals) {
      if (!m.components.length) add('CRIT', 'Structure', `${name}: empty ${m.label}`);
      if (!/^\d{2}:\d{2}$/.test(m.scheduledTime)) add('HIGH', 'Timing', `${name}: bad time ${m.scheduledTime}`);
      if (!prefs.fasting?.enabled && (m.energyPct < 0.08 || m.energyPct > 0.35)) add('HIGH', 'Energy', `${name}: ${m.label} energy ${m.energyPct}`);
      // nutrition: meal totals == sum of components
      const s = m.components.reduce((t, c) => ({ kcal: t.kcal + c.kcal, protein: t.protein + c.protein }), { kcal: 0, protein: 0 });
      if (Math.abs(s.kcal - m.totals.kcal) > 2) add('HIGH', 'Nutrition', `${name}: ${m.label} kcal sum ${s.kcal} != totals ${m.totals.kcal}`);
      // breakfast category
      if (m.slot === 'b' && m.components.some((c) => c.category === 'lunch' || c.category === 'dinner')) add('CRIT', 'Breakfast', `${name}: breakfast has lunch/dinner recipe`);
      // composite title
      if (m.components.some((c) => c.name === m.title)) add('MED', 'Naming', `${name}: ${m.label} title equals a recipe`);
      // diet adherence
      for (const c of m.components) {
        const rd = seedDiet.get(c.recipeId);
        if (rd && !dietLadder[prefs.diet ?? 'vegetarian'].includes(rd)) add('CRIT', 'Diet', `${name}: ${prefs.diet} plan contains ${rd} recipe ${c.name}`);
      }
      // excluded foods
      if (prefs.excluded?.length) for (const c of m.components) {
        const hay = `${c.name} ${c.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
        for (const ex of prefs.excluded) if (ex && hay.includes(ex.toLowerCase())) add('HIGH', 'Exclusions', `${name}: excluded "${ex}" appears in ${c.name}`);
      }
    }
    // lunch/dinner plate structure
    for (const code of ['l', 'd'] as const) {
      const meal = day.meals.find((m) => m.slot === code);
      if (meal) {
        if (meal.components.length < 3) add('HIGH', 'Plate', `${name}: ${meal.label} only ${meal.components.length} components`);
        const roles = new Set(meal.components.map((c) => c.role));
        if (!roles.has('main') && !roles.has('dal')) add('HIGH', 'Plate', `${name}: ${meal.label} no main/protein`);
        if (!roles.has('carb')) add('MED', 'Plate', `${name}: ${meal.label} no staple`);
      }
      const mainId = day.meals.find((m) => m.slot === code)?.components.find((c) => c.role === 'main')?.recipeId ?? '';
      const last = code === 'l' ? lastLunchMain : lastDinnerMain;
      if (mainId && mainId === last) add('MED', 'Variety', `${name}: consecutive ${code} main repeat`);
      if (code === 'l') lastLunchMain = mainId; else lastDinnerMain = mainId;
    }
    const bId = day.meals.find((m) => m.slot === 'b')?.components[0]?.recipeId ?? '';
    bfCount.set(bId, (bfCount.get(bId) ?? 0) + 1);
    // day totals vs target tolerance (±25% is generous — flags gross misses)
    const dev = Math.abs(day.totals.kcal - targets.kcal) / targets.kcal;
    if (dev > 0.25) add('MED', 'Nutrition', `${name}: day ${day.dayIndex + 1} kcal ${day.totals.kcal} vs target ${targets.kcal} (${Math.round(dev * 100)}% off)`);
  }
  for (const [, c] of bfCount) if (c > 2) add('MED', 'Variety', `${name}: a breakfast repeats ${c}×/week`);

  // grocery integrity
  const ids = new Set(wk.days.flatMap((d) => d.meals.flatMap((m) => m.components.map((c) => c.recipeId))));
  for (const g of wk.grocery) {
    if (!g.fromRecipes.some((id) => ids.has(id))) add('CRIT', 'Grocery', `${name}: grocery "${g.name}" not traceable`);
    if (g.pantry) add('HIGH', 'Grocery', `${name}: pantry "${g.name}" leaked into default list`);
  }
  return wk;
}

describe('Nutrition Hub — post-deployment QA audit', () => {
  it('runs the full profile matrix and reports findings', () => {
    // Clinical target sanity: capture limits per condition.
    const healthy = targetsFor({}) as unknown as Record<string, unknown>;
    const diabetic = targetsFor({ conditions: ['diabetes'], flags: { hba1c: 'high' } }) as unknown as Record<string, unknown>;
    const ckd = targetsFor({ conditions: ['kidney disease stage 3'] }) as unknown as Record<string, unknown>;
    const dialysis = targetsFor({ conditions: ['kidney failure on dialysis'] }) as unknown as Record<string, unknown>;
    const htn = targetsFor({ conditions: ['hypertension'] }) as unknown as Record<string, unknown>;
    const senior = targetsFor({ age: 72 }) as unknown as Record<string, unknown>;

    // Clinical target assertions (targets must MEANINGFULLY change).
    if ((diabetic.sugarMaxG as number) >= (healthy.sugarMaxG as number ?? 999)) add('HIGH', 'Clinical', 'Diabetes does not tighten sugar cap');
    if ((ckd.protein as number) >= (healthy.protein as number)) add('HIGH', 'Clinical', 'CKD does not reduce protein target');
    if ((dialysis.protein as number) <= (ckd.protein as number)) add('MED', 'Clinical', 'Dialysis protein not higher than CKD');
    if ((senior.protein as number) <= (healthy.protein as number)) add('MED', 'Clinical', 'Senior protein not raised');

    // Does the COMPOSED PLATE track + enforce the nutrients the clinical rules limit?
    const capsOf = (t: Record<string, unknown>) => ({
      sodiumMg: t.sodiumMaxMg as number, potassiumMg: t.potassiumMaxMg as number, phosphorusMg: t.phosphorusMaxMg as number,
      sugarG: t.sugarMaxG as number, satFatG: t.satFatMaxG as number,
    });
    const ckdCaps = capsOf(ckd);
    const wkCkd = composeWeek({ kcal: (ckd.kcal as number), protein: (ckd.protein as number), carbs: (ckd as { carb: number }).carb, fat: (ckd.fat as number), fiber: (ckd.fiber as number) }, { diet: 'vegetarian', clinicalTag: 'Renal Friendly', clinical: true, caps: ckdCaps }, 3, 7);
    const comp0 = wkCkd.days[0].meals[0].components[0] as unknown as Record<string, unknown>;
    const tracksMicros = ['sodiumMg', 'potassiumMg', 'phosphorusMg', 'sugarG', 'satFatG'].every((k) => k in comp0);
    if (!tracksMicros) add('CRIT', 'Clinical', 'Composed meals do not track sodium/potassium/phosphorus/sugar/satfat on components.');
    for (const day of wkCkd.days) {
      if (ckdCaps.potassiumMg && day.totals.potassiumMg > ckdCaps.potassiumMg * 1.03) add('HIGH', 'Clinical', `CKD day ${day.dayIndex + 1}: potassium ${day.totals.potassiumMg} > cap ${ckdCaps.potassiumMg}`);
      if (ckdCaps.phosphorusMg && day.totals.phosphorusMg > ckdCaps.phosphorusMg * 1.03) add('HIGH', 'Clinical', `CKD day ${day.dayIndex + 1}: phosphorus ${day.totals.phosphorusMg} > cap ${ckdCaps.phosphorusMg}`);
      if (ckdCaps.sodiumMg && day.totals.sodiumMg > ckdCaps.sodiumMg * 1.03) add('HIGH', 'Clinical', `CKD day ${day.dayIndex + 1}: sodium ${day.totals.sodiumMg} > cap ${ckdCaps.sodiumMg}`);
    }
    // Diabetes sugar cap on the plate
    const dmCaps = capsOf(diabetic);
    const wkDm = composeWeek({ kcal: (diabetic.kcal as number), protein: (diabetic.protein as number), carbs: (diabetic as { carb: number }).carb, fat: (diabetic.fat as number), fiber: (diabetic.fiber as number) }, { diet: 'vegetarian', clinical: true, caps: dmCaps, avoidRice: true }, 3, 7);
    for (const day of wkDm.days) if (dmCaps.sugarG && day.totals.addedSugarG > dmCaps.sugarG * 1.05) add('MED', 'Clinical', `Diabetes day ${day.dayIndex + 1}: added sugar ${day.totals.addedSugarG} > cap ${dmCaps.sugarG}`);
    void htn;

    // Run every profile.
    for (const p of PROFILES) {
      const t = targetsFor(p) as unknown as Record<string, number>;
      const prefs: ComposerPrefs = {
        diet: p.diet, excluded: p.excluded,
        clinicalTag: (p.conditions ?? []).some((c) => /kidney|renal|ckd|dialysis/.test(c)) ? 'Renal Friendly' : /diabet/.test((p.conditions ?? []).join(' ')) ? 'Diabetic Friendly' : undefined,
        avoidRice: /diabet/.test((p.conditions ?? []).join(' ')),
      };
      const targets = { kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber };
      try { auditWeek(p.name, prefs, targets); }
      catch (e) { add('CRIT', 'Crash', `${p.name}: threw ${(e as Error).message}`); }
    }

    // Intermittent fasting matrix
    for (const proto of ['12:12', '14:10', '16:8', '18:6', '20:4', 'omad']) {
      const wk = composeWeek({ kcal: 2000, protein: 90, carbs: 240, fat: 60, fiber: 30 }, { diet: 'vegetarian', fasting: { enabled: true, protocol: proto } }, 1, 7);
      const sum = wk.days[0].meals.reduce((s, m) => s + m.energyPct, 0);
      if (Math.abs(sum - 1) > 0.05) add('HIGH', 'Fasting', `${proto}: energy sums ${sum.toFixed(2)} (should ~1.0)`);
      if (proto === 'omad' && wk.days[0].meals.length !== 1) add('HIGH', 'Fasting', 'OMAD not a single meal');
    }

    // Edge cases
    const edge: Array<[string, { kcal: number; protein: number; carbs: number; fat: number; fiber: number }]> = [
      ['very low kcal', { kcal: 1000, protein: 60, carbs: 100, fat: 30, fiber: 25 }],
      ['very high protein', { kcal: 2600, protein: 180, carbs: 250, fat: 70, fiber: 35 }],
      ['tiny fibre', { kcal: 1800, protein: 80, carbs: 200, fat: 55, fiber: 10 }],
    ];
    for (const [nm, tg] of edge) { try { auditWeek(`EDGE ${nm}`, { diet: 'vegetarian' }, tg); } catch (e) { add('CRIT', 'Edge', `${nm}: ${(e as Error).message}`); } }

    // Component-pool data integrity
    const idsSeen = new Set<string>();
    for (const s of COMPONENT_SEEDS) {
      const id = componentId(s.name);
      if (idsSeen.has(id)) add('MED', 'Data', `Duplicate component id ${id}`); idsSeen.add(id);
      if (!s.ing.length) add('HIGH', 'Data', `${s.name}: no ingredients`);
      if (!s.categories.length) add('HIGH', 'Data', `${s.name}: no category`);
      if (!s.kcal) add('MED', 'Data', `${s.name}: zero kcal`);
      const allPantry = s.ing.every(([n]) => isPantryStaple(n));
      if (allPantry && s.ing.length) add('LOW', 'Grocery', `${s.name}: all ingredients are pantry → contributes nothing to grocery`);
    }

    // ── Report ──
    const bySev = (sev: string) => findings.filter((f) => f.sev === sev);
    const uniq = (arr: Finding[]) => [...new Map(arr.map((f) => [f.area + f.msg, f])).values()];
    const report = ['\n================ NUTRITION HUB QA REPORT ================'];
    for (const sev of ['CRIT', 'HIGH', 'MED', 'LOW'] as const) {
      const u = uniq(bySev(sev));
      report.push(`\n### ${sev} (${u.length})`);
      for (const f of u.slice(0, 40)) report.push(`  [${f.area}] ${f.msg}`);
    }
    report.push(`\nTOTAL unique findings: ${uniq(findings).length}`);
    // eslint-disable-next-line no-console
    console.log(report.join('\n'));

    // Only structural CRIT crashes fail the harness; clinical-gap CRITs are reported.
    const crashes = findings.filter((f) => f.area === 'Crash' || f.area === 'Structure');
    expect(crashes).toEqual([]);
  });
});
