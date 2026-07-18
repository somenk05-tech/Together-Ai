/**
 * Together City — Clinical Nutrition Engine
 * ------------------------------------------------------------------
 * Evidence-based blood-test → nutrition mapping. Every threshold, food
 * recommendation and interpretation caveat is traceable to a cited source:
 *
 *   [ESPEN-MN]  ESPEN micronutrient guideline. Berger MM et al.
 *               Clin Nutr 2022;41:1357-1424.
 *   [ESPEN-OB]  ESPEN-UEG guideline: obesity in GI & liver disease, 2024.
 *   [ESPEN-LIV] ESPEN practical guideline: clinical nutrition in liver disease.
 *   [ESPEN-GER] ESPEN practical guideline: nutrition & hydration in geriatrics.
 *   [ESPEN-CAN] ESPEN practical guideline: clinical nutrition in cancer.
 *   [ESPEN-POLY]ESPEN guideline: nutritional support for polymorbid inpatients.
 *   [KRAUSE]    Krause's Food & the Nutrition Care Process, 14th ed.
 *               (Mahan & Raymond) — Ch.7 Biochemical Assessment (Litchford),
 *               Ch.32 Anemia MNT, Ch.33 CVD.
 *
 * This engine produces educational guidance and flags — NOT a diagnosis, and
 * not a substitute for a clinician. Clinical-only content (enteral/parenteral
 * nutrition, IV dosing, drugs, refeeding electrolyte management) is deliberately
 * excluded from the consumer-facing output.
 */

export type MarkerStatus = 'low' | 'normal' | 'high';
/** How systemic inflammation moves the marker (guides CRP-aware interpretation). */
export type AcutePhase = 'positive' | 'negative' | 'rises' | 'neutral';

export interface Citation { id: string; label: string; ref: string; }

export interface MarkerRule {
  key: string;
  label: string;
  unit: string;
  min: number;               // lower bound of the reference range
  max: number;               // upper bound of the reference range
  acutePhase: AcutePhase;
  lowAdvice: string;
  highAdvice: string;
  foods: string[];
  citations: string[];       // Citation ids
}

export const CITATIONS: Record<string, Citation> = {
  'ESPEN-MN': { id: 'ESPEN-MN', label: 'ESPEN micronutrient guideline (2022)', ref: 'Berger MM et al., Clin Nutr 2022;41:1357-1424' },
  'ESPEN-OB': { id: 'ESPEN-OB', label: 'ESPEN-UEG obesity in GI/liver disease (2024)', ref: 'Joint ESPEN-UEG guideline' },
  'ESPEN-LIV': { id: 'ESPEN-LIV', label: 'ESPEN liver-disease guideline', ref: 'ESPEN practical guideline: clinical nutrition in liver disease' },
  'ESPEN-GER': { id: 'ESPEN-GER', label: 'ESPEN geriatrics guideline', ref: 'ESPEN practical guideline: clinical nutrition & hydration in geriatrics' },
  'ESPEN-CAN': { id: 'ESPEN-CAN', label: 'ESPEN cancer guideline', ref: 'ESPEN practical guideline: clinical nutrition in cancer' },
  'ESPEN-POLY': { id: 'ESPEN-POLY', label: 'ESPEN polymorbid-inpatients guideline', ref: 'ESPEN guideline: nutritional support for polymorbid medical inpatients' },
  'KRAUSE': { id: 'KRAUSE', label: "Krause's Food & the Nutrition Care Process, 14th ed.", ref: 'Mahan & Raymond — Ch.7 Biochemical Assessment; Ch.32 Anemia; Ch.33 CVD' },
  'NIH-ODS': { id: 'NIH-ODS', label: 'NIH Office of Dietary Supplements', ref: 'ods.od.nih.gov fact sheets — RDA, tolerable upper limits, food sources, safety' },
  'LABREF': { id: 'LABREF', label: 'Common Labs reference ranges', ref: 'Parent Project Muscular Dystrophy — ranges via mayocliniclabs.com (HbA1c, LDL, triglyceride tiers)' },
};

