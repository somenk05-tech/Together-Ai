import { FAT_KCAL_SHARE, GOAL_DELTA, energyTarget, type Sex } from '../shared/energy';
/**
 * Together City — Fitness Engine
 * ------------------------------------------------------------------
 * Produces a weekly training plan that is differentiated by AGE and by HEALTH
 * CONDITIONS. Age sets the base template and heart-rate zones; biomarker- and
 * record-derived conditions then modify intensity, recovery and session mix.
 *
 * Like Beauty, Fitness reads the user's biomarkers only through the Medical Hub's
 * consent gate (iron, glucose, inflammation). When consent is revoked the plan
 * still builds from age + declared conditions, just without the lab layer.
 *
 * Grounded in recognised exercise guidelines (cited on every adjustment):
 *   [WHO-PA]   WHO Guidelines on Physical Activity & Sedentary Behaviour, 2020.
 *   [ACSM]     ACSM's Guidelines for Exercise Testing and Prescription.
 *   [TANAKA]   Tanaka H et al., J Am Coll Cardiol 2001;37:153-156 (HRmax = 208 − 0.7·age).
 *   [ADA-EX]   Colberg SR et al., ADA "Physical Activity/Exercise and Diabetes",
 *              Diabetes Care 2016;39:2065-2079.
 *   [GSSI-IRON]Gatorade Sports Science Institute — iron deficiency in athletes.
 *   [NECK-CHECK]Eichner ER, "The Neck Check", Phys Sportsmed 1996.
 *   [NSCA-OA]  NSCA Position Statement: Resistance Training for Older Adults.
 *   [ACSM-HTN] ACSM FITT recommendations for hypertension (with AHA).
 *
 * Educational programming — NOT a substitute for clearance from a clinician,
 * especially with a diagnosed condition, in pregnancy, or if symptomatic.
 */

export interface Citation { id: string; label: string; ref: string }

export const FIT_CITATIONS: Record<string, Citation> = {
  'WHO-PA': { id: 'WHO-PA', label: 'WHO Physical Activity Guidelines (2020)', ref: 'WHO Guidelines on Physical Activity & Sedentary Behaviour, 2020' },
  'ACSM': { id: 'ACSM', label: 'ACSM Guidelines for Exercise Testing & Prescription', ref: 'American College of Sports Medicine — intensity & FITT tables' },
  'TANAKA': { id: 'TANAKA', label: 'Tanaka HRmax formula (2001)', ref: 'Tanaka H, Monahan KD, Seals DR. J Am Coll Cardiol 2001;37:153-156' },
  'ADA-EX': { id: 'ADA-EX', label: 'ADA Exercise & Diabetes (2016)', ref: 'Colberg SR et al., Diabetes Care 2016;39:2065-2079' },
  'GSSI-IRON': { id: 'GSSI-IRON', label: 'GSSI — iron deficiency in athletes', ref: 'Gatorade Sports Science Institute review (three-stage iron model)' },
  'NECK-CHECK': { id: 'NECK-CHECK', label: 'The Neck Check (Eichner, 1996)', ref: 'Eichner ER, Phys Sportsmed 1996 — training when systemically unwell' },
  'NSCA-OA': { id: 'NSCA-OA', label: 'NSCA Resistance Training for Older Adults', ref: 'NSCA Position Statement — sarcopenia & progressive resistance' },
  'ACSM-HTN': { id: 'ACSM-HTN', label: 'ACSM/AHA hypertension FITT', ref: 'ACSM FITT recommendations for hypertension' },
  'MIFFLIN': { id: 'MIFFLIN', label: 'Mifflin-St Jeor equation (1990)', ref: 'Mifflin MD et al., Am J Clin Nutr 1990;51:241-247 — resting energy' },
  'ISSN-PRO': { id: 'ISSN-PRO', label: 'ISSN protein position stand (2017)', ref: 'Jäger R et al., J Int Soc Sports Nutr 2017;14:20 — 1.4–2.2 g/kg' },
};
const cite = (ids: string[]): Citation[] => ids.map((id) => FIT_CITATIONS[id]).filter(Boolean);

// ─────────────────────────── age bands ───────────────────────────
export interface AgeBand {
  key: string; label: string; min: number; max: number;
  summary: string;
  aerobicMin: number;        // WHO moderate min/week (lower bound)
  aerobicMax: number;        // WHO moderate upper bound
  resistanceDays: number;    // muscle-strengthening days/week
  balanceDays: number;       // multicomponent balance (65+)
  defaultCap: Intensity;     // ceiling the band tolerates by default
  citations: string[];
}
export type Intensity = 'light' | 'moderate' | 'vigorous';

