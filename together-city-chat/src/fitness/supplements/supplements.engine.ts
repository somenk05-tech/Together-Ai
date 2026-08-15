import { SUPPLEMENTS, DO_NOT_RECOMMEND, INDIA_CONTEXT, SOURCE, type SupplementFact } from './knowledge';

/**
 * THE SUPPLEMENT ENGINE.
 *
 * The order of the pipeline is the whole design, and it runs the way the owner
 * specified it (15 Aug): recommendation → safety → interaction → clinical risk
 * → what the citizen sees. Never the other way round. A recommendation that is
 * filtered for safety AFTERWARDS has already been computed by something that
 * did not know about the warfarin, and the only thing standing between that
 * and the screen is a later line of code somebody may one day move.
 *
 * ── THE THREE RULES THIS FILE WILL NOT BEND ───────────────────────────────
 *
 * 1. IT NEVER INVENTS A DOSE. Every number it prints is a string copied out of
 *    `knowledge.ts`, which was read off a cited evidence review. There is no
 *    arithmetic on a lab value anywhere in this file, no scaling by body
 *    weight, no "roughly double it for a deficiency". Where a therapeutic dose
 *    is the honest answer, the engine returns `dose: null` and
 *    `needsClinician: true`, and the screen says so.
 *
 * 2. IT SEPARATES AN EDUCATIONAL SUGGESTION FROM A CLINICAL ONE. A base rate
 *    ("67% of Indian adults are below 20 ng/mL") is not a finding about the
 *    person reading it, and every reason this engine gives is tagged with what
 *    it came from — a LAB, their DIET, their GOAL, or a POPULATION statistic —
 *    so the difference is visible rather than implied by tone.
 *
 * 3. "NOT RECOMMENDED" IS A FIRST-CLASS ANSWER. Iron with no ferritin result,
 *    a multivitamin for disease prevention, beta-carotene for a smoker: the
 *    engine says so, with the trial that says so. A supplement screen that can
 *    only ever suggest buying something is an advertisement with a chart on it.
 */

export type Bucket = 'priority' | 'consider' | 'optional' | 'not-recommended';

/** What the engine is allowed to know. Everything here comes from the
 *  citizen's own hubs — nothing is guessed, and every field is optional
 *  because an engine that needs a complete profile answers nobody. */
export interface Citizen {
  age?: number;
  sex?: 'male' | 'female' | 'other';
  vegetarian?: boolean;
  vegan?: boolean;
  pregnant?: boolean;
  smoker?: boolean;
  goal?: 'muscle' | 'fatloss' | 'endurance' | 'wellness' | 'sleep' | 'recovery';
  trainsPerWeek?: number;
  /** Grams of protein a day, from the nutrition hub: what they need, what they eat. */
  proteinTargetG?: number;
  proteinIntakeG?: number;
  /** Free text as the citizen's own hubs hold it, matched case-insensitively. */
  conditions?: string[];
  medicines?: string[];
  /** Supplements they already take, so the engine can see a duplicate. */
  taking?: string[];
  /** Blood work, as filed. `name` is matched loosely; nothing is converted. */
  labs?: Array<{ name: string; value: number; unit?: string; at?: string }>;
}

export type ReasonFrom = 'lab' | 'diet' | 'goal' | 'fitness' | 'medicine' | 'population' | 'evidence';

export interface Reason {
  from: ReasonFrom;
  /** Said to the citizen, in their own data's terms. */
  text: string;
  /** Where it came from — a lab name, a source, a hub. */
  source?: string;
}

export interface Flag {
  kind: 'interaction' | 'condition' | 'upper-limit' | 'harm' | 'duplicate';
  text: string;
  source?: string;
}

