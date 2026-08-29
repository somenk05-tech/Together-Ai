import { nutrient, HARM_CAPABLE } from './nutrients';
import { ALL_FORMULATIONS, type Formulation } from './formulations';
import {
  classify, totalExposure, convert,
  type Classification, type Exposure, type Sex,
} from './exposure';
import { bandDose, regimenFor, biotinInterlock, type Regimen, type Interlock } from './regimen';
import { CUTOFF } from './labs';
import type { Citizen } from './supplements.engine';

/**
 * THE MULTIVITAMIN ENGINE.
 *
 * The question it exists to answer is not "which multivitamin should you buy".
 * It is: given everything this city knows about you, does any non-prescription
 * multivitamin have enough evidence, an appropriate dose, acceptable safety
 * and enough personal fit to be worth considering — and why.
 *
 * The correct answer is often none, and that is the feature rather than the
 * failure. Pooled across 78 randomised trials and 715,526 people, multivitamins
 * "do not reliably reduce chronic disease risk". PHS-II found no reduction in
 * cardiovascular events or cognitive decline over 11.2 years. COSMOS found none
 * in cancer, cardiovascular disease or mortality. The American Heart
 * Association and the American Institute for Cancer Research both recommend
 * against them for that purpose. This engine starts from that and works
 * upwards, rather than starting from a shelf and working backwards.
 *
 * ── FIVE RULES, ALL OF WHICH COST SOMETHING ───────────────────────────────
 *
 * 1. THE GATE IS ABSOLUTE. No blood work on file, no assessment. Not a
 *    shorter one, not a population-flavoured one, none — the same rule the
 *    supplement plan has carried since 29 August, applied here for the same
 *    reason. A vegetarian with no panel gets "a test would settle it", not a
 *    B12 recommendation, because a diet is a reason to test and a result is a
 *    reason to act, and collapsing those two is how a supplement page becomes
 *    an advertisement with a chart on it.
 *
 * 2. THE THREE SCORES ARE NEVER COMBINED. Evidence, personal fit and safety
 *    answer different questions and can point in opposite directions — a
 *    well-evidenced product can be badly suited to one person and dangerous to
 *    another. A single number would hide exactly the disagreement that matters,
 *    and a spec asserts no combined score is ever computed.
 *
 * 3. ABSENCE OF DATA IS NEVER A REASON TO RECOMMEND. Vitamin D untested is not
 *    vitamin D low. Ferritin untested is not iron indicated. The engine's
 *    answer there is that there is not enough information, followed by the
 *    single most useful thing that would change that.
 *
 * 4. THE WHOLE FORMULATION IS THE UNIT, NOT THE INGREDIENT LIST. A product
 *    with twenty nutrients is not better than one with eight; it is a product
 *    with twelve more chances to stack, to exceed, and to pad a front-of-pack
 *    count with amounts too small to do anything. Nutrient count contributes
 *    nothing to the evidence score here, and tokens subtract from it.
 *
 * 5. PRICE NEVER COMPENSATES. It appears in the comparison as one line among
 *    eight and it cannot lift evidence, dose appropriateness or safety.
 *    Cheapness is not a reason to swallow something with no case behind it.
 */

/* ── THE FIVE STATES ───────────────────────────────────────────────────────*/

export type State =
  | 'appropriate'         // 🟢 evidence, formulation, fit and safety all hold
  | 'may-be-considered'   // 🟡 plausible, but the evidence or the fit is incomplete
  | 'test-first'          // 🔵 a result should exist before this is answered
  | 'no-clear-benefit'    // ⚪ nothing here meets anything known about this person
  | 'clinician-review';   // 🔴 interaction, contraindication, excess or unknown risk

export const STATE_MEANING: Record<State, string> = {
  appropriate: 'The evidence holds, the formulation is appropriate, it fits what your results show, and nothing about your medicines or conditions argues against it.',
  'may-be-considered': 'There is a reasonable case, and it is incomplete — either the evidence is thinner than it looks or this city does not know enough about you to be sure it applies.',
  'test-first': 'A laboratory result should exist before this question is answered. Not a soft suggestion: the answer genuinely depends on a number nobody has.',
  'no-clear-benefit': 'Nothing in this product meets anything this city knows about you. That is a finding, not a gap.',
  'clinician-review': 'Something here needs a doctor rather than a shelf — an interaction, a contraindication, a dose above a ceiling, or a risk this page cannot assess.',
};

/* ── THREE SCORES, KEPT APART ──────────────────────────────────────────────*/

export interface ScorePart { label: string; note: string; delta: number }

export interface Score {
  /** Out of ten, and shown with its parts. A number nobody can take apart is
   *  a number nobody should trust. */
  value: number;
  parts: ScorePart[];
}

const score = (base: number, parts: ScorePart[]): Score => ({
  value: Math.max(0, Math.min(10, Math.round((base + parts.reduce((s, p) => s + p.delta, 0)) * 10) / 10)),
  parts,
});

export interface Flag {
  kind: 'interaction' | 'condition' | 'upper-limit' | 'harm' | 'duplicate' | 'unknown-composition' | 'regulatory';
  text: string;
  source?: string;
  /** True when this alone forces clinician review. */
  hard?: boolean;
}