export const AGE_BANDS: AgeBand[] = [
  { key: 'youngAdult', label: 'Young adult (18–39)', min: 18, max: 39,
    summary: 'Full intensity available. Build the aerobic + strength base and progress load steadily.',
    aerobicMin: 150, aerobicMax: 300, resistanceDays: 2, balanceDays: 0, defaultCap: 'vigorous', citations: ['WHO-PA'] },
  { key: 'midlife', label: 'Midlife (40–54)', min: 40, max: 54,
    summary: 'Keep vigorous work but respect recovery; strength training protects against age-related muscle loss.',
    aerobicMin: 150, aerobicMax: 300, resistanceDays: 2, balanceDays: 0, defaultCap: 'vigorous', citations: ['WHO-PA'] },
  { key: 'preSenior', label: 'Pre-senior (55–64)', min: 55, max: 64,
    summary: 'Prioritise consistency and strength; add mobility. Vigorous intervals are fine if you are well-conditioned.',
    aerobicMin: 150, aerobicMax: 300, resistanceDays: 3, balanceDays: 0, defaultCap: 'vigorous', citations: ['WHO-PA', 'ACSM'] },
  { key: 'olderAdult', label: 'Older adult (65+)', min: 65, max: 200,
    summary: 'Add multicomponent balance/functional training on ≥3 days for fall prevention; resistance starts lighter and progresses.',
    aerobicMin: 150, aerobicMax: 300, resistanceDays: 3, balanceDays: 3, defaultCap: 'moderate', citations: ['WHO-PA', 'NSCA-OA'] },
];

export function ageBandFor(age: number): AgeBand {
  return AGE_BANDS.find((b) => age >= b.min && age <= b.max) ?? AGE_BANDS[0];
}

/** Tanaka HRmax (more accurate across the adult span than 220−age) + ACSM zones. */
export function heartRate(age: number) {
  const hrMax = Math.round(208 - 0.7 * age);
  const pct = (lo: number, hi: number) => [Math.round(hrMax * lo), Math.round(hrMax * hi)] as [number, number];
  return {
    hrMax,
    formula: '208 − 0.7 × age',
    zones: {
      light: pct(0.57, 0.63),
      moderate: pct(0.64, 0.76),
      vigorous: pct(0.77, 0.95),
    },
    citations: cite(['TANAKA', 'ACSM']),
  };
}

// ─────────────────────────── conditions ───────────────────────────
/** Condition keys the engine reasons about (from labs via consent, or declared). */
export type ConditionKey = 'anemia' | 'glycemic' | 'dyslipidemia' | 'inflammation' | 'hypertension' | 'pregnancy' | 'jointPain';

export interface ConditionAdjustment {
  key: ConditionKey;
  source: 'labs' | 'records' | 'declared';
  title: string;
  detail: string;            // human trigger (e.g. "Ferritin 18 ng/mL — low")
  effect: string;            // what it changes in the plan
  citations: Citation[];
}

const INTENSITY_ORDER: Intensity[] = ['light', 'moderate', 'vigorous'];
const capMin = (a: Intensity, b: Intensity): Intensity =>
  INTENSITY_ORDER[Math.min(INTENSITY_ORDER.indexOf(a), INTENSITY_ORDER.indexOf(b))];

/** Derive lab-based conditions from a shared biomarker panel (reuses the clinical flags shape). */
export function conditionsFromLabs(flags: Record<string, string>, values: Record<string, number>): ConditionAdjustment[] {
  const out: ConditionAdjustment[] = [];
  if (flags.ferritin === 'low' || flags.hb === 'low') {
    out.push({ key: 'anemia', source: 'labs', title: 'Low iron / anaemia',
      detail: `Ferritin ${values.ferritin ?? '—'} ng/mL, Hb ${values.hb ?? '—'} g/dL`,
      effect: 'Aerobic capacity is reduced and RPE runs high — intensity is capped to moderate and an extra recovery day is added until iron is restored.',
      citations: cite(['GSSI-IRON']) });
  }
  if (flags.hba1c === 'high') {
    out.push({ key: 'glycemic', source: 'labs', title: 'Elevated glucose (HbA1c)',
      detail: `HbA1c ${values.hba1c ?? '—'}%`,
      effect: 'Aerobic spread to ≥3 days with no 2 consecutive days off, resistance 2–3×/week, post-meal walks and breaking up sitting every 30 min to improve glycaemic control.',
      citations: cite(['ADA-EX']) });
  }
  if (flags.ldl === 'high' || flags.trig === 'high') {
    out.push({ key: 'dyslipidemia', source: 'labs', title: 'Raised lipids',
      detail: `LDL ${values.ldl ?? '—'}, Trig ${values.trig ?? '—'} mg/dL`,
      effect: 'Aerobic emphasis — more weekly moderate cardio minutes, which most improves the lipid profile.',
      citations: cite(['ACSM-HTN', 'WHO-PA']) });
  }
  if (flags.crp === 'high') {
    out.push({ key: 'inflammation', source: 'labs', title: 'Systemic inflammation (CRP)',
      detail: `CRP ${values.crp ?? '—'} mg/L`,
      effect: 'This week is a deload: intensity capped to light–moderate, vigorous intervals removed, recovery prioritised (the "neck check" — don\'t train hard while systemically unwell).',
      citations: cite(['NECK-CHECK']) });
  }
  return out;
}