/** Consumer blood panel. Reference ranges from Krause Ch.7 / Appendix 22 unless noted. */
export const MARKER_RULES: MarkerRule[] = [
  {
    key: 'hb', label: 'Hemoglobin', unit: 'g/dL', min: 12, max: 17.5, acutePhase: 'neutral',
    lowAdvice: 'Suggests anemia. Build in iron-rich meals — heme iron from lean meat, liver, fish and poultry is best absorbed; pair non-heme (beans, lentils, spinach, fortified grains) with a vitamin-C source, and keep tea/coffee away from meals (they inhibit iron uptake).',
    highAdvice: 'Above range — usually dehydration or other causes; stay hydrated and review with your doctor.',
    foods: ['lean red meat', 'liver', 'fish & seafood', 'lentils & beans', 'spinach', 'fortified cereals', 'vitamin-C fruits (with meals)'],
    citations: ['KRAUSE', 'ESPEN-MN'],
  },
  {
    key: 'ferritin', label: 'Ferritin (iron stores)', unit: 'ng/mL', min: 30, max: 300, acutePhase: 'positive',
    lowAdvice: 'Low iron stores — the earliest stage of iron deficiency, even before anemia. Favour heme iron (meat, liver, seafood) and iron-rich plants with vitamin C; alternate-day iron supplements are better absorbed if your clinician advises them.',
    highAdvice: 'High ferritin — can reflect inflammation or, rarely, iron overload; don’t start iron supplements and review with your doctor.',
    foods: ['red meat & liver', 'seafood', 'beans & lentils (with vitamin C)', 'iron-fortified grains'],
    citations: ['ESPEN-MN', 'KRAUSE'],
  },
  {
    key: 'vitd', label: 'Vitamin D (25-OH-D)', unit: 'ng/mL', min: 20, max: 100, acutePhase: 'negative',
    lowAdvice: 'Below sufficiency (30 ng/mL / 75 nmol/L). Eat fatty fish, eggs and fortified dairy, get sensible sun, and a daily vitamin D3 supplement is commonly advised — dose to reach 30–60 ng/mL and recheck in 3–6 months.',
    highAdvice: 'Above range — pause any vitamin-D supplement and recheck; more is not better.',
    foods: ['fatty fish (salmon, sardines)', 'eggs', 'fortified dairy & plant milks', 'UV-exposed mushrooms'],
    citations: ['ESPEN-MN', 'KRAUSE'],
  },
  {
    key: 'b12', label: 'Vitamin B12', unit: 'pg/mL', min: 200, max: 900, acutePhase: 'rises',
    lowAdvice: 'Low B12. Include meat, eggs, dairy, fish and shellfish; if you eat plant-based, a B12 supplement is essential. On metformin? It lowers B12 absorption — adequate calcium helps. Adults over 50 absorb crystalline B12 (fortified foods/supplements) better.',
    highAdvice: 'High B12 is usually harmless or supplement-driven; note that inflammation can raise it.',
    foods: ['meat & organ meats', 'fish & shellfish', 'eggs', 'milk & dairy', 'fortified cereals / nutritional yeast'],
    citations: ['ESPEN-MN', 'KRAUSE'],
  },
  {
    key: 'folate', label: 'Folate', unit: 'ng/mL', min: 4, max: 20, acutePhase: 'negative',
    lowAdvice: 'Low folate. Favour fresh, uncooked dark-green vegetables, legumes, citrus and fortified grains (heat destroys folate, so include raw/fresh sources). Folate and B12 are checked together — treating folate alone can mask a B12 problem.',
    highAdvice: 'High folate is generally not a concern; very high intake from supplements can mask B12 deficiency.',
    foods: ['dark leafy greens (raw)', 'legumes & beans', 'citrus fruit', 'eggs', 'fortified grains'],
    citations: ['ESPEN-MN', 'KRAUSE'],
  },
  {
    key: 'hba1c', label: 'HbA1c (3-month glucose)', unit: '%', min: 4, max: 5.6, acutePhase: 'neutral',
    lowAdvice: 'Within/below the normal band — keep regular balanced meals.',
    highAdvice: 'Elevated average glucose (5.7–6.4% is the pre-diabetes range; ≥6.5% is the diabetes threshold). Favour a Mediterranean pattern, more fibre and fewer refined carbs to lower glycemic load; adequate protein and activity improve control. Your meal planner will lean low-glycemic.',
    foods: ['whole grains & legumes', 'non-starchy vegetables', 'nuts & olive oil', 'lean protein', 'fewer refined carbs & sugary drinks'],
    citations: ['LABREF', 'ESPEN-OB', 'ESPEN-CAN', 'KRAUSE'],
  },
  {
    key: 'ldl', label: 'LDL cholesterol', unit: 'mg/dL', min: 0, max: 130, acutePhase: 'neutral',
    lowAdvice: 'Within desirable range (optimal <100 mg/dL) — keep it up.',
    highAdvice: 'Above desirable (optimal <100; ≥160 is high, ≥190 very high). Favour a Mediterranean/DASH pattern: limit saturated and trans fat, add soluble fibre (oats, beans), nuts and olive oil, and stay active. Omega-3s help triglycerides. Standard heart-healthy prevention applies.',
    foods: ['oats & barley (soluble fibre)', 'beans & lentils', 'nuts', 'olive oil', 'fatty fish (omega-3)', 'fruit & vegetables'],
    citations: ['LABREF', 'ESPEN-OB', 'KRAUSE'],
  },
  {
    key: 'trig', label: 'Triglycerides', unit: 'mg/dL', min: 0, max: 150, acutePhase: 'neutral',
    lowAdvice: 'Within normal range (<150 mg/dL).',
    highAdvice: 'Elevated triglycerides. Cut added sugar, refined carbs and alcohol; add omega-3-rich fish and stay active. Very high levels (≥500) need prompt medical review.',
    foods: ['fatty fish (omega-3)', 'whole grains', 'vegetables', 'less added sugar & alcohol'],
    citations: ['ESPEN-OB', 'KRAUSE'],
  },
  {
    key: 'crp', label: 'CRP (inflammation)', unit: 'mg/L', min: 0, max: 10, acutePhase: 'neutral',
    lowAdvice: 'Low inflammation — your other markers can be read at face value.',
    highAdvice: 'Raised inflammation. This can distort several nutrition markers (see notes below), and an anti-inflammatory Mediterranean pattern — oily fish, vegetables, olive oil, whole grains — is sensible. Recheck confounded markers once CRP settles.',
    foods: ['oily fish', 'colourful vegetables & fruit', 'olive oil', 'whole grains', 'less ultra-processed food'],
    citations: ['ESPEN-MN', 'KRAUSE'],
  },
];