export interface Assessment {
  formulationId: string;
  brand: string;
  productName: string;
  state: State;
  evidence: Score;
  personalFit: Score;
  safety: Score;
  regulatory: Classification;
  exposure: Exposure;
  /** Why this is on the page at all. */
  why: string[];
  /** Why it is not recommended, or not recommended more strongly. The most
   *  valuable text this engine produces, and the reason refusals are never
   *  purchasable. */
  whyNot: string[];
  /** What this city does not know. */
  missing: string[];
  /** The single most useful thing that would resolve the uncertainty. */
  wouldSettle: string[];
  flags: Flag[];
  /** Per-nutrient dose bands for everything this product would deliver. */
  doses: Array<{ nutrientId: string; name: string; amount: number; unit: string; band: ReturnType<typeof bandDose> }>;
  /** The monitoring plan for whatever in it is actually worth monitoring. */
  monitoring: Regimen[];
}

const has = (list: string[] | undefined, ...needles: string[]): boolean =>
  (list ?? []).some((x) => needles.some((n) => x.toLowerCase().includes(n)));

const lab = (c: Citizen, ...names: string[]) =>
  (c.labs ?? []).find((l) => names.some((n) => l.name.toLowerCase().includes(n)));

const sexOf = (c: Citizen): Sex | undefined =>
  c.sex === 'male' || c.sex === 'female' ? c.sex : undefined;

/* ── THE EVIDENCE SCORE ────────────────────────────────────────────────────
   About this FORMULATION as a whole. It is not the sum of its ingredients'
   evidence and it is not a count of them. The category starts low because the
   category's own trials came back null, and a product earns its way up by
   being honest about what is in it and dosing it like it means it. */

const MULTIVITAMIN_BASE = 3;

const evidenceScore = (f: Formulation, exp: Exposure, sex?: Sex): Score => {
  const parts: ScorePart[] = [{
    label: 'The category',
    note: 'Pooled across 78 randomised trials and 715,526 participants, multivitamins do not reliably reduce chronic disease risk. PHS-II found no reduction in cardiovascular events or cognitive decline over 11.2 years; COSMOS found none in cancer, cardiovascular disease or mortality. Nutritional insurance, not medicine — and every product starts here.',
    delta: 0,
  }];

  if (f.compositionSource === 'UNKNOWN') {
    parts.push({ label: 'Composition', note: 'Nobody publishes what is in it. There is nothing here to have evidence about.', delta: -2 });
    return score(MULTIVITAMIN_BASE, parts);
  }

  /* Dose honesty: how much of the label is doing something. A front-of-pack
     nutrient count padded with 8%-of-requirement inclusions is a marketing
     document, and this is where that shows up. */
  const banded = f.nutrients.filter((r) => !r.suspect).map((r) => {
    const n = nutrient(r.nutrient);
    const c = convert(n, r.amount * f.servingsPerDay, r.unit, r.form);
    return c ? bandDose(n, c.amount, sex) : null;
  }).filter(Boolean) as ReturnType<typeof bandDose>[];
  const gradeable = banded.filter((b) => b.band !== 'unknown');
  const tokens = gradeable.filter((b) => b.band === 'token').length;
  const tokenShare = gradeable.length ? tokens / gradeable.length : 0;
  if (gradeable.length) {
    parts.push({
      label: 'Dose honesty',
      note: tokenShare > 0.35
        ? `${tokens} of ${gradeable.length} gradeable nutrients are under a third of the Indian requirement — present so they can be counted on the front of the pack rather than to close a gap.`
        : tokenShare > 0.15
          ? `${tokens} of ${gradeable.length} gradeable nutrients are token amounts. The rest are dosed like they mean it.`
          : 'Almost everything declared is at a nutritional amount rather than a token one.',
      delta: tokenShare > 0.35 ? -1.5 : tokenShare > 0.15 ? -0.5 : 1,
    });
  }

  parts.push(f.declaresPctRda
    ? { label: 'Transparency', note: `Publishes a per-nutrient percentage against ${f.declaresPctRda.against}. One brand in thirty-two does this.`, delta: 1.5 }
    : { label: 'Transparency', note: 'Publishes no per-nutrient percentage of any requirement, so a buyer cannot tell what any of it amounts to without doing the arithmetic themselves.', delta: -0.5 });

  parts.push(f.thirdParty
    ? { label: 'Verification', note: f.thirdParty, delta: 1 }
    : { label: 'Verification', note: 'No third-party testing, certificate of analysis or independent verification published. Evidence that an ingredient works and evidence that this tablet contains it are two different questions, and only the first has an answer here.', delta: 0 });

  if (f.compositionSource === 'partial') {
    parts.push({ label: 'Composition', note: 'Some declared ingredients carry no quantity at all, so nothing computed from this product is a total — it is a floor.', delta: -1 });
  }
  if (f.dataFlags.some((d) => d.startsWith('CONTAINS BETA-CAROTENE'))) {
    parts.push({ label: 'Formulation', note: 'Contains beta-carotene, which has no evidence of benefit in supplement form and two randomised trials stopped early for harm in smokers.', delta: -0.5 });
  }
  return score(MULTIVITAMIN_BASE, parts);
};