/** Conditions the user declares in their fitness profile, or that come from Medical records. */
export function conditionsFromDeclared(keys: string[], source: 'records' | 'declared'): ConditionAdjustment[] {
  const out: ConditionAdjustment[] = [];
  if (keys.includes('hypertension')) {
    out.push({ key: 'hypertension', source, title: 'High blood pressure',
      detail: 'Declared / on record',
      effect: 'Aerobic-led plan; resistance kept to moderate load with no breath-holding (exhale on effort) to avoid blood-pressure spikes.',
      citations: cite(['ACSM-HTN']) });
  }
  if (keys.includes('diabetes')) {
    out.push({ key: 'glycemic', source, title: 'Diabetes (on record)',
      detail: 'From your Medical records',
      effect: 'Reinforces the glycaemic plan: aerobic ≥3 days, resistance 2–3×, post-meal walks, break up sitting.',
      citations: cite(['ADA-EX']) });
  }
  if (keys.includes('pregnancy')) {
    out.push({ key: 'pregnancy', source, title: 'Pregnancy',
      detail: 'Declared',
      effect: 'Intensity capped to moderate, no supine core after the first trimester, avoid contact/fall-risk work — please train under your maternity clinician\'s guidance.',
      citations: cite(['ACSM']) });
  }
  if (keys.includes('jointPain')) {
    out.push({ key: 'jointPain', source, title: 'Joint sensitivity',
      detail: 'Declared',
      effect: 'Swaps high-impact intervals for low-impact cardio (cycling, swimming, elliptical) and controlled-range strength.',
      citations: cite(['ACSM']) });
  }
  return out;
}

// ─────────────────────────── weekly plan ───────────────────────────
export interface Session {
  day: string;
  focus: string;
  detail: string;
  intensity: Intensity;
  minutes: number;
  kind: 'aerobic' | 'strength' | 'balance' | 'mobility' | 'recovery';
}

export interface WeeklyPlan {
  age: number;
  sex: string;
  band: { key: string; label: string; summary: string; citations: Citation[] };
  level: string;
  mode: string;
  goal: string;
  heart: ReturnType<typeof heartRate>;
  intensityCap: Intensity;
  weeklyTargets: {
    aerobicMinutes: string;      // e.g. "150–300 min moderate"
    resistanceDays: number;
    balanceDays: number;
    note: string;
  };
  sessions: Session[];
  adjustments: ConditionAdjustment[];
  habits: string[];
  safety: string[];
  disclaimer: string;
  usedLabs: boolean;
}

const GOAL_LABEL: Record<string, string> = {
  general: 'General health', weightLoss: 'Weight loss', strength: 'Strength', endurance: 'Endurance',
};

type BareSession = Omit<Session, 'day'>;