export interface Recommendation {
  id: string;
  name: string;
  bucket: Bucket;
  grade: SupplementFact['grade'];
  gradeFor: string;
  form: string;
  /** ALWAYS a string from the knowledge base, or null when only a clinician
   *  should be putting a number here. Never computed. */
  dose: string | null;
  upperLimit: string;
  needsClinician: boolean;
  testFirst: boolean;
  why: Reason[];
  flags: Flag[];
  /** How well this supplement fits THIS citizen — never a score of the
   *  citizen. The parts are shown; a number nobody can take apart is a
   *  number nobody should trust. */
  fit: { score: number; parts: Array<{ label: string; note: string }> };
  source: string;
}

const has = (list: string[] | undefined, ...needles: string[]): boolean =>
  (list ?? []).some((x) => needles.some((n) => x.toLowerCase().includes(n)));

/** A lab result by loose name. Returns undefined rather than a default: a
 *  missing result is a different thing from a normal one, and the difference
 *  is the entire iron rule. */
const lab = (c: Citizen, ...names: string[]) =>
  (c.labs ?? []).find((l) => names.some((n) => l.name.toLowerCase().includes(n)));

const fact = (id: string): SupplementFact => {
  const f = SUPPLEMENTS.find((s) => s.id === id);
  if (!f) throw new Error(`supplement not in the knowledge base: ${id}`);
  return f;
};

/**
 * THE INTERACTION ENGINE, as a table rather than as prose.
 *
 * The knowledge base carries the review's interaction sentence for a human to
 * read; this is the same information in the shape a machine can match on. Both
 * exist on purpose — the sentence is what the citizen is shown, the keywords
 * are what the engine checks, and the spec beside this file asserts that every
 * entry here names a supplement that exists.
 */
const INTERACTIONS: Array<{ id: string; drugs: string[]; text: string }> = [
  { id: 'vitamin-d3', drugs: ['thiazide', 'hydrochlorothiazide', 'orlistat', 'prednis', 'corticosteroid'],
    text: 'Thiazide diuretics with vitamin D raise the risk of hypercalcaemia; orlistat cuts absorption and corticosteroids increase breakdown.' },
  { id: 'vitamin-b12', drugs: ['metformin', 'omeprazole', 'pantoprazole', 'esomeprazole', 'ranitidine', 'famotidine'],
    text: 'Metformin and acid-suppressing medicines deplete B12 over time — which is a reason to TEST, not a reason to stop the medicine.' },
  { id: 'omega-3', drugs: ['warfarin', 'aspirin', 'clopidogrel', 'apixaban', 'rivaroxaban'],
    text: 'Antiplatelet and anticoagulant medicines plus omega-3 needs a doctor’s view; atrial-fibrillation risk rises above 1 g/day.' },
  { id: 'magnesium', drugs: ['alendronate', 'bisphosphonate', 'doxycycline', 'tetracycline', 'ciprofloxacin', 'levofloxacin', 'quinolone'],
    text: 'Magnesium blocks absorption of bisphosphonates, tetracyclines and quinolones — space them by 2–6 hours.' },
  { id: 'iron', drugs: ['levothyroxine', 'thyroxine', 'omeprazole', 'pantoprazole'],
    text: 'Iron and levothyroxine must be four hours apart; acid suppression reduces iron absorption.' },
  { id: 'vitamin-k2', drugs: ['warfarin', 'acitrom', 'acenocoumarol'],
    text: 'Vitamin K antagonises warfarin directly. This is a hard interaction, not a caution.' },
  { id: 'coq10', drugs: ['warfarin'], text: 'CoQ10 may reduce warfarin’s effect.' },
  { id: 'curcumin', drugs: ['warfarin', 'clopidogrel', 'aspirin'],
    text: 'Piperine-boosted curcumin inhibits CYP3A4 and P-gp, which raises the levels of other medicines; it also adds to antiplatelet effect.' },
  { id: 'ashwagandha', drugs: ['levothyroxine', 'thyroxine', 'metformin', 'insulin', 'prednis', 'tacrolimus', 'sertraline', 'alprazolam'],
    text: 'Ashwagandha has liver and thyroid signals and interacts with thyroid hormone, antidiabetics, immunosuppressants and sedatives.' },
  { id: 'melatonin', drugs: ['fluvoxamine', 'warfarin', 'amlodipine', 'telmisartan'],
    text: 'Fluvoxamine markedly raises melatonin levels; it also interacts with warfarin and blood-pressure medicines.' },
  { id: 'l-theanine', drugs: ['alprazolam', 'clonazepam', 'amlodipine', 'telmisartan'],
    text: 'Additive with sedatives and with blood-pressure medicines.' },
  { id: 'vitamin-c', drugs: [], text: '' },
];