export function ruleFor(key: string): MarkerRule | undefined {
  return MARKER_RULES.find((r) => r.key === key);
}

/**
 * Critical ("off the chart") thresholds. A value beyond these is a medical
 * red flag — the app must urge the user to seek medical care rather than treat
 * it as a diet tweak. Thresholds are conservative, from Krause Ch.7/Appendix 22
 * and ESPEN. `urgent: true` = same-day / emergency framing.
 */
export interface CriticalRule {
  key: string;
  belowValue?: number;   // critical if value < belowValue
  aboveValue?: number;   // critical if value > aboveValue
  urgent: boolean;
  message: string;
}

export const CRITICAL_RULES: CriticalRule[] = [
  { key: 'hb', belowValue: 8, urgent: true,
    message: 'Severely low hemoglobin can be dangerous — please seek medical care promptly; diet alone is not enough.' },
  { key: 'hb', aboveValue: 20, urgent: false,
    message: 'Unusually high hemoglobin should be evaluated by a doctor.' },
  { key: 'hba1c', aboveValue: 9, urgent: false,
    message: 'An HbA1c this high indicates poorly controlled diabetes — please see a doctor to review treatment, not just diet.' },
  { key: 'trig', aboveValue: 500, urgent: true,
    message: 'Very high triglycerides raise the risk of pancreatitis — please seek medical review promptly.' },
  { key: 'ldl', aboveValue: 190, urgent: false,
    message: 'Very high LDL warrants medical assessment (possible familial hypercholesterolaemia), alongside diet changes.' },
  { key: 'vitd', belowValue: 10, urgent: false,
    message: 'Severe vitamin D deficiency should be managed with your doctor, who may prescribe higher-dose repletion.' },
  { key: 'b12', belowValue: 150, urgent: false,
    message: 'Clearly low B12 can cause nerve damage if untreated — please see a doctor; diet alone may not correct it.' },
  { key: 'ferritin', aboveValue: 1000, urgent: false,
    message: 'Very high ferritin needs medical evaluation (iron overload or significant inflammation) — do not take iron.' },
  { key: 'crp', aboveValue: 100, urgent: true,
    message: 'A very high CRP signals significant inflammation or infection — please seek medical care.' },
];

export interface CriticalAlert { key: string; label: string; value: number; urgent: boolean; message: string; }