/** Compose the training days for a modality + level, respecting the resolved intensity cap. */
function composeSessions(o: {
  mode: string; level: LevelDef; cap: Intensity; clamp: (i: Intensity) => Intensity;
  deload: boolean; aerobicEmphasis: boolean; lowImpact: boolean; strengthLoadNote: string; goal: string;
}): BareSession[] {
  const { level, clamp, deload, aerobicEmphasis, lowImpact, strengthLoadNote } = o;
  const days = level.days;
  const S = (focus: string, detail: string, intensity: Intensity, minutes: number, kind: Session['kind']): BareSession =>
    ({ focus, detail, intensity, minutes, kind });
  const cardioName = lowImpact ? 'Low-impact cardio (cycle / swim)' : 'Brisk cardio';
  const out: BareSession[] = [];

  if (o.mode === 'strength') {
    // Weight-training split by level, plus cardio for heart health.
    const splits = level.key === 'athlete'
      ? ['Push (chest/shoulders/triceps)', 'Pull (back/biceps)', 'Legs', 'Upper power', 'Lower power', 'Accessory / arms']
      : level.key === 'advanced'
      ? ['Push', 'Pull', 'Legs', 'Upper', 'Lower']
      : level.key === 'intermediate'
      ? ['Upper body', 'Lower body', 'Full-body', 'Full-body']
      : ['Full-body strength', 'Full-body strength', 'Full-body strength'];
    for (let i = 0; i < days; i++) {
      out.push(S(splits[i % splits.length] + ' — weights', strengthLoadNote, clamp(deload ? 'light' : 'moderate'), 45, 'strength'));
      if (i === 1) out.push(S(cardioName, 'Zone-2 cardio for recovery & heart health', clamp(deload ? 'light' : 'moderate'), 30, 'aerobic'));
    }
  } else if (o.mode === 'walking') {
    // Progressive walking volume; power-walk intervals for higher levels.
    const base = level.key === 'basic' ? 20 : level.key === 'beginner' ? 30 : level.key === 'intermediate' ? 40 : 50;
    for (let i = 0; i < days; i++) {
      const interval = (level.key === 'advanced' || level.key === 'athlete') && i === Math.floor(days / 2);
      out.push(interval
        ? S('Power-walk intervals', '3 min brisk / 2 min easy × 5 — hills if available', clamp('vigorous'), base, 'aerobic')
        : S('Steady walk', `${base} min at a conversational-to-brisk pace`, clamp(deload ? 'light' : 'moderate'), base, 'aerobic'));
    }
    out.push(S('Full-body strength', '2 sets of 8–12, supports posture & bone', clamp('moderate'), 25, 'strength'));
  } else if (o.mode === 'running') {
    // Run plan scaled to level: walk-run → continuous → tempo/interval/long.
    if (level.key === 'basic' || level.key === 'beginner') {
      for (let i = 0; i < days; i++) out.push(S('Walk–run intervals', 'Run 1 min / walk 2 min × 8 (build the run portion weekly)', clamp(deload ? 'light' : 'moderate'), 30, 'aerobic'));
    } else if (level.key === 'intermediate') {
      out.push(S('Easy run', 'Continuous easy pace', clamp('moderate'), 35, 'aerobic'));
      out.push(S('Tempo run', 'Comfortably-hard middle 20 min', clamp('vigorous'), 40, 'aerobic'));
      out.push(S('Long run', 'Slow, longer distance', clamp('moderate'), 55, 'aerobic'));
      out.push(S('Easy run', 'Recovery pace', clamp('moderate'), 30, 'aerobic'));
    } else {
      out.push(S('Interval session', '6–8 × 800 m at 5K effort, jog recovery', clamp('vigorous'), 50, 'aerobic'));
      out.push(S('Easy run', 'Aerobic base', clamp('moderate'), 45, 'aerobic'));
      out.push(S('Tempo run', 'Threshold effort 25–30 min', clamp('vigorous'), 50, 'aerobic'));
      out.push(S('Easy run', 'Recovery pace', clamp('moderate'), 35, 'aerobic'));
      out.push(S('Long run', 'Endurance builder', clamp('moderate'), 75, 'aerobic'));
      if (level.key === 'athlete') out.push(S('Hill / strides', 'Short hill repeats + strides', clamp('vigorous'), 40, 'aerobic'));
    }
    out.push(S('Runner strength', 'Single-leg, core & glute work', clamp('moderate'), 30, 'strength'));
  } else {
    // mixed / balanced
    for (let i = 0; i < days; i++) {
      if (i % 2 === 0) out.push(S('Full-body strength', strengthLoadNote, clamp(deload ? 'light' : 'moderate'), 40, 'strength'));
      else out.push(S(cardioName, aerobicEmphasis ? 'Steady moderate effort — a key session for your labs' : (o.cap === 'vigorous' && !deload ? 'Intervals / conditioning' : 'Sustained moderate effort'), clamp(deload ? 'light' : (o.cap === 'vigorous' && !aerobicEmphasis ? 'vigorous' : 'moderate')), 35, 'aerobic'));
    }
  }
  return out.slice(0, 6); // leave room for balance/mobility/recovery
}

/** Ability levels, basic → super-athletic. Each sets training days + a starting ceiling. */
export interface LevelDef { key: string; label: string; days: number; cap: Intensity; note: string }
export const LEVELS: LevelDef[] = [
  { key: 'basic', label: 'Basic (just starting)', days: 3, cap: 'moderate', note: 'Very achievable sessions to build the habit; intensity stays comfortable.' },
  { key: 'beginner', label: 'Beginner', days: 3, cap: 'vigorous', note: 'A steady base with room to push a little.' },
  { key: 'intermediate', label: 'Intermediate', days: 4, cap: 'vigorous', note: 'Four quality sessions with structured intensity.' },
  { key: 'advanced', label: 'Advanced', days: 5, cap: 'vigorous', note: 'Five sessions with intervals and progressive load.' },
  { key: 'athlete', label: 'Super-athletic', days: 6, cap: 'vigorous', note: 'High volume with hard/easy days and dedicated conditioning.' },
];
export function levelDef(key: string): LevelDef { return LEVELS.find((l) => l.key === key) ?? LEVELS[1]; }

/** Training modality — what the week is built around. */
export interface ModeDef { key: string; label: string; note: string }
export const MODES: ModeDef[] = [
  { key: 'mixed', label: 'Mixed (balanced)', note: 'A blend of strength and cardio for all-round health.' },
  { key: 'strength', label: 'Weight training', note: 'Resistance-led split with cardio for heart health.' },
  { key: 'walking', label: 'Walking', note: 'Progressive walking volume, with light strength support.' },
  { key: 'running', label: 'Running', note: 'A run plan scaled to your level, with strength support.' },
];
export function modeDef(key: string): ModeDef { return MODES.find((m) => m.key === key) ?? MODES[0]; }

/**
 * Build the differentiated weekly plan. Age → base template + zones + ceiling;
 * level → training days + intensity; mode → what the sessions are; conditions →
 * cap intensity, add recovery/balance, reshape the week.
 */