/** Conditions that change an answer regardless of what anybody wants. */
const CONDITION_STOPS: Array<{ id: string; match: string[]; text: string }> = [
  { id: 'protein', match: ['kidney', 'renal', 'ckd'], text: 'ICMR cautions against protein supplements in existing renal disease.' },
  { id: 'magnesium', match: ['kidney', 'renal', 'ckd'], text: 'Reduced kidney function changes how magnesium is cleared — this needs a doctor, not a shelf.' },
  { id: 'vitamin-c', match: ['haemochromatosis', 'hemochromatosis', 'kidney stone', 'oxalate'],
    text: 'Vitamin C boosts iron absorption (a hazard in haemochromatosis) and raises oxalate — a stone risk.' },
  { id: 'iron', match: ['haemochromatosis', 'hemochromatosis'], text: 'Iron is contraindicated in iron-overload disease.' },
  { id: 'curcumin', match: ['liver', 'hepat'], text: 'There are hepatotoxicity reports for curcumin.' },
  { id: 'ashwagandha', match: ['liver', 'hepat', 'thyroid'], text: 'Liver and thyroid signals make this the wrong one to try here.' },
];

const skipFor = (name: string) =>
  DO_NOT_RECOMMEND.find((s) => s.what.toLowerCase().includes(name.toLowerCase()));

/**
 * THE PIPELINE. One supplement at a time, and each stage can only make the
 * answer more conservative than the stage before it.
 */