/* ── THE PERSONAL FIT SCORE ────────────────────────────────────────────────
   How strongly the evidence applies to THIS person. Reachable only behind the
   gate, because before a panel exists there is nothing for a product to fit. */

const fitScore = (f: Formulation, c: Citizen, exp: Exposure): Score => {
  const parts: ScorePart[] = [];
  if (f.compositionSource === 'UNKNOWN') {
    return score(0, [{ label: 'Composition', note: 'A product whose contents are unpublished cannot fit anybody in particular. It could contain exactly what you need or none of it, and nobody selling it will say.', delta: 0 }]);
  }

  const contains = (id: string) => exp.nutrients.find((n) => n.nutrientId === id);

  /* A lab that shows a gap this product could close is the strongest kind of
     fit there is — and the ONLY kind that can push fit high. */
  const vitD = lab(c, '25-oh', '25(oh)', 'vitamin d');
  const b12 = lab(c, 'b12', 'cobalamin');
  const ferritin = lab(c, 'ferritin');

  if (vitD && vitD.value < CUTOFF.vitaminDLow.value) {
    const d = contains('vitamin-d');
    parts.push(d
      ? { label: 'Vitamin D', note: `Your 25-OH vitamin D is ${vitD.value}${vitD.unit ? ' ' + vitD.unit : ''}, below the ${CUTOFF.vitaminDLow.value} mark — and this carries ${d.total} IU. Worth saying plainly: correcting a documented deficiency is a repletion protocol and a clinical decision, and a multivitamin is not that. This is maintenance, alongside whatever your doctor sets.`, delta: 2 }
      : { label: 'Vitamin D', note: `Your vitamin D is below the ${CUTOFF.vitaminDLow.value} mark and this product contains none.`, delta: -1 });
  }
  if (b12 && b12.value < CUTOFF.b12Low.value) {
    const v = contains('vitamin-b12');
    parts.push(v
      ? { label: 'B12', note: `Your B12 is ${b12.value} and this carries ${v.total} mcg. Absorption is brutally dose-dependent — about half of a 1–2 mcg dose, only 1.3% of a 1,000 mcg one — so a multivitamin's 1 to 2 mcg is a maintenance amount and not a correction.`, delta: v.total >= 100 ? 2 : 1 }
      : { label: 'B12', note: 'Your B12 is low and this product contains none.', delta: -1.5 });
  }
  if (has(c.medicines, 'metformin', 'omeprazole', 'pantoprazole', 'esomeprazole', 'rabeprazole', 'ranitidine', 'famotidine')) {
    const v = contains('vitamin-b12');
    parts.push(v
      ? { label: 'Medicines', note: `You take a medicine that depletes B12 over time — metformin and the acid suppressants both do it — and this carries ${v.total} mcg. That is a reason to TEST rather than a reason to stop the medicine, and a multivitamin's maintenance dose is not a correction.`, delta: 1 }
      : { label: 'Medicines', note: 'You take a medicine that depletes B12 over time, and this product contains none.', delta: -1 });
  }
  if (c.vegetarian || c.vegan) {
    const v = contains('vitamin-b12');
    parts.push(v
      ? { label: 'Diet', note: `Your diet is listed as ${c.vegan ? 'vegan' : 'vegetarian'}, and B12 exists naturally only in animal foods — pooled Indian deficiency runs at 53%. This carries ${v.total} mcg.`, delta: 1 }
      : { label: 'Diet', note: `Your diet is listed as ${c.vegan ? 'vegan' : 'vegetarian'} and this product carries no B12 at all, which is the one nutrient a vegetarian diet cannot supply.`, delta: -1.5 });
  }
  if (f.vegetarian === false && (c.vegetarian || c.vegan)) {
    parts.push({ label: 'Diet', note: `This product is non-vegetarian — ${f.vegNote} That is not a scoring nuance; it is a reason it is the wrong product for you.`, delta: -4 });
  }
  if (f.vegetarian === null && (c.vegetarian || c.vegan)) {
    parts.push({ label: 'Diet', note: 'Nothing on the listing says whether this is vegetarian, and you have asked for vegetarian. An undeclared capsule shell is a real gap, not a formality.', delta: -2 });
  }

  /* Iron in somebody who has been shown not to need it. The most common way a
     general-population multivitamin is wrong for a specific person. */
  const iron = contains('iron');
  if (iron && iron.total > 0) {
    if (ferritin && ferritin.value >= CUTOFF.ferritinLow.value) {
      parts.push({ label: 'Iron', note: `This carries ${iron.total} mg of iron and your ferritin is ${ferritin.value}, which is not low. There is no gap here to close, and iron given to somebody who does not need it is the supplement with the clearest harm profile in the whole category.`, delta: -2 });
    } else if (ferritin && ferritin.value < CUTOFF.ferritinLow.value) {
      parts.push({ label: 'Iron', note: `Your ferritin is ${ferritin.value}, below ${CUTOFF.ferritinLow.value}. This carries ${iron.total} mg — but correcting a documented iron deficiency is a clinical decision with a monitoring schedule attached, and a general multivitamin is not the way it is done.`, delta: 0.5 });
    } else {
      parts.push({ label: 'Iron', note: `This carries ${iron.total} mg of iron and there is no ferritin result on file. Iron deficiency explains under a third of Indian anaemia, so an untested body is not a reason to take it.`, delta: -1 });
    }
  }

  if (c.age !== undefined && c.age >= 50 && f.demographic === 'over-50') {
    parts.push({ label: 'Age', note: 'Formulated for the age band you are in.', delta: 0.5 });
  }
  if (f.demographic === 'adult-men' && c.sex === 'female') {
    parts.push({ label: 'Demographic', note: 'Sold as a men\'s formula. The difference between a men\'s and a women\'s multivitamin is almost entirely iron, and that difference is the whole reason two exist.', delta: -1.5 });
  }
  if (f.demographic === 'adult-women' && c.sex === 'male') {
    parts.push({ label: 'Demographic', note: 'Sold as a women\'s formula, which usually means more iron than a man has any use for.', delta: -1 });
  }

  if (!parts.length) {
    parts.push({ label: 'Fit', note: 'Nothing in your results, diet or profile points at anything this product contains. That is not a gap in the assessment — it is the assessment.', delta: 0 });
  }
  return score(3, parts);
};

