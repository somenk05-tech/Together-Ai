import { SUPPLEMENTS, DO_NOT_RECOMMEND, INDIA_CONTEXT, SOURCE, type SupplementFact } from './knowledge';
import { CUTOFF, type ClinicalNote } from './labs';

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
 *
 * 4. AND SOME RESULTS ARE NOT A SUPPLEMENT QUESTION AT ALL. An HbA1c of 6.7%
 *    is a conversation with a doctor. The engine reads it, says so in
 *    `clinical`, and pairs it with nothing — because the failure mode of a
 *    page like this is not naming a bad bottle, it is reading a serious result
 *    and answering it with fish oil. Every cut-off it compares against lives
 *    in `labs.ts` with the body that published it, and a cut-off is allowed to
 *    change a BUCKET and nothing else. It never scales a dose, and it is never
 *    subtracted from a result to manufacture a "gap".
 *
 * 5. AND IT ANSWERS NOBODY WHO HAS NOT BEEN TESTED. Owner's call, 29 Aug: no
 *    blood work on file, no plan — `gated: true` and an empty list, not a
 *    thinner set of suggestions. A population base rate may no longer open a
 *    card of its own either. Both rules are enforced in this file rather than
 *    on the screen, because a rule enforced in one place is a rule and a rule
 *    enforced in two is a coincidence waiting to end.
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
export function recommend(c: Citizen): {
  plan: Recommendation[];
  /** True when there is no blood work to reason from, and therefore no plan.
   *  The screen renders the gate, not an empty list. */
  gated: boolean;
  watching: Reason[];
  clinical: ClinicalNote[];
  source: typeof SOURCE;
} {
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
    /* PSYLLIUM INTERACTS WITH EVERYTHING AND WITH NOTHING. It is a gel, so it
       takes whatever is in the gut down with it — which is a timing rule, not
       a question for a doctor, and so it deliberately does NOT go through the
       INTERACTIONS table above and does not demote the bucket or withhold the
       dose. Getting this wrong in the safe direction would still be wrong: a
       "see your doctor" on a teaspoon of isabgol teaches people to ignore the
       ones that mean it. */
    if (id === 'psyllium' && (c.medicines ?? []).length > 0) {
      flags.push({
        kind: 'interaction',
        text: `It is a gel, and it will take your medicines down with it. Separate it from all ${(c.medicines ?? []).length} of them by at least two hours, and take it with a full glass of water — obstruction has happened without one. It may also reduce insulin requirements, which needs monitoring rather than avoidance.`,
        source: f.interactions,
      });
    }
    if (has(c.taking, f.name.split(' ')[0].toLowerCase())) {
      flags.push({ kind: 'duplicate', text: `You have already listed ${f.name} in your cabinet — check the two labels add up to less than ${f.upperLimit}.` });
    }
    if (f.grade === 'null-or-harm') {
      const sk = skipFor(f.name);
      bucket = 'not-recommended';
      // ONLY WHEN IT ADDS SOMETHING. The refused cards are pushed with this
      // same skip evidence as their `why`, and this line then repeated the
      // identical paragraph — citation and all — as a "Harm signal" directly
      // beneath it. A card whose whole job is one refusal was saying it twice
      // verbatim, which reads as a rendering bug and cheapens the flags that
      // genuinely add facts (the smoker's beta-carotene line). The flag now
      // fires only when the evidence is not already on the card.
      if (sk && !why.some((w) => w.text === sk.why)) {
        flags.push({ kind: 'harm', text: sk.why, source: sk.source });
      }
    }

    /* A BASE RATE IS NOT A RECOMMENDATION — owner's call, 29 Aug.
       A card whose ONLY reason is a population statistic is a card about
       India, printed under a heading that says "your plan". It used to put
       vitamin D in Worth considering, psyllium in Supporting your goal and
       omega-3 on the page for every citizen alive, and it did so with
       identical text for all of them — which is an advertisement wearing a
       statistic. A base rate keeps its place as CONTEXT on a card a lab has
       already earned (the omega-3 intake line under a raised triglyceride is
       exactly that), and it may name itself in "what we're watching". It may
       no longer open a card of its own.
       Flags are the exception, because a flag is a safety statement rather
       than a suggestion: if this citizen's medicines interact with it, the
       card survives to say so. */
    if (why.length > 0 && why.every((w) => w.from === 'population') && flags.length === 0) return;

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
  if (vitD && vitD.value < CUTOFF.vitaminDLow.value) {
    push('vitamin-d3', 'priority', [
      { from: 'lab', text: `Your 25-OH vitamin D came back at ${vitD.value}${vitD.unit ? ' ' + vitD.unit : ''}, below the ${CUTOFF.vitaminDLow.value} ${CUTOFF.vitaminDLow.unit} mark — ${CUTOFF.vitaminDLow.band}.`, source: vitD.at ? `${CUTOFF.vitaminDLow.authority} · blood work, ${vitD.at}` : CUTOFF.vitaminDLow.authority },
      { from: 'evidence', text: 'Correcting a documented deficiency is the part of the vitamin D evidence that is settled.', source: 'VITAL, NEJM 2018–2022' },
    ], { needsClinician: true, parts: [{ label: 'Blood work', note: 'Strong reason' }] });
  } else if (!vitD) {
    push('vitamin-d3', 'consider', [
      { from: 'population', text: '67% of Indian adults are below 20 ng/mL — a base rate for the country, not a finding about you. A test is what turns this into a finding.', source: INDIA_CONTEXT[0].source },
    ], { parts: [{ label: 'Blood work', note: 'Not on file' }] });
  }

  /* ── HAEMOGLOBIN, READ BEFORE IRON AND BEFORE B12 ──────────────────────
     A low haemoglobin is the single most misread result in this country, and
     the misreading always goes the same way: anaemia, therefore iron. The
     review's whole point is that iron deficiency explains FEWER THAN ONE IN
     THREE cases of Indian anaemia. So this is computed early and used to make
     the iron refusal MORE specific rather than to overturn it, and to put B12
     and folate — the next causes on the list — in front of the citizen
     instead.

     WHERE THE SEX IS UNKNOWN, THE LOWER BAND IS USED. WHO sets 13 g/dL for
     adult men and 12 for non-pregnant women; a profile with no sex on it gets
     12, because 12.5 is anaemia in one of those sentences and not the other,
     and this engine does not get to pick which person is reading. */
  const hb = lab(c, 'haemoglobin', 'hemoglobin');
  const hbBand = c.sex === 'male' ? CUTOFF.haemoglobinLowMale : CUTOFF.haemoglobinLowFemale;
  const hbLow = Boolean(hb && hb.value < hbBand.value);

  /* ── B12 ── vegetarian diet and metformin are the two Indian reasons. */
  const b12 = lab(c, 'b12', 'cobalamin');
  const b12Reasons: Reason[] = [];
  if (b12 && b12.value < CUTOFF.b12Low.value) b12Reasons.push({ from: 'lab', text: `Your B12 is ${b12.value}${b12.unit ? ' ' + b12.unit : ''}, below ${CUTOFF.b12Low.value} ${CUTOFF.b12Low.unit}.`, source: CUTOFF.b12Low.authority });
  if (hbLow && !b12) b12Reasons.push({ from: 'lab', text: `Your haemoglobin is ${hb!.value} g/dL and there is no B12 result to go with it. When iron is not the cause of an Indian anaemia — and two times in three it isn’t — B12 and folate are the next two to rule out, against a 53% pooled deficiency rate.`, source: 'DABS-India, Eur J Clin Nutr 2024; ' + INDIA_CONTEXT[1].source });
  if (c.vegetarian || c.vegan) b12Reasons.push({ from: 'diet', text: 'B12 comes almost entirely from animal foods, and your diet is listed as vegetarian.', source: 'your nutrition profile' });
  if (has(c.medicines, 'metformin')) b12Reasons.push({ from: 'medicine', text: 'Metformin depletes B12 over time.', source: 'your medicines' });
  if (b12Reasons.length) push('vitamin-b12', b12 && b12.value < CUTOFF.b12Low.value ? 'priority' : 'consider', b12Reasons);

  /* ── IRON ── the rule that makes this engine worth trusting. */
  const ferritin = lab(c, 'ferritin');
  if (ferritin && ferritin.value < CUTOFF.ferritinLow.value) {
    push('iron', 'priority', [
      { from: 'lab', text: `Your ferritin is ${ferritin.value}${ferritin.unit ? ' ' + ferritin.unit : ''}, below ${CUTOFF.ferritinLow.value} — ${CUTOFF.ferritinLow.band}.`, source: CUTOFF.ferritinLow.authority },
    ], { needsClinician: true });
  } else {
    const ironWhy: Reason[] = [];
    if (ferritin) {
      ironWhy.push({ from: 'lab', text: `Your ferritin is ${ferritin.value}${ferritin.unit ? ' ' + ferritin.unit : ''} — there is no gap here to close.`, source: 'your blood work' });
    } else if (hbLow) {
      /* The hardest sentence in the engine, and the one it exists for: a low
         haemoglobin with no ferritin is the exact moment somebody buys iron,
         and it is the exact moment they should not. */
      ironWhy.push({ from: 'lab', text: `Your haemoglobin is ${hb!.value} g/dL, below the ${hbBand.value} g/dL mark for ${hbBand.band} — and there is still no ferritin result on file. That is a reason to get one, with CRP, and it is not a reason to start iron. Iron deficiency explains under a third of Indian anaemia; the rest is B12, folate, haemoglobinopathies and inflammation, and iron will cause constipation while missing the diagnosis.`, source: `${hbBand.authority}; DABS-India, Eur J Clin Nutr 2024` });
    } else {
      ironWhy.push({ from: 'evidence', text: 'There is no ferritin result on file, so nothing here establishes that you need iron. Iron given to somebody who is not deficient is the supplement with the clearest harm profile — don’t add it because you are tired.', source: 'DABS-India, Eur J Clin Nutr 2024' });
    }
    push('iron', 'not-recommended', ironWhy, { dose: null });
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

  /* ── LIPIDS ────────────────────────────────────────────────────────────
     Two markers, two different supplements, and the difference between them
     is most of what a page like this is for. A raised LDL has an answer with
     HIGH GRADE certainty behind it that costs ₹320 for six months. A raised
     triglyceride has an answer that works on the number and has never been
     shown to work on the outcome at any dose sold over a counter. Both are
     "yes" — they are not the same yes, and the copy says which is which. */
  const ldl = lab(c, 'ldl chol', 'ldl-c');
  const trig = lab(c, 'triglycerid');

  const psylliumWhy: Reason[] = [];
  if (ldl && ldl.value >= CUTOFF.ldlAboveDesirable.value) {
    psylliumWhy.push({ from: 'lab', text: `Your LDL is ${ldl.value} mg/dL, ${CUTOFF.ldlAboveDesirable.band}.`, source: ldl.at ? `${CUTOFF.ldlAboveDesirable.authority} · blood work, ${ldl.at}` : CUTOFF.ldlAboveDesirable.authority });
    psylliumWhy.push({ from: 'evidence', text: '28 randomised trials, 1,924 people, at a median of about 10.2 g a day: LDL down roughly 13 mg/dL, non-HDL down further, and apolipoprotein B down too — at HIGH GRADE certainty. High-certainty evidence for the particle-count marker is rare enough in supplement science that almost nothing else in this review can claim it.', source: 'Jovanovski et al., AJCN 2018' });
  }
  push('psyllium', psylliumWhy.length ? 'priority' : 'optional',
    psylliumWhy.length ? psylliumWhy : [
      { from: 'population', text: '81% of Indian adults have some dyslipidaemia. This is the best evidence-to-cost ratio in the whole review and it is sold as a kitchen staple — a base rate for the country, not a finding about you.', source: INDIA_CONTEXT[4].source },
    ],
    psylliumWhy.length ? { parts: [{ label: 'Blood work', note: 'Strong reason' }] } : {});

  const omegaWhy: Reason[] = [];
  let omegaBucket: Bucket = 'optional';
  let omegaClinician = false;
  if (trig && trig.value >= CUTOFF.triglyceridesHigh.value) {
    const band = trig.value >= CUTOFF.triglyceridesVeryHigh.value ? CUTOFF.triglyceridesVeryHigh : CUTOFF.triglyceridesHigh;
    omegaWhy.push({ from: 'lab', text: `Your triglycerides are ${trig.value} mg/dL — ${band.band}.`, source: trig.at ? `${band.authority} · blood work, ${trig.at}` : band.authority });
    /* THE MOST IMPORTANT PARAGRAPH THIS ENGINE PRINTS. Triglyceride lowering
       is the one omega-3 effect that reliably happens, and it is exactly the
       place a supplement page turns into a prescription pad. So the number is
       WITHHELD here rather than raised: the review's 250–500 mg range is a
       general intake target and not a treatment for this result, and the only
       dose ever shown to move events was four grams a day of a prescription
       drug — in a trial another trial at the same dose contradicted. */
    omegaWhy.push({ from: 'evidence', text: 'Triglyceride lowering is the reliable omega-3 effect and it is dose-dependent — about 5.9 mg/dL for each extra gram a day. What does not follow is the outcome: REDUCE-IT cut cardiovascular events 25%, but on 4 g/day of PRESCRIPTION icosapent ethyl, and STRENGTH at the same 4 g/day found no benefit and more atrial fibrillation. Over-the-counter fish oil at this result is a decision for the doctor who ordered the test.', source: 'REDUCE-IT, NEJM 2019; STRENGTH; Albert et al., Circulation 2021' });
    omegaBucket = 'consider';
    omegaClinician = true;
  }
  omegaWhy.push({ from: 'population', text: 'Even India’s highest omega-3 consumers get around 50 mg EPA+DHA a day against a 250–500 mg target.', source: INDIA_CONTEXT[5].source });
  push('omega-3', omegaBucket, omegaWhy, omegaClinician ? { needsClinician: true } : {});

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
  if (!ldl && !trig) watching.push({ from: 'lab', text: 'A lipid panel — no LDL or triglyceride on file, and psyllium is the one answer here with high-certainty evidence behind it', source: 'a test would settle it' });
  if (c.proteinTargetG && c.proteinIntakeG === undefined) watching.push({ from: 'diet', text: 'Protein intake — not logged for long enough to say', source: 'your nutrition hub' });

  /* ── THE RESULTS THIS PAGE HANDS BACK ──────────────────────────────────
     Read, named, and deliberately paired with nothing. The engine is at its
     most dangerous exactly here — a marker in a clinical band is the moment a
     supplement screen is most tempted to sell — and the rule is that it says
     what the result is, who set the band, and that the answer is a doctor.
     None of these appends a product, and the spec asserts it. */
  const clinical: ClinicalNote[] = [];
  const a1c = lab(c, 'hba1c', 'a1c');
  if (a1c && a1c.value >= CUTOFF.hba1cDiabetes.value) {
    clinical.push({ marker: 'hba1c', text: `Your HbA1c is ${a1c.value}%, which is ${CUTOFF.hba1cDiabetes.band}. No supplement in this review is offered for that and none is offered for it here — it belongs with the doctor who ordered the test. Your medical hub has already flagged it.`, source: CUTOFF.hba1cDiabetes.authority });
  } else if (a1c && a1c.value >= CUTOFF.hba1cPrediabetes.value) {
    clinical.push({ marker: 'hba1c', text: `Your HbA1c is ${a1c.value}%, which is ${CUTOFF.hba1cPrediabetes.band}. The evidence for changing that is food and movement, not a bottle — and this review has nothing to sell you for it.`, source: CUTOFF.hba1cPrediabetes.authority });
  }
  if (trig && trig.value >= CUTOFF.triglyceridesHigh.value) {
    clinical.push({ marker: 'trig', text: `Your triglycerides are ${trig.value} mg/dL — ${(trig.value >= CUTOFF.triglyceridesVeryHigh.value ? CUTOFF.triglyceridesVeryHigh : CUTOFF.triglyceridesHigh).band}. Omega-3 is on your plan because of it, with the honest version of what it does; the number itself is a clinical matter and this page is not treating it.`, source: CUTOFF.triglyceridesHigh.authority });
  }
  if (ldl && ldl.value >= CUTOFF.ldlAboveDesirable.value) {
    clinical.push({ marker: 'ldl', text: `Your LDL is ${ldl.value} mg/dL, ${CUTOFF.ldlAboveDesirable.band}. Whether that needs treating depends on your whole cardiovascular risk, which is a conversation and not a threshold.`, source: CUTOFF.ldlAboveDesirable.authority });
  }
  if (hbLow) {
    clinical.push({ marker: 'hb', text: `Your haemoglobin is ${hb!.value} g/dL, below the ${hbBand.value} g/dL mark for ${hbBand.band}. The next step is a cause, not a supplement: ferritin with CRP, B12 and folate.`, source: hbBand.authority });
  }

  const rank: Record<Bucket, number> = { priority: 0, consider: 1, optional: 2, 'not-recommended': 3 };
  out.sort((a, b) => rank[a.bucket] - rank[b.bucket] || b.fit.score - a.fit.score);

  /* ── THE BLOOD TEST IS THE KEY, AND IT IS THE ONLY KEY ──────────────────
     Owner's call, 29 Aug. Until a panel this engine can read is on file there
     is NO plan — not a shorter one, not a population-flavoured one, none.

     The argument is the one this file already makes about iron, applied to
     the whole page. A screen headed "your supplement plan" that a brand-new
     account can open and read is not personalised and never was; it is a
     catalogue with the citizen's name on the tab, and the thing it teaches
     is that these answers arrive without a test. The refusals go with it,
     which costs this page its best material — and that is the right price,
     because a refusal is only worth reading once the citizen believes the
     page knows something about them.

     `watching` and `clinical` still travel: the gate's whole content is the
     list of markers a test would settle, and a clinical note is a reading of
     a result, which by definition cannot exist without one. */
  const gated = (c.labs ?? []).length === 0;
  return { plan: gated ? [] : out, gated, watching, clinical, source: SOURCE };
}