export function buildPlan(input: {
  age: number; sex: string; level: string; goal: string; mode: string;
  labConditions: ConditionAdjustment[]; declaredConditions: ConditionAdjustment[]; usedLabs: boolean;
}): WeeklyPlan {
  const { age, sex, goal } = input;
  const band = ageBandFor(age);
  const heart = heartRate(age);
  const lvl = levelDef(input.level);
  const mode = modeDef(input.mode);
  const adjustments = [...input.labConditions, ...input.declaredConditions];
  const keys = new Set(adjustments.map((a) => a.key));

  // Resolve intensity ceiling: min of age default and level ceiling, then conditions lower it.
  let cap = capMin(band.defaultCap, lvl.cap);
  if (keys.has('anemia') || keys.has('pregnancy')) cap = capMin(cap, 'moderate');
  if (keys.has('inflammation')) cap = capMin(cap, 'light'); // deload week
  const deload = keys.has('inflammation');
  const aerobicEmphasis = keys.has('glycemic') || keys.has('dyslipidemia') || keys.has('hypertension');
  const lowImpact = keys.has('jointPain');
  const addBalance = band.balanceDays > 0;
  const clamp = (i: Intensity): Intensity => capMin(i, cap);

  // condition-aware strength load cue
  const strengthLoadNote = band.key === 'olderAdult'
    ? 'Start light (40–50% effort), 10–15 reps, progress slowly'
    : keys.has('hypertension') ? 'Moderate load, 8–12 reps, exhale on effort (no breath-holding)'
    : lvl.key === 'athlete' ? 'Heavy, 4–5 sets of 3–6' : lvl.key === 'advanced' ? 'Progressive load, 3–4 sets of 6–10' : '2–3 sets of 8–12, controlled tempo';

  const week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const sessions: Session[] = [];
  const plan = composeSessions({ mode: mode.key, level: lvl, cap, clamp, deload, aerobicEmphasis, lowImpact, strengthLoadNote, goal });

  // Age: older adults get balance/functional sessions (fall prevention)
  if (addBalance && !plan.some((p) => p.kind === 'balance')) {
    plan.push({ focus: 'Balance & functional', detail: 'Standing balance, sit-to-stand, step-ups — fall prevention', intensity: 'light', minutes: 25, kind: 'balance' });
  }
  if (!plan.some((p) => p.kind === 'mobility')) {
    plan.push({ focus: 'Mobility & stretch', detail: 'Full-body mobility and breathing', intensity: 'light', minutes: 20, kind: 'mobility' });
  }
  while (plan.length < 7) plan.push({ focus: 'Rest / active recovery', detail: 'Walk, light stretch, sleep', intensity: 'light', minutes: 0, kind: 'recovery' });
  for (let i = 0; i < 7; i++) sessions.push({ day: week[i], ...plan[i % plan.length] });

  // Habits (condition-driven daily practices)
  const habits: string[] = [];
  if (keys.has('glycemic')) {
    habits.push('Three ~15-min walks after meals to blunt post-meal glucose.');
    habits.push('Stand and move for 2–3 min every 30 min of sitting.');
  }
  if (keys.has('anemia')) habits.push('Expect higher perceived effort — back off if breathless; iron repletion comes first.');
  if (keys.has('inflammation')) habits.push('Neck check: if you have fever, body aches or chest symptoms, rest — do not train hard.');
  if (band.key === 'olderAdult') habits.push('Protein at each meal supports the strength work against muscle loss.');
  if (habits.length === 0) habits.push('Aim for 7–9 h sleep and 8–10k daily steps to support the plan.');

  const safety: string[] = [
    'Warm up 5–10 min and cool down; progress load/volume by ~10% per week at most.',
  ];
  if (keys.has('hypertension')) safety.push('Avoid breath-holding (Valsalva) and maximal lifts; stop if you feel chest pressure or dizziness.');
  if (keys.has('pregnancy')) safety.push('Train under your maternity clinician; avoid supine core after the first trimester and any fall-risk activity.');
  if (cap === 'light') safety.push('Intensity is capped to light this week — resume normal training once the flag clears.');

  return {
    age, sex,
    band: { key: band.key, label: band.label, summary: band.summary, citations: cite(band.citations) },
    level: lvl.label, mode: mode.label, goal: GOAL_LABEL[goal] ?? goal,
    heart,
    intensityCap: cap,
    weeklyTargets: {
      aerobicMinutes: `${band.aerobicMin}–${band.aerobicMax} min moderate (or ${Math.round(band.aerobicMin / 2)}–${Math.round(band.aerobicMax / 2)} vigorous)`,
      resistanceDays: band.resistanceDays,
      balanceDays: band.balanceDays,
      note: addBalance ? 'Includes ≥3 days balance/functional training for fall prevention (65+).' : 'Muscle-strengthening on ≥2 days covering all major muscle groups.',
    },
    sessions,
    adjustments,
    habits,
    safety,
    disclaimer: 'Educational programming grounded in established exercise guidelines — not medical clearance. Check with your doctor before starting, especially with a diagnosed condition, in pregnancy, or if you have chest symptoms.',
    usedLabs: input.usedLabs,
  };
}

// ─────────────────────────── body goal ↔ nutrition ───────────────────────────
// The reverse-connect: a target body composition drives calories, macros and the
// workout emphasis, and syncs the derived goal into the Nutrition Hub so meal plans
// adapt. Biomarkers (from the Medical Hub, via consent) surface what the plan improves.