/* ── THE SAFETY SCORE, AND THE FLAGS ───────────────────────────────────────
   Starts at ten and is taken away from. Being sold without a prescription is
   not evidence of safety, and this is the file where that sentence has to
   mean something mechanical rather than rhetorical. */

/** Drug and condition interactions that belong to the multivitamin's own
 *  nutrients rather than to a standalone supplement. Matched as keywords
 *  because a citizen's medicine list is their own free text. */
const NUTRIENT_INTERACTIONS: Array<{ nutrient: string; drugs: string[]; text: string; hard?: boolean }> = [
  { nutrient: 'vitamin-k', drugs: ['warfarin', 'acitrom', 'acenocoumarol'], hard: true,
    text: 'Vitamin K antagonises warfarin directly, and even 10 to 20 micrograms of MK-7 can destabilise anticoagulation. This is a hard interaction, not a caution — and the instruction that matters is consistency of intake, which is a conversation with whoever manages your INR.' },
  { nutrient: 'calcium', drugs: ['levothyroxine', 'thyroxine', 'alendronate', 'bisphosphonate', 'doxycycline', 'ciprofloxacin', 'levofloxacin'],
    text: 'Calcium blocks the absorption of thyroid hormone, bisphosphonates, tetracyclines and quinolones. A timing problem rather than a reason not to take it — separate them by four hours.' },
  { nutrient: 'iron', drugs: ['levothyroxine', 'thyroxine', 'omeprazole', 'pantoprazole', 'esomeprazole'],
    text: 'Iron and levothyroxine must be four hours apart, and acid suppression reduces iron absorption.' },
  { nutrient: 'magnesium', drugs: ['alendronate', 'bisphosphonate', 'doxycycline', 'tetracycline', 'ciprofloxacin', 'levofloxacin', 'quinolone'],
    text: 'Magnesium chelates bisphosphonates, tetracyclines and quinolones — space them by two to six hours.' },
  { nutrient: 'vitamin-d', drugs: ['thiazide', 'hydrochlorothiazide', 'orlistat', 'prednis', 'corticosteroid'],
    text: 'Thiazide diuretics with vitamin D raise the risk of hypercalcaemia; orlistat cuts absorption and corticosteroids increase breakdown.' },
  { nutrient: 'vitamin-b6', drugs: ['levodopa'],
    text: 'Pyridoxine reduces the effect of levodopa taken without a decarboxylase inhibitor.' },
];

const CONDITION_STOPS: Array<{ nutrient: string; match: string[]; text: string; hard?: boolean }> = [
  { nutrient: 'iron', match: ['haemochromatosis', 'hemochromatosis', 'thalass'], hard: true,
    text: 'Iron is contraindicated in iron-overload disease, and a thalassaemia trait is one of the reasons an Indian anaemia is often not iron deficiency at all.' },
  { nutrient: 'potassium', match: ['kidney', 'renal', 'ckd'], hard: true,
    text: 'Potassium in impaired kidney function is a hyperkalaemia risk, and hyperkalaemia has no warning symptom.' },
  { nutrient: 'magnesium', match: ['kidney', 'renal', 'ckd'], hard: true,
    text: 'Reduced kidney function changes how magnesium is cleared, and hypermagnesaemia is a real and dangerous outcome. This needs a doctor, not a shelf.' },
  { nutrient: 'calcium', match: ['kidney stone', 'hypercalc', 'hyperparathyroid', 'sarcoid'], hard: true,
    text: 'The supplemental calcium ceiling is set on kidney-stone risk, and hypercalcaemia in hyperparathyroidism or sarcoidosis is a clinical matter.' },
  { nutrient: 'vitamin-d', match: ['sarcoid', 'hyperparathyroid', 'kidney stone', 'hypercalc'], hard: true,
    text: 'Granulomatous disease, primary hyperparathyroidism and a stone history all make vitamin D a supervised decision rather than a self-managed one.' },
  { nutrient: 'iodine', match: ['thyroid', 'hashimoto', 'graves', 'goitre', 'goiter'], hard: true,
    text: 'Iodine precipitates both hypothyroidism and hyperthyroidism in existing thyroid disease, by opposite mechanisms. Any iodine here belongs with whoever manages your thyroid.' },
  { nutrient: 'vitamin-a', match: ['liver', 'hepat'], text: 'Preformed vitamin A is hepatotoxic in excess and existing liver disease narrows the margin.' },
];