/** Returns any critical red-flag alerts for a set of marker values. */
export function criticalAlerts(values: Record<string, number>): CriticalAlert[] {
  const alerts: CriticalAlert[] = [];
  for (const rule of CRITICAL_RULES) {
    const v = values[rule.key];
    if (typeof v !== 'number') continue;
    const hitLow = typeof rule.belowValue === 'number' && v < rule.belowValue;
    const hitHigh = typeof rule.aboveValue === 'number' && v > rule.aboveValue;
    if (hitLow || hitHigh) {
      const label = ruleFor(rule.key)?.label ?? rule.key;
      alerts.push({ key: rule.key, label, value: v, urgent: rule.urgent, message: rule.message });
    }
  }
  // urgent first
  return alerts.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

export interface MarkerEvaluation {
  status: MarkerStatus;
  advice: string;
  caveat: string | null;   // CRP-aware interpretation note
  citations: string[];
}

/**
 * Evaluate a marker against its reference range, applying inflammation-aware
 * interpretation when CRP is provided. This is the anemia-of-chronic-disease
 * logic: ferritin (a positive acute-phase reactant) can be falsely normal in
 * inflammation and mask iron deficiency; negative reactants (vitD, folate, zinc,
 * vitamin C) fall in inflammation; B12 can rise. [ESPEN-MN; KRAUSE Ch.7/32]
 */
export function evaluateMarker(rule: MarkerRule, value: number, crp?: number): MarkerEvaluation {
  const status: MarkerStatus = value < rule.min ? 'low' : value > rule.max ? 'high' : 'normal';
  const advice = status === 'low' ? rule.lowAdvice : status === 'high' ? rule.highAdvice : '';
  let caveat: string | null = null;

  const inflamed = typeof crp === 'number' && crp > 10; // overt inflammation (hs-CRP "high" / ESPEN overt >20)
  if (inflamed && rule.key !== 'crp') {
    if (rule.acutePhase === 'positive' && status !== 'low') {
      caveat = `Ferritin rises with inflammation (CRP ${crp} mg/L). A normal/high value here can mask iron deficiency — the "anemia of chronic disease" pattern. Interpret alongside your clinician.`;
    } else if (rule.acutePhase === 'positive' && status === 'low') {
      caveat = `Low ferritin despite inflammation strongly indicates genuinely depleted iron stores.`;
    } else if (rule.acutePhase === 'negative' && status === 'low') {
      caveat = `Inflammation lowers this marker (CRP ${crp} mg/L); a low reading now may overstate true depletion — recheck once CRP settles.`;
    } else if (rule.acutePhase === 'rises' && status !== 'low') {
      caveat = `B12 can be falsely raised by inflammation; a normal value doesn't fully exclude deficiency (MMA/holo-TC confirm).`;
    }
  }
  return { status, advice, caveat, citations: rule.citations };
}

// ─────────────────────────── condition modules ───────────────────────────
export interface ConditionModule {
  key: string;
  name: string;
  trigger: string;            // human description of when it surfaces
  principles: string[];
  citations: string[];
}

export const CONDITION_MODULES: Record<string, ConditionModule> = {
  anemia: {
    key: 'anemia', name: 'Iron / nutritional anemia', trigger: 'low hemoglobin or ferritin',
    principles: [
      'Prioritise heme iron (lean meat, liver, fish); pair non-heme plant iron with a vitamin-C source to boost absorption.',
      'Keep tea, coffee and antacids away from iron-rich meals — they inhibit absorption.',
      'Check B12 and folate together — all three cause anemia and are treated differently.',
    ],
    citations: ['ESPEN-MN', 'KRAUSE'],
  },
  glycemic: {
    key: 'glycemic', name: 'Glycemic control', trigger: 'HbA1c in the pre-diabetes/diabetes range',
    principles: [
      'A Mediterranean pattern improves insulin sensitivity even before weight loss.',
      'Lower the glycemic load: more fibre and whole grains, fewer refined carbs and sugary drinks.',
      'Adequate protein and regular activity are associated with lower HbA1c.',
    ],
    citations: ['ESPEN-OB', 'ESPEN-CAN', 'KRAUSE'],
  },
  dyslipidemia: {
    key: 'dyslipidemia', name: 'Heart-healthy lipids', trigger: 'raised LDL or triglycerides',
    principles: [
      'Favour a Mediterranean/DASH pattern; limit saturated and trans fat.',
      'Add soluble fibre (oats, barley, beans), nuts and olive oil.',
      'Omega-3-rich fish helps triglycerides; limit added sugar and alcohol.',
    ],
    citations: ['ESPEN-OB', 'KRAUSE'],
  },
};

/** Which condition modules a panel triggers, in priority order. */
export function triggeredConditions(flags: Record<string, MarkerStatus>): ConditionModule[] {
  const out: ConditionModule[] = [];
  if (flags.hb === 'low' || flags.ferritin === 'low') out.push(CONDITION_MODULES.anemia);
  if (flags.hba1c === 'high') out.push(CONDITION_MODULES.glycemic);
  if (flags.ldl === 'high' || flags.trig === 'high') out.push(CONDITION_MODULES.dyslipidemia);
  return out;
}

// ─────────────────────────── supplements ───────────────────────────
export interface SupplementDef {
  name: string; purpose: string; dose: string; timing: string; priceInr: number; citations: string[];
  reference?: string;   // RDA / upper limit / safety, from NIH ODS
}

/** Goal-matched base kit, upgraded by blood-panel flags. Food-first framing;
 *  consumer-level (oral) guidance only — confirm dosing with a clinician. */
export function supplementKit(goal: string, flags: Record<string, MarkerStatus>): SupplementDef[] {
  const kit: SupplementDef[] = [
    { name: 'Omega-3 (fish oil)', purpose: 'Heart, joints, recovery; helps triglycerides', dose: '1000 mg', timing: 'With lunch', priceInr: 649, citations: ['ESPEN-OB'] },
    { name: 'Daily multivitamin', purpose: 'Micronutrient safety net at ~RDA', dose: '1 tablet', timing: 'After breakfast', priceInr: 449, citations: ['ESPEN-CAN'] },
  ];
  if (goal === 'gain') {
    kit.push(
      { name: 'Whey protein', purpose: 'Reach your protein target', dose: '30 g scoop', timing: 'Post-workout', priceInr: 1899, citations: ['ESPEN-POLY'] },
      { name: 'Creatine monohydrate', purpose: 'Strength and lean mass', dose: '5 g', timing: 'Any time, daily', priceInr: 799, citations: ['ESPEN-POLY'] },
    );
  }
  if (goal === 'lose') {
    kit.push({ name: 'Psyllium fibre', purpose: 'Satiety and gut health', dose: '5 g in water', timing: 'Before dinner', priceInr: 349, citations: ['ESPEN-OB'] });
  }
  if (flags.vitd === 'low') {
    kit.push({ name: 'Vitamin D3', purpose: 'Corrects low vitamin D (aim 30–60 ng/mL)', dose: '1000–2000 IU', timing: 'With a fatty meal', priceInr: 299, citations: ['ESPEN-MN', 'NIH-ODS'],
      reference: 'RDA 600 IU (15 mcg), 800 IU over 70; safe upper limit 4,000 IU/day from all sources (NIH ODS).' });
  }
  if (flags.b12 === 'low') {
    kit.push({ name: 'Vitamin B12', purpose: 'Corrects low B12 (essential if plant-based)', dose: '500–1000 mcg', timing: 'Morning', priceInr: 349, citations: ['ESPEN-MN', 'KRAUSE', 'NIH-ODS'],
      reference: 'RDA 2.4 mcg; no upper limit set. Metformin and acid-reducers (PPIs) lower B12 absorption (NIH ODS).' });
  }
  if (flags.folate === 'low') {
    kit.push({ name: 'Folate (with B12)', purpose: 'Corrects low folate — paired with B12 so it isn’t masked', dose: '400 mcg', timing: 'With breakfast', priceInr: 249, citations: ['ESPEN-MN', 'KRAUSE', 'NIH-ODS'],
      reference: 'RDA 400 mcg DFE; supplement/fortified upper limit 1,000 mcg — high folic acid can mask a B12 deficiency (NIH ODS).' });
  }
  if (flags.ferritin === 'low' || flags.hb === 'low') {
    kit.push({ name: 'Iron + Vitamin C', purpose: 'Rebuilds iron stores (vitamin C aids absorption)', dose: '1 tablet', timing: 'Alternate mornings', priceInr: 399, citations: ['ESPEN-MN', 'KRAUSE', 'NIH-ODS'],
      reference: 'RDA 8 mg men / 18 mg women (19–50); upper limit 45 mg. Don’t supplement iron unless deficient (NIH ODS).' });
  }
  return kit;
}

// ─────────────────────────── condition-aware meal planning ───────────────────────────
// A thin, transparent scoring layer that sits on top of the evidence base: blood-panel
// flags (and goal) switch on "planning modes", each of which biases recipe selection in
// the direction the guidelines recommend. Deterministic and explainable — an ML layer
// that learns personal taste can later re-rank the top-scored candidates without
// changing this clinical floor.

export interface PlanningMode {
  key: string;
  label: string;
  reason: string;
  citations: string[];
}

export interface PlanGuidance {
  modes: PlanningMode[];
  summary: string;
  citations: Citation[];
}

/** Map raw marker values → low/normal/high flags using the same rules the panel uses. */
export function flagsFor(values: Record<string, number>): Record<string, MarkerStatus> {
  const crp = values.crp;
  const flags: Record<string, MarkerStatus> = {};
  for (const rule of MARKER_RULES) {
    const v = values[rule.key];
    if (typeof v === 'number') flags[rule.key] = evaluateMarker(rule, v, crp).status;
  }
  return flags;
}

/** Which planning modes are active for a set of flags + goal, in priority order. */
export function planningModes(flags: Record<string, MarkerStatus>, goal: string): PlanningMode[] {
  const modes: PlanningMode[] = [];
  if (flags.hba1c === 'high') {
    modes.push({ key: 'lowGlycemic', label: 'Low-glycemic', reason: 'HbA1c is raised — the week leans to higher-fibre, lower-refined-carb meals to lower glycemic load.', citations: ['ESPEN-OB', 'ESPEN-CAN', 'KRAUSE'] });
  }
  if (flags.ldl === 'high' || flags.trig === 'high') {
    modes.push({ key: 'heartHealthy', label: 'Heart-healthy', reason: 'LDL/triglycerides are raised — meals favour a Mediterranean pattern: fish, fibre and unsaturated fats over saturated fat.', citations: ['ESPEN-OB', 'KRAUSE'] });
  }
  if (flags.hb === 'low' || flags.ferritin === 'low') {
    modes.push({ key: 'ironRich', label: 'Iron-supportive', reason: 'Low haemoglobin/ferritin — the plan raises iron-rich, protein-dense meals to help rebuild stores.', citations: ['ESPEN-MN', 'KRAUSE'] });
  }
  if (goal === 'lose') {
    modes.push({ key: 'weightLoss', label: 'Weight-loss', reason: 'Weight-loss goal — higher-protein, higher-fibre, moderate-energy meals to preserve muscle on a deficit.', citations: ['ESPEN-OB'] });
  }
  if (goal === 'gain') {
    modes.push({ key: 'muscleGain', label: 'Muscle-gain', reason: 'Muscle-gain goal — higher-protein, higher-energy meals to support training.', citations: ['ESPEN-POLY'] });
  }
  return modes;
}

interface ScorableRecipe { kcal: number; protein: number; carbs: number; fat: number; fiber: number; diet: string; }

/** Score a recipe (higher = better fit) for the active planning modes. Neutral 0 when no modes. */
export function scoreRecipe(r: ScorableRecipe, modes: PlanningMode[]): number {
  let score = 0;
  const heme = r.diet === 'nonveg' || r.diet === 'pesc' || r.diet === 'egg';
  const fish = r.diet === 'pesc';
  for (const m of modes) {
    switch (m.key) {
      case 'lowGlycemic':
        score += r.fiber * 2.2 - r.carbs * 0.35 + r.protein * 0.2;
        break;
      case 'heartHealthy':
        score += r.fiber * 1.6 - r.fat * 0.7 + (fish ? 12 : 0) + (r.diet === 'nonveg' ? -8 : 0);
        break;
      case 'ironRich':
        score += r.protein * 0.6 + (heme ? 14 : 0) + r.fiber * 0.4;
        break;
      case 'weightLoss':
        score += r.protein * 0.5 + r.fiber * 1.2 - r.kcal * 0.05;
        break;
      case 'muscleGain':
        score += r.protein * 0.7 + r.kcal * 0.015;
        break;
    }
  }
  return score;
}

/** Rank a slot's candidate recipes best-first for the active modes (stable when no modes). */
export function rankByModes<T extends ScorableRecipe>(recipes: T[], modes: PlanningMode[]): T[] {
  if (modes.length === 0) return recipes;
  return [...recipes].sort((a, b) => scoreRecipe(b, modes) - scoreRecipe(a, modes));
}

/** Human-facing rationale (modes + resolved citations) to show on the planner. */
export function planGuidance(flags: Record<string, MarkerStatus>, goal: string): PlanGuidance | null {
  const modes = planningModes(flags, goal);
  if (modes.length === 0) return null;
  const citeIds = [...new Set(modes.flatMap((m) => m.citations))];
  return {
    modes,
    summary: `This week is tuned to your profile: ${modes.map((m) => m.label).join(', ')}.`,
    citations: citeIds.map((id) => CITATIONS[id]).filter(Boolean),
  };
}