export interface BodyGoalDef {
  key: string;
  label: Record<string, string>;   // sex-aware display label
  tag: string;
  nutritionGoal: 'lose' | 'maintain' | 'gain';
  proteinPerKg: number;            // g/kg bodyweight
  rate: string;                    // safe rate of change
  emphasis: string;                // training emphasis
  citations: string[];
}

/** Health-focused composition goals (not idealised physiques) — sex-aware labels. */
export const BODY_GOALS: BodyGoalDef[] = [
  { key: 'buildMuscle', label: { male: 'Build muscle (strong & muscular)', female: 'Build & tone (strong, sculpted)', other: 'Build muscle & strength' },
    tag: 'Gain lean mass with a controlled surplus and high protein.',
    nutritionGoal: 'gain', proteinPerKg: 2.0, rate: '+0.25–0.5% bodyweight/week (minimise fat gain)',
    emphasis: 'Progressive resistance training, 6–12 rep hypertrophy range, prioritised over cardio.', citations: ['ISSN-PRO', 'ACSM'] },
  { key: 'leanDefine', label: { male: 'Lean & defined', female: 'Lean & sculpted', other: 'Lean & defined' },
    tag: 'Reveal definition with a mild deficit while holding onto muscle.',
    nutritionGoal: 'lose', proteinPerKg: 2.1, rate: '−0.5% bodyweight/week',
    emphasis: 'Keep lifting heavy to retain muscle; add moderate cardio for the deficit.', citations: ['ISSN-PRO', 'ACSM'] },
  { key: 'athletic', label: { male: 'Athletic / functional', female: 'Athletic / functional', other: 'Athletic / functional' },
    tag: 'Perform and look athletic at roughly maintenance calories.',
    nutritionGoal: 'maintain', proteinPerKg: 1.8, rate: 'Hold weight; recompose slowly',
    emphasis: 'Balanced strength + conditioning; train for performance.', citations: ['ISSN-PRO', 'WHO-PA'] },
  { key: 'fatLoss', label: { male: 'Fat loss & metabolic health', female: 'Fat loss & metabolic health', other: 'Fat loss & metabolic health' },
    tag: 'Lose fat and improve metabolic markers with a clear deficit.',
    nutritionGoal: 'lose', proteinPerKg: 1.9, rate: '−0.5 to −1% bodyweight/week',
    emphasis: 'Resistance training to preserve muscle + more aerobic minutes for the deficit and metabolic health.', citations: ['ISSN-PRO', 'ADA-EX', 'ACSM'] },
];
export function bodyGoalDef(key: string): BodyGoalDef { return BODY_GOALS.find((g) => g.key === key) ?? BODY_GOALS[2]; }

export interface BodyProgram {
  goalKey: string;
  goalLabel: string;
  tag: string;
  hasMetrics: boolean;          // whether height/weight were supplied
  /** Null when the energy cannot be computed. See `missing`. */
  bmr: number | null;
  tdee: number | null;
  calorieTarget: number | null;
  macros: { proteinG: number; fatG: number; carbG: number } | null;
  /** What we would need and do not have: weight, height, sex, activity. */
  missing: string[];
  proteinPerKg: number;
  /** The training dose this body goal asks for, kept for the explanation even
   *  when the clinical prescription is the one on the screen. */
  trainingProteinG: number | null;
  proteinNote: string | null;
  /** What THIS body goal alone would have asked for, in kcal — kept for the
   *  explanation even when Nutrition's figure is the one on the screen. */
  trainingKcal: number | null;
  calorieNote: string | null;
  rate: string;
  emphasis: string;
  nutrition: { goal: 'lose' | 'maintain' | 'gain'; proteinTarget: number; note: string };
  healthImprovements: { title: string; detail: string; citations: Citation[] }[];
  citations: Citation[];
  disclaimer: string;
}