const safetyScore = (f: Formulation, c: Citizen, exp: Exposure, cls: Classification): { score: Score; flags: Flag[] } => {
  const parts: ScorePart[] = [];
  const flags: Flag[] = [];

  if (f.compositionSource === 'UNKNOWN') {
    flags.push({
      kind: 'unknown-composition', hard: true,
      text: `Nothing quantified is published about what is in this product. ${f.unknownBecause ?? ''} Nothing can be cleared that nobody will describe, and an absent hazard is not the same as a checked one.`.trim(),
    });
    return {
      score: score(0, [{ label: 'Composition', note: 'Unpublished. Safety cannot be assessed at all.', delta: 0 }]),
      flags,
    };
  }

  /* Ceilings. A supplemental-scoped exceedance is a real one; a crowded
     total-intake ceiling is a warning about the room left for food. */
  for (const e of exp.nutrients) {
    if (e.ceiling.verdict === 'over-supplemental') {
      const harm = e.ceiling.harmCapable;
      flags.push({ kind: 'upper-limit', hard: harm, text: `${e.name}: ${e.ceiling.text}`, source: e.ceiling.source });
      parts.push({ label: `${e.name} ceiling`, note: e.ceiling.text, delta: harm ? -3 : -1.5 });
    } else if (e.ceiling.verdict === 'crowds-total' && e.ceiling.harmCapable) {
      flags.push({ kind: 'upper-limit', text: `${e.name}: ${e.ceiling.text}`, source: e.ceiling.source });
      parts.push({ label: `${e.name} ceiling`, note: e.ceiling.text, delta: -1 });
    }
  }

  /* Beta-carotene and smoking. The one place in this file where a single fact
     about the citizen ends the conversation. */
  const carotene = f.nutrients.some((r) => r.nutrient === 'beta-carotene')
    || f.others.some((o) => o.name.toLowerCase().includes('carotene'))
    || f.nutrients.some((r) => r.nutrient === 'vitamin-a' && (r.form ?? '').toLowerCase().includes('carotene'));
  if (carotene) {
    if (c.smoker) {
      flags.push({
        kind: 'harm', hard: true,
        text: 'You smoke, and this product contains beta-carotene. ATBC, in more than 29,000 male smokers, and CARET were both stopped early for a statistically significant excess of lung cancer — CARET at 28% more lung cancer and 46% more death from it. This is not a caution to weigh against a benefit, because there is no benefit on the other side of it.',
        source: 'ATBC and CARET, reviewed in JNCI',
      });
      parts.push({ label: 'Beta-carotene', note: 'Contraindicated because you smoke.', delta: -8 });
    } else {
      parts.push({ label: 'Beta-carotene', note: 'Contains beta-carotene. Not a hazard for you, and it would be one if you smoked — worth knowing before anybody in your house borrows it.', delta: -0.5 });
    }
  }

  /* Pregnancy and preformed retinol. */
  const retinol = exp.nutrients.find((n) => n.nutrientId === 'vitamin-a');
  if (c.pregnant && retinol) {
    flags.push({
      kind: 'condition', hard: true,
      text: `This carries ${retinol.total} ${retinol.unit} of vitamin A. Preformed retinol is teratogenic above 3,000 mcg a day, and a general multivitamin is not a prenatal one — this is a decision for whoever is looking after the pregnancy, not for a shelf.`,
      source: 'NIH ODS vitamin A fact sheet (FNB 2001 basis)',
    });
    parts.push({ label: 'Pregnancy', note: 'Contains preformed vitamin A.', delta: -6 });
  }

  /* Medicines and conditions. */
  for (const i of NUTRIENT_INTERACTIONS) {
    if (!exp.nutrients.some((n) => n.nutrientId === i.nutrient)) continue;
    if (!has(c.medicines, ...i.drugs)) continue;
    flags.push({ kind: 'interaction', hard: i.hard, text: i.text });
    parts.push({ label: `${nutrient(i.nutrient).name} interaction`, note: i.text, delta: i.hard ? -5 : -1 });
  }
  for (const s of CONDITION_STOPS) {
    if (!exp.nutrients.some((n) => n.nutrientId === s.nutrient)) continue;
    if (!has(c.conditions, ...s.match)) continue;
    flags.push({ kind: 'condition', hard: s.hard, text: s.text });
    parts.push({ label: `${nutrient(s.nutrient).name} and your conditions`, note: s.text, delta: s.hard ? -6 : -2 });
  }

  /* Stacking with what they already take. */
  if ((c.taking ?? []).length) {
    for (const e of exp.nutrients) {
      if (!HARM_CAPABLE.includes(e.nutrientId)) continue;
      const n = nutrient(e.nutrientId);
      if (!has(c.taking, ...n.aliases)) continue;
      flags.push({
        kind: 'duplicate',
        text: `You have already listed ${n.name} in your cabinet, and this carries ${e.total} ${e.unit} more. Two labels, one bloodstream — ${n.ul ? `the ceiling is ${n.ul.value} ${n.ul.unit} and ${n.ul.scopeNote.toLowerCase()}` : 'and no upper limit has been published, which is not the same as there being no limit'}.`,
      });
      parts.push({ label: `${n.name} stacking`, note: 'Already in your cabinet.', delta: -1.5 });
    }
  }

  /* The regulatory finding — a flag, and deliberately not a safety deduction,
     because being above a food ceiling is a statement about a statute and not
     about a body. */
  if (cls.mismatch) {
    flags.push({ kind: 'regulatory', text: cls.text, source: cls.basis });
  }

  if (!parts.length) parts.push({ label: 'Safety', note: 'Nothing in your medicines, conditions or existing supplements argues against this, and nothing in it is above a ceiling.', delta: 0 });
  return { score: score(10, parts), flags };
};