export function recommend(c: Citizen): { plan: Recommendation[]; watching: Reason[]; source: typeof SOURCE } {
  const out: Recommendation[] = [];

  const push = (
    id: string, bucket: Bucket, why: Reason[],
    opts: { dose?: string | null; needsClinician?: boolean; parts?: Array<{ label: string; note: string }> } = {},
  ) => {
    const f = fact(id);
    const flags: Flag[] = [];

    /* ── SAFETY, then INTERACTION, then CLINICAL RISK ── */
    for (const stop of CONDITION_STOPS) {
      if (stop.id === id && has(c.conditions, ...stop.match)) {
        flags.push({ kind: 'condition', text: stop.text });
        bucket = 'not-recommended';
      }
    }
    const inter = INTERACTIONS.find((i) => i.id === id);
    if (inter && has(c.medicines, ...inter.drugs)) {
      flags.push({ kind: 'interaction', text: inter.text, source: f.interactions });
      // An interaction does not delete the supplement — it takes the decision
      // away from the app. Anything that was a suggestion becomes a question
      // for a doctor, and anything already refused stays refused.
      if (bucket !== 'not-recommended') bucket = 'consider';
      opts.needsClinician = true;
    }
    if (c.pregnant && ['ashwagandha', 'vitamin-c', 'curcumin'].includes(id)) {
      flags.push({ kind: 'condition', text: 'Not while pregnant or breastfeeding — take this decision to your doctor.' });
      bucket = 'not-recommended';
    }
    if (has(c.taking, f.name.split(' ')[0].toLowerCase())) {
      flags.push({ kind: 'duplicate', text: `You have already listed ${f.name} in your cabinet — check the two labels add up to less than ${f.upperLimit}.` });
    }
    if (f.grade === 'null-or-harm') {
      const sk = skipFor(f.name);
      bucket = 'not-recommended';
      if (sk) flags.push({ kind: 'harm', text: sk.why, source: sk.source });
    }

    /* THE DOSE IS COPIED, NEVER COMPUTED — and it is withheld entirely when a
       clinician should be the one setting it. */
    const needsClinician = Boolean(opts.needsClinician) || (f.testFirst === true && bucket === 'priority');
    const dose = opts.dose === null || needsClinician ? null : (opts.dose ?? f.typicalDose);

    const parts = opts.parts ?? [];
    const score = Math.min(100, Math.max(0,
      why.reduce((n, r) => n + (r.from === 'lab' ? 40 : r.from === 'diet' || r.from === 'medicine' ? 25 : r.from === 'goal' || r.from === 'fitness' ? 20 : 10), 0)
      + (f.grade === 'strong' ? 20 : f.grade === 'moderate' ? 10 : 0)
      - flags.length * 15));

    out.push({
      id: f.id, name: f.name, bucket, grade: f.grade, gradeFor: f.gradeFor, form: f.form,
      dose, upperLimit: f.upperLimit, needsClinician, testFirst: Boolean(f.testFirst),
      why, flags,
      fit: { score, parts: [{ label: 'Evidence', note: `${f.grade} — ${f.gradeFor}` }, ...parts] },
      source: SOURCE.title,
    });
  };

  /* ── VITAMIN D ─────────────────────────────────────────────────────────
     The one place a lab result changes the ANSWER and not just the wording:
     with a documented deficiency the dose is a repletion protocol, and a
     repletion protocol is a clinical decision. */
  const vitD = lab(c, '25-oh', '25(oh)', 'vitamin d');
  if (vitD && vitD.value < 20) {
    push('vitamin-d3', 'priority', [
      { from: 'lab', text: `Your 25-OH vitamin D came back at ${vitD.value}${vitD.unit ? ' ' + vitD.unit : ''}, below the 20 ng/mL threshold the review uses.`, source: vitD.at ? `blood work, ${vitD.at}` : 'your blood work' },
      { from: 'evidence', text: 'Correcting a documented deficiency is the part of the vitamin D evidence that is settled.', source: 'VITAL, NEJM 2018–2022' },
    ], { needsClinician: true, parts: [{ label: 'Blood work', note: 'Strong reason' }] });
  } else if (!vitD) {
    push('vitamin-d3', 'consider', [
      { from: 'population', text: '67% of Indian adults are below 20 ng/mL — a base rate for the country, not a finding about you. A test is what turns this into a finding.', source: INDIA_CONTEXT[0].source },
    ], { parts: [{ label: 'Blood work', note: 'Not on file' }] });
  }

  /* ── B12 ── vegetarian diet and metformin are the two Indian reasons. */
  const b12 = lab(c, 'b12', 'cobalamin');
  const b12Reasons: Reason[] = [];
  if (b12 && b12.value < 200) b12Reasons.push({ from: 'lab', text: `Your B12 is ${b12.value}${b12.unit ? ' ' + b12.unit : ''}.`, source: 'your blood work' });
  if (c.vegetarian || c.vegan) b12Reasons.push({ from: 'diet', text: 'B12 comes almost entirely from animal foods, and your diet is listed as vegetarian.', source: 'your nutrition profile' });
  if (has(c.medicines, 'metformin')) b12Reasons.push({ from: 'medicine', text: 'Metformin depletes B12 over time.', source: 'your medicines' });
  if (b12Reasons.length) push('vitamin-b12', b12 && b12.value < 200 ? 'priority' : 'consider', b12Reasons);

  /* ── IRON ── the rule that makes this engine worth trusting. */
  const ferritin = lab(c, 'ferritin');
  if (ferritin && ferritin.value < 30) {
    push('iron', 'priority', [
      { from: 'lab', text: `Your ferritin is ${ferritin.value}${ferritin.unit ? ' ' + ferritin.unit : ''}, which is low.`, source: 'your blood work' },
    ], { needsClinician: true });
  } else {
    push('iron', 'not-recommended', [
      { from: 'evidence', text: ferritin
        ? `Your ferritin is ${ferritin.value}${ferritin.unit ? ' ' + ferritin.unit : ''} — there is no gap here to close.`
        : 'There is no ferritin result on file, so nothing here establishes that you need iron. Iron given to somebody who is not deficient is the supplement with the clearest harm profile — don’t add it because you are tired.',
        source: 'DABS-India, Eur J Clin Nutr 2024' },
    ], { dose: null });
  }

  /* ── PROTEIN ── a food answer before a powder answer. */
  if (c.proteinTargetG && c.proteinIntakeG !== undefined && c.proteinIntakeG < c.proteinTargetG) {
    push('protein', 'consider', [
      { from: 'diet', text: `You are eating about ${c.proteinIntakeG} g of protein a day against a target of ${c.proteinTargetG} g. Powder is the cheapest way to close a gap food has not closed.`, source: 'your nutrition hub' },
      { from: 'evidence', text: 'ICMR lowered India’s protein RDA to 0.83 g/kg/day in 2020 and warns against supplements — the Indian protein problem is quality, not raw grams.', source: 'ICMR-NIN 2020' },
    ], { parts: [{ label: 'Diet', note: 'Measured gap' }] });
  }

  /* ── CREATINE ── the one where the goal is the whole reason. */
  if ((c.goal === 'muscle' || c.goal === 'endurance' || c.goal === 'recovery') && (c.trainsPerWeek ?? 0) >= 2) {
    push('creatine', 'consider', [
      { from: 'goal', text: 'Your goal is strength and muscle, and creatine is the most-replicated supplement there is for it.', source: 'your fitness profile' },
      { from: 'fitness', text: `You train ${c.trainsPerWeek} times a week.`, source: 'your activity log' },
    ], { parts: [{ label: 'Fitness goal', note: 'Relevant' }] });
  }

  /* ── OMEGA-3, MAGNESIUM, PSYLLIUM ── population and lifestyle reasons, and
     labelled as exactly that. */
  push('omega-3', 'optional', [
    { from: 'population', text: 'Even India’s highest omega-3 consumers get around 50 mg EPA+DHA a day against a 250–500 mg target.', source: INDIA_CONTEXT[5].source },
  ]);
  if (c.goal === 'sleep' || has(c.conditions, 'cramp', 'migraine')) {
    push('magnesium', 'optional', [
      { from: 'goal', text: 'You have asked the city about sleep, and magnesium is the one with a real, small effect there.', source: 'your fitness profile' },
    ]);
  }

  /* ── AND THE ONES NOBODY SHOULD BUY ── stated, with the trial. */
  for (const id of ['multivitamin', 'collagen']) {
    const f = fact(id);
    const sk = skipFor(f.name);
    push(id, 'not-recommended', [
      { from: 'evidence', text: sk ? sk.why : 'The evidence does not support this.', source: sk?.source },
    ], { dose: null });
  }
  if (c.smoker) {
    const beta = DO_NOT_RECOMMEND.find((s) => s.what.toLowerCase().includes('beta-carotene'));
    const mv = out.find((r) => r.id === 'multivitamin');
    if (beta && mv) mv.flags.push({ kind: 'harm', text: `You smoke, and beta-carotene is in most multivitamins. ${beta.why}`, source: beta.source });
  }

  /* WHAT MIRA IS WATCHING — the honest version of a dashboard: the things a
     result would change, named before the result exists. */
  const watching: Reason[] = [];
  if (!vitD) watching.push({ from: 'lab', text: 'Vitamin D — no result on file', source: 'a test would settle it' });
  if (!b12) watching.push({ from: 'lab', text: 'B12 — no result on file', source: 'a test would settle it' });
  if (!ferritin) watching.push({ from: 'lab', text: 'Ferritin — no result on file, which is why iron stays off this list', source: 'a test would settle it' });
  if (c.proteinTargetG && c.proteinIntakeG === undefined) watching.push({ from: 'diet', text: 'Protein intake — not logged for long enough to say', source: 'your nutrition hub' });

  const rank: Record<Bucket, number> = { priority: 0, consider: 1, optional: 2, 'not-recommended': 3 };
  out.sort((a, b) => rank[a.bucket] - rank[b.bucket] || b.fit.score - a.fit.score);
  return { plan: out, watching, source: SOURCE };
}