/** Compute the integrated body-composition program (medical + workout + nutrition). */
export function computeBodyProgram(input: {
  age: number; sex: string; heightCm?: number | null; weightKg?: number | null;
  /** The citizen's activity factor from the Master Profile. Not their ability. */
  activity?: number | null;
  bodyGoal: string; labFlags?: Record<string, string>; labValues?: Record<string, number>;
  /**
   * The protein target Nutrition already computed for this person, in grams.
   *
   * Passed in rather than recomputed here on purpose: the clinical rule reads
   * conditions, pregnancy, age and kidney staging, and a second copy of it in
   * this file is a second copy that will drift. When it is absent — the engine
   * called with nothing but a body — this page falls back to the training dose
   * and says so.
   */
  clinicalProteinG?: number | null;
  /**
   * The day's energy Nutrition already computed for this person, in kcal.
   *
   * Same argument as the protein above, and the same direction of authority:
   * Nutrition holds the clinical context — the safe-rate cap, the energy
   * floor, a withheld surplus at BMI ≥ 27, pregnancy and lactation additions,
   * kidney staging — and it is the number the meal plans, the portions and the
   * grocery list are actually built from. A second figure on this page was a
   * second answer to "what do I eat today", and the citizen had no way to know
   * which one their food was coming from. Absent, this page falls back to its
   * own goal's figure and says so.
   */
  clinicalKcal?: number | null;
  /** How Nutrition's goal reads in words — "losing weight", "maintaining".
   *  The note names the setting that disagrees; naming it is the difference
   *  between an explanation and an apology. */
  clinicalGoalLabel?: string | null;
}): BodyProgram {
  const g = bodyGoalDef(input.bodyGoal);
  const hasMetrics = Boolean(input.heightCm && input.weightKg);

  /**
   * ONE ENERGY COMPUTATION, AND THIS FUNCTION USED TO BE A SECOND ONE.
   *
   * It had its own Mifflin-St Jeor line, its own activity factors derived from
   * the citizen's ABILITY rating, and its own goal model — a flat percentage of
   * TDEE with no safe-rate cap and no energy floor. shared/energy.ts has had all
   * of that, correctly, the whole time.
   *
   * energyTarget's `deltaPct` is GOAL_DELTA — the city's one policy, shared
   * with Nutrition — no longer a hub-local number. What the citizen
   * gains is the ≤550 kcal/day cap and ENERGY_FLOOR, which this side never had:
   * a small woman on a fat-loss goal was handed 0.8 × TDEE with nothing
   * underneath it.
   *
   * AND IT REFUSES NOW. It used to substitute 70 kg, 172 cm, and the male sex
   * constant for anybody who had not said, then print the result as "Your daily
   * diet targets". Refusing is the same call already made for nutrition: a
   * number attributed to somebody, computed from a body that is not theirs, is
   * worse than an empty space.
   */
  const sex: Sex | null = input.sex === 'male' || input.sex === 'female' ? input.sex : null;
  const missing = [
    !input.weightKg && 'weight',
    !input.heightCm && 'height',
    !sex && 'sex',
    !input.activity && 'activity level',
  ].filter(Boolean) as string[];

  if (missing.length || !sex || !input.weightKg || !input.heightCm || !input.activity) {
    return {
      goalKey: g.key, goalLabel: g.label[input.sex] ?? g.label.other, tag: g.tag,
      hasMetrics, bmr: null, tdee: null, calorieTarget: null, macros: null, missing,
      proteinPerKg: g.proteinPerKg, trainingProteinG: null, proteinNote: null,
      trainingKcal: null, calorieNote: null,
      rate: g.rate, emphasis: g.emphasis,
      nutrition: {
        goal: g.nutritionGoal, proteinTarget: 0,
        note: `Your goal is synced to Nutrition as "${g.nutritionGoal}", so your meal plans follow it. Calorie and protein numbers need your ${missing.join(', ')}.`,
      },
      healthImprovements: [], citations: cite(g.citations),
      disclaimer:
        'Your training programme does not need these numbers. Calorie and macro targets appear '
        + 'once the details above are added — they are only ever computed from your own body. '
        + 'Not a substitute for a dietitian or doctor.',
    };
  }

  const weight = input.weightKg;
  const energy = energyTarget({
    weightKg: weight, heightCm: input.heightCm, age: input.age, sex,
    activity: input.activity, goal: g.nutritionGoal, deltaPct: GOAL_DELTA[g.nutritionGoal],
  });
  const bmr = Math.round(energy.bmr);
  const tdee = Math.round(energy.tdee);
  /**
   * ONE DAY'S ENERGY PER PERSON, AND IT IS NUTRITION'S.
   *
   * BMR and TDEE stay: they are facts about a body — what it burns at rest and
   * in a day — and neither is a target. `calorieTarget` is what to EAT, and
   * that had two answers because this person has two goal settings: the body
   * goal here (Athletic → maintain, ±0%) and the nutrition goal there (lose,
   * −18%). Same equation, same body, same activity factor; 2993 against 2455,
   * on a difference nobody had told them about.
   *
   * The owner's call is that Nutrition's is the real one, and the reason is
   * that it is the only one that was ever load-bearing: every meal plan, every
   * portion, the food journal and the grocery list are built from it. Making
   * this page follow it changes nothing anybody eats; making Nutrition follow
   * this page would have moved every plan in the city by 538 kcal.
   *
   * What the body goal must NOT be allowed to do is sit on a deficit in
   * silence. `calorieNote` says the training figure, says the eating figure,
   * and names the two settings that disagree — see below.
   */
  const trainingKcal = energy.kcal;
  const calorieTarget = input.clinicalKcal ?? trainingKcal;
  /**
   * ONE PROTEIN NUMBER PER PERSON, AND IT IS THE CLINICAL ONE.
   *
   * This page used to dose `proteinPerKg × actual weight` — 1.8 × 103 = 185 g —
   * while Nutrition doses against REFERENCE weight, on the principle that you
   * do not prescribe protein for adipose tissue. Both are cited and both are
   * right about different questions, and the citizen saw 185 g on one screen
   * and 74 g on another with nothing to tell them which to eat.
   *
   * Safety rules are the final word, the same call already made when the gain
   * surplus is withheld at BMI ≥ 27. So the clinical dose is the number, and
   * the training dose becomes a sentence explaining what it would have asked
   * for and why this is lower. Nothing is hidden; one of them is just no
   * longer pretending to be a second target.
   */
  const trainingProteinG = Math.round(g.proteinPerKg * weight);
  const proteinG = input.clinicalProteinG ?? trainingProteinG;
  const proteinNote = input.clinicalProteinG != null && input.clinicalProteinG !== trainingProteinG
    ? `Training for this goal would ask for about ${trainingProteinG} g (${g.proteinPerKg} g/kg of your current weight). `
      + `Your target is ${proteinG} g, dosed against a reference weight for your height — protein is prescribed for lean mass, not for body fat. `
      + 'Nutrition, your meal plans and your grocery list all use this same figure.'
    : null;
  /**
   * Both macros are re-derived off whichever energy figure won, with the
   * city's one fat share — so the row adds back up to the day rather than
   * only the calorie cell agreeing. The per-goal fat percentages this file
   * used to carry (0.27 / 0.28 / 0.30) are gone with the second calorie
   * number; a goal expresses itself in protein and in training emphasis.
   */
  const fatG = Math.round((calorieTarget * FAT_KCAL_SHARE) / 9);
  const carbG = Math.max(0, Math.round((calorieTarget - proteinG * 4 - fatG * 9) / 4));
  const calorieNote = input.clinicalKcal != null && input.clinicalKcal !== trainingKcal
    ? `This goal on its own would ask for about ${trainingKcal} kcal a day. `
      + `Your target is ${calorieTarget} kcal, because your nutrition goal is set to "${input.clinicalGoalLabel ?? 'a different goal'}" — `
      + 'and that is the number your meal plans, portions, food journal and grocery list are all built from. '
      + 'Change it on your Nutrition profile and this page follows.'
    : null;

  const flags = input.labFlags ?? {};
  const values = input.labValues ?? {};
  const health: BodyProgram['healthImprovements'] = [];
  if (flags.hba1c === 'high') health.push({ title: 'Lower blood glucose', detail: `Your HbA1c is ${values.hba1c ?? 'raised'}. A ${g.nutritionGoal === 'lose' ? 'calorie deficit plus' : ''} aerobic + resistance combination is first-line to improve insulin sensitivity and HbA1c.`, citations: cite(['ADA-EX']) });
  if (flags.ldl === 'high' || flags.trig === 'high') health.push({ title: 'Improve your lipids', detail: 'The aerobic emphasis and higher-fibre, lower-saturated-fat diet directly target your raised LDL/triglycerides.', citations: cite(['ACSM-HTN', 'ISSN-PRO']) });
  if (flags.ferritin === 'low' || flags.hb === 'low') health.push({ title: 'Protect your iron first', detail: 'Iron stores are low — restore them before an aggressive deficit or hard endurance blocks, since dieting can worsen iron status and sap training quality.', citations: cite(['GSSI-IRON']) });
  if (flags.crp === 'high') health.push({ title: 'Calm inflammation', detail: 'CRP is raised — keep the deficit modest and prioritise recovery this block; hard dieting while inflamed impairs recovery.', citations: cite(['NECK-CHECK']) });

  return {
    goalKey: g.key,
    goalLabel: g.label[input.sex] ?? g.label.other,
    tag: g.tag,
    hasMetrics, bmr, tdee, calorieTarget, missing,
    macros: { proteinG, fatG, carbG },
    proteinPerKg: g.proteinPerKg,
    trainingProteinG, proteinNote,
    trainingKcal, calorieNote,
    rate: g.rate,
    emphasis: g.emphasis,
    nutrition: {
      goal: g.nutritionGoal, proteinTarget: proteinG,
      // FoodPref has no protein column, so the old wording — "with a 143 g/day
      // protein target, so your meal plans, targets and grocery list adapt
      // automatically" — named a number that syncNutrition does not write.
      // The goal genuinely does sync. The protein figure is this hub's own.
      // No longer two numbers with a note apologising for the gap: this page
      // shows the figure Nutrition computed, so there is one target to sync to
      // and one to eat.
      // THE ARROW TURNED ROUND. This used to say the goal was "synced to
      // Nutrition", which was true and was the bug: pressing sync overwrote
      // the nutrition goal and moved the day by 538 kcal without saying so.
      // Nutrition holds the goal now; this hub reads it.
      note: `Your ${calorieTarget} kcal and ${proteinG} g protein are the same figures Nutrition uses — the ones your meal plans, portions and grocery list are built from. Your body goal sets your training and your protein emphasis; your nutrition goal sets the day's energy.`,
    },
    healthImprovements: health,
    citations: cite([...new Set([...g.citations, 'MIFFLIN'])]),
    // The refusal branch returns before this point, so metrics are always
    // present here; the "population defaults" caption left with the defaults.
    disclaimer: 'Energy from your body metrics and activity level; targets are starting points — adjust from real-world progress. Not a substitute for a dietitian or doctor.',
  };
}