/* ── THE STATE MACHINE ─────────────────────────────────────────────────────
   Read in order, and each rule can only make the answer more conservative
   than the one above it. */

const stateFor = (
  f: Formulation, c: Citizen, ev: Score, fit: Score, saf: Score, flags: Flag[],
): State => {
  /* ORDER MATTERS HERE, and this line is above the hard flags on purpose.
     A product nobody publishes a composition for raises an unknown-composition
     flag, and that flag is hard — but "see a doctor about the multivitamin
     nobody will describe" is not advice anybody can act on. The honest state is
     that no benefit can be established, and the reason travels on the card. */
  if (f.compositionSource === 'UNKNOWN') return 'no-clear-benefit';
  if (flags.some((x) => x.hard)) return 'clinician-review';
  if (saf.value <= 5) return 'clinician-review';
  /* A gap this product could speak to, with no result to say whether it is
     there. Note this is reachable only behind the gate — some panel exists,
     just not the one that would answer this. */
  const untested = !lab(c, '25-oh', '25(oh)', 'vitamin d') || !lab(c, 'b12', 'cobalamin');
  if (fit.value >= 6 && saf.value >= 8) return 'appropriate';
  if (fit.value >= 4.5) return 'may-be-considered';
  if (untested) return 'test-first';
  return 'no-clear-benefit';
};

/* ── WHY, AND WHY NOT ──────────────────────────────────────────────────────
   The brief this engine was built to says the refusals are mandatory, and it
   is right. A page that can only ever say yes is an advertisement with a chart
   on it, and the asymmetry that keeps this honest is structural: a refusal
   here is never purchasable, so a refusal costs this page revenue by
   construction. */

const explain = (
  f: Formulation, c: Citizen, state: State, ev: Score, fit: Score, saf: Score,
  flags: Flag[], exp: Exposure, cls: Classification,
): Pick<Assessment, 'why' | 'whyNot' | 'missing' | 'wouldSettle'> => {
  const why: string[] = [];
  const whyNot: string[] = [];
  const missing: string[] = [];
  const wouldSettle: string[] = [];

  for (const p of fit.parts) if (p.delta > 0) why.push(p.note);
  for (const p of fit.parts) if (p.delta < 0) whyNot.push(p.note);
  for (const p of ev.parts) if (p.delta < 0) whyNot.push(p.note);
  for (const fl of flags) whyNot.push(fl.text);

  if (f.compositionSource === 'UNKNOWN') {
    whyNot.unshift('This city will not recommend a product it cannot describe. Not because the product is bad — because nobody selling it will say what is in it, and a recommendation without a composition is a guess wearing a percentage sign.');
  }
  if (cls.implied === 'above-the-food-ceiling') {
    whyNot.push(`${cls.text} ${cls.mismatch ? 'Whatever else is true of it, you are not buying what the page you found it on says you are buying.' : ''}`.trim());
  }

  /* WHAT IS MISSING, AND THE ONE THING THAT WOULD SETTLE IT. Never a list of
     every test that exists — the most useful next fact, and why it is that
     one. A shopping list of tests is its own kind of selling. */
  if (!lab(c, '25-oh', '25(oh)', 'vitamin d')) {
    missing.push('No 25-OH vitamin D result on file.');
    wouldSettle.push('25(OH)D. It is the one marker here that clears every bar for a retest — it reflects stores, it moves on a known timescale of about three months, and the result would genuinely change what this page says.');
  }
  if (!lab(c, 'b12', 'cobalamin') && (c.vegetarian || c.vegan || has(c.medicines, 'metformin'))) {
    missing.push('No B12 result on file, with a diet or a medicine that depletes it.');
    wouldSettle.push('Serum B12 — and it is a blunt test, so if it comes back equivocal the follow-up is methylmalonic acid rather than a repeat of the same assay.');
  }
  if (!lab(c, 'ferritin') && exp.nutrients.some((n) => n.nutrientId === 'iron')) {
    missing.push('No ferritin result on file, and this product contains iron.');
    wouldSettle.push('Ferritin, with CRP alongside it — ferritin is an acute-phase reactant and reads falsely normal in an inflamed body, which is exactly the body most likely to be tested.');
  }
  if (c.sex === undefined) missing.push('Sex not on file, so requirements are compared against the higher of the two Indian figures — an overstatement of adequacy is the error that stops somebody looking further.');
  if (f.compositionSource === 'partial') missing.push(f.unknownBecause ?? 'Some ingredients carry no quantity, so every total here is a floor.');
  for (const x of exp.excluded) missing.push(`${x.printed} of ${x.nutrientId} could not be counted: ${x.because}`);

  if (!why.length) {
    why.push('Nothing about your results, your diet or your profile points at this product. It is here so you can see that, and see why.');
  }
  return { why, whyNot, missing, wouldSettle };
};

/* ── ASSESS ONE PRODUCT ────────────────────────────────────────────────────*/

export const assessOne = (f: Formulation, c: Citizen): Assessment => {
  const sex = sexOf(c);
  const exp = totalExposure([f], sex);
  const cls = classify(f, sex);
  const ev = evidenceScore(f, exp, sex);
  const fit = fitScore(f, c, exp);
  const { score: saf, flags } = safetyScore(f, c, exp, cls);
  const state = stateFor(f, c, ev, fit, saf, flags);

  const doses = exp.nutrients.map((e) => ({
    nutrientId: e.nutrientId, name: e.name, amount: e.total, unit: e.unit,
    band: bandDose(nutrient(e.nutrientId), e.total, sex),
  }));

  /* Only what is worth monitoring. Offering a plan for every nutrient in a
     twenty-three-nutrient tablet would be twenty untestable numbers dressed as
     a schedule. */
  const monitoring = exp.nutrients
    .map((e) => regimenFor(e.nutrientId))
    .filter((r) => r.monitor === 'retest' || r.monitor === 'medical' || r.initialWeeks !== null);

  return {
    formulationId: f.id, brand: f.brand, productName: f.productName,
    state, evidence: ev, personalFit: fit, safety: saf,
    regulatory: cls, exposure: exp,
    ...explain(f, c, state, ev, fit, saf, flags, exp, cls),
    flags, doses, monitoring,
  };
};

/* ── THE GATE, AND THE ANSWER ──────────────────────────────────────────────*/

export interface MultivitaminAnswer {
  /** True when there is no blood work, and therefore no assessment. */
  gated: boolean;
  /** What the gate says, in the two different silences a citizen is owed. */
  gateText?: string;
  assessments: Assessment[];
  /** The honest headline, computed rather than written: often "none". */
  verdict: string;
  /** What a test would settle. Travels through the gate, because it IS the
   *  gate's content. */
  watching: Array<{ marker: string; why: string }>;
  /** Biotin, checked before any test in `watching` is worth booking. */
  interlock: Interlock;
}

/**
 * THE WHOLE ANSWER.
 *
 * Behind the gate this returns nothing but the list of markers a test would
 * settle — the same two silences the supplement plan distinguishes, because a
 * citizen with no panel at all and a citizen whose panel does not carry the
 * markers this reads are owed different sentences.
 */
export const assessMultivitamins = (c: Citizen, ids?: string[]): MultivitaminAnswer => {
  const pool = ids ? ALL_FORMULATIONS.filter((f) => ids.includes(f.id)) : ALL_FORMULATIONS;
  const taking = ALL_FORMULATIONS.filter((f) => has(c.taking, f.brand.toLowerCase(), f.productName.toLowerCase()));
  const interlock = biotinInterlock(taking);

  const watching: MultivitaminAnswer['watching'] = [];
  if (!lab(c, '25-oh', '25(oh)', 'vitamin d')) watching.push({ marker: '25(OH)D', why: 'The one marker in this whole hub that clears every bar for a retest.' });
  if (!lab(c, 'b12', 'cobalamin')) watching.push({ marker: 'Vitamin B12', why: 'Pooled Indian deficiency runs at 53%, and it is the one nutrient a vegetarian diet cannot supply at all.' });
  if (!lab(c, 'ferritin')) watching.push({ marker: 'Ferritin, with CRP', why: 'Which is why iron stays off every list until it exists. Iron deficiency explains under a third of Indian anaemia.' });

  if ((c.labs ?? []).length === 0) {
    return {
      gated: true,
      gateText: 'There is nothing here yet, on purpose. A multivitamin assessment is a comparison between what a tablet contains and what your body is short of, and this city has no measurement of the second half. It could show you a shelf and call it a plan — that is what the category does — and it would be a catalogue with your name on the tab. The list below is what a test would settle, and every one of these products stays unassessed until one exists.',
      assessments: [], watching, interlock,
      verdict: 'No assessment, because no blood work. That is the answer, not a placeholder for one.',
    };
  }

  const assessments = pool.map((f) => assessOne(f, c));
  const rank: Record<State, number> = {
    appropriate: 0, 'may-be-considered': 1, 'test-first': 2, 'no-clear-benefit': 3, 'clinician-review': 4,
  };
  assessments.sort((a, b) => rank[a.state] - rank[b.state] || b.personalFit.value - a.personalFit.value);

  const green = assessments.filter((a) => a.state === 'appropriate');
  const amber = assessments.filter((a) => a.state === 'may-be-considered');
  const verdict = green.length
    ? `${green.length} of ${assessments.length} products clear evidence, dose, safety and personal fit together. Every one of them is nutritional insurance rather than treatment — the category's own trials came back null on disease prevention, and nothing below changes that.`
    : amber.length
      ? `None of the ${assessments.length} products assessed clears every bar. ${amber.length} could be considered, and the reason none is stronger than that is set out on each card.`
      : `None. On what this city knows about you, no multivitamin here has enough evidence, appropriate dosing, acceptable safety and adequate personal fit to be recommended. That is a finding — the category exists to sell a general answer to a specific question, and specific is what your blood work makes possible.`;

  return { gated: false, assessments, watching, interlock, verdict };
};

/* ── COMPARING TWO PRODUCTS ────────────────────────────────────────────────*/

export interface Comparison {
  formulationId: string;
  brand: string;
  productName: string;
  parameters: Array<{ parameter: string; outOf10: number; note: string }>;
  /** Deliberately absent: a total. The parameters answer different questions
   *  and summing them would let a cheap, well-packaged product with nothing in
   *  it out-rank an appropriate one. */
  price: string | null;
  priceNote: string;
}

/**
 * THE EIGHT PARAMETERS — and the rule that price cannot compensate for any of
 * the other seven.
 *
 * There is no total, and that is not an omission. A single ranked number is
 * what turns a comparison into a recommendation, and the moment value per
 * effective dose can be added to scientific evidence, the cheapest product
 * with the least in it starts winning. Price appears here as a fact about the
 * transaction, next to a note about what it is buying — never as a score that
 * lifts anything else.
 */
export const compare = (f: Formulation, c: Citizen): Comparison => {
  const a = assessOne(f, c);
  const gradeable = a.doses.filter((d) => d.band.band !== 'unknown');
  const wellDosed = gradeable.filter((d) => d.band.band === 'nutritional').length;
  const tokens = gradeable.filter((d) => d.band.band === 'token').length;
  const over = gradeable.filter((d) => d.band.band !== 'nutritional' && d.band.band !== 'token').length;

  const doseAppropriateness = gradeable.length
    ? Math.max(0, Math.round(((wellDosed / gradeable.length) * 10 - over * 1.5) * 10) / 10)
    : 0;

  const transparency = (f.compositionSource === 'brand-label' ? 6 : f.compositionSource === 'retailer-panel' ? 4 : f.compositionSource === 'partial' ? 2 : 0)
    + (f.declaresPctRda ? 2 : 0)
    + (f.fssaiLicence ? 1 : 0)
    + (f.nutrients.some((r) => r.form) ? 1 : 0);

  const formulationQuality = Math.max(0, 10
    - (f.dataFlags.length * 0.8)
    - (f.nutrients.some((r) => r.suspect) ? 2 : 0)
    - (f.others.some((o) => o.amount === null) ? 1.5 : 0));

  return {
    formulationId: f.id, brand: f.brand, productName: f.productName,
    parameters: [
      { parameter: 'Scientific evidence', outOf10: a.evidence.value, note: 'For this formulation as a whole, starting from a category whose own trials came back null.' },
      { parameter: 'Personal suitability', outOf10: a.personalFit.value, note: 'How strongly the evidence applies to you, from your results rather than from the category.' },
      { parameter: 'Dose appropriateness', outOf10: Math.min(10, doseAppropriateness), note: `${wellDosed} of ${gradeable.length} gradeable nutrients at a nutritional amount, ${tokens} token, ${over} above the Indian ceiling or an upper limit.` },
      { parameter: 'Safety', outOf10: a.safety.value, note: 'Against your medicines, conditions, pregnancy status and what you already take.' },
      { parameter: 'Ingredient transparency', outOf10: Math.min(10, transparency), note: `${f.compositionSource === 'UNKNOWN' ? 'Publishes no quantified composition at all.' : f.compositionSource === 'brand-label' ? 'The brand publishes its own full ingredient statement.' : f.compositionSource === 'partial' ? 'Some ingredients carry no quantity.' : 'Composition comes from a retailer panel rather than a label.'}${f.declaresPctRda ? ` Declares percentages against ${f.declaresPctRda.against}.` : ' No per-nutrient percentage of any requirement.'}` },
      { parameter: 'Formulation quality', outOf10: Math.round(formulationQuality * 10) / 10, note: f.dataFlags.length ? `${f.dataFlags.length} data or formulation flags recorded against this product.` : 'No flags recorded.' },
      { parameter: 'Third-party verification', outOf10: f.thirdParty ? 8 : 0, note: f.thirdParty ?? 'None published. Evidence that an ingredient works and evidence that this tablet contains it are two different questions, and only the first has an answer here.' },
      { parameter: 'Value per effective dose', outOf10: a.evidence.value >= 5 && f.priceInr ? Math.min(10, Math.round((1000 / f.priceInr) * 10) / 10) : 0, note: 'Scored only where the evidence score reaches halfway. A cheaper way to swallow something with no case behind it is not value.' },
    ],
    price: f.price,
    priceNote: 'Price is a fact about the transaction and never a score that lifts another. There is deliberately no total here: a single ranked number is what turns a comparison into a recommendation.',
  };
};
