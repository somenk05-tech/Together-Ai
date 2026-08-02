/**
 * THE ONE HEALTH-CONDITION VOCABULARY, AND THE FOUR THAT LOOKED LIKE IT.
 *
 * B.13. E.21 called this "health conditions in three vocabularies". Counted
 * against the tree on 2 Aug it is FIVE readers, and the interesting defect is
 * not the duplication:
 *
 *  1. NUTRITION offers five chips — 'Diabetes', 'Hypertension', 'PCOS',
 *     'Kidney Disease', 'Fatty Liver' — and stores the DISPLAY STRING as free
 *     text in `FoodPref.extras.healthConditions` (`z.string().max(60)`, up to
 *     30 of them). There is no free-text input anywhere, so the set of strings
 *     that can actually reach the database is these five and nothing else.
 *  2. FITNESS offers a closed enum on a different table —
 *     `DECLARED_CONDITIONS = hypertension | diabetes | pregnancy | jointPain`
 *     on `FitnessProfile.conditions`, a csv column.
 *  3. `activeMntRules` matches nutrition's free text by lower-case SUBSTRING
 *     against nine clinical rules: ckdEarly, ckdLate, dialysis, diabetes,
 *     hypertension, dyslipidemia, fattyLiver, gout, elderly.
 *  4. MEDICAL derives its own `triggeredConditions(flags)` from blood markers,
 *     with a third set of keys and names.
 *  5. BEAUTY reads a fifth list out of its own extras blob —
 *     `has(conds, 'pcos', 'thyroid', 'hormonal acne')` and
 *     `has(conds, 'pregnan', 'breastfeed')`.
 *
 * WHAT THAT COSTS, MEASURED RATHER THAN ASSERTED:
 *
 * · PREGNANCY CANNOT BE DECLARED TO NUTRITION. `computeTargets` carries a
 *   full pregnancy path — trimester energy (+0 / +340 / +450 kcal, ACOG/IOM),
 *   protein raised to ≥1.1 g/kg and +25 g/day, iron 27 mg, folate 600 mcg,
 *   calcium 1,000 mg, deficits refused — `meal-engine` blocks intermittent
 *   fasting on `/pregnan|breastfeed|lactat/i`, and `micronutrients.ts` REFUSES
 *   to serve an adult figure rather than guess. Every one of those reads a
 *   condition string that no form can produce. The alternate source in
 *   `computeTargets`, `flags.pregnant === 'yes'`, cannot fire either: `flags`
 *   is built as `flags[rule.key] = status` from blood markers and has never
 *   held that key. Fitness collects pregnancy two tabs away, into a column
 *   nutrition does not read. The most carefully written safety code in the
 *   nutrition engine was unreachable from the citizen's side.
 * · THE MATCHERS DISAGREE WITH EACH OTHER INSIDE ONE HUB. Diabetes is
 *   `has('diabetes')` in `clinical-mnt.ts` and `/diab/i` in
 *   `nutrition.service.ts`. Kidney is `has('kidney','renal','ckd')` in one and
 *   `/kidney|renal|\bckd\b|nephro/i` in the other — so 'nephropathy' turns on
 *   the recipe filter and not the clinical rule.
 * · PCOS IS OFFERED AND HAS NO CLINICAL RULE. It is the one chip no other hub
 *   lists; `MNT_RULES` has no entry for it. It reaches an ingredient
 *   avoid-list and nothing else.
 *
 * SO: KEYS, ON THE MASTER PROFILE, AND ONE CROSSING POINT HERE.
 *
 * The list below is the UNION OF WHAT HUBS ALREADY ACT ON — not a medical
 * taxonomy, and not a wish list. Every key earns its place by having a reader
 * today. Adding a key with no reader is the H3 defect; this file is not where
 * to start one.
 *
 * WHAT CROSSING COSTS, stated once:
 *
 * · Blood-DERIVED keys are not declarable and never cross. Fitness's engine
 *   speaks 'glycemic', 'dyslipidemia', 'inflammation' and 'anemia' as
 *   conclusions drawn from a lab report; medical's `triggeredConditions` does
 *   the same. `healthConditionFrom('glycemic')` returns undefined ON PURPOSE.
 *   Turning a lab reading into a declared condition would put a clinical label
 *   in a citizen's own words that they never said, which is the failure the
 *   whole Master Profile exists to avoid. `anaemia` and `highCholesterol` ARE
 *   declarable — a citizen can be told they have either by a doctor — but they
 *   arrive by being ticked, never by being inferred here.
 * · 'hormonal acne' and 'seborrheic' do not cross. They are beauty's skin
 *   descriptors, they drive a skin routine and nothing else, and beauty keeps
 *   reading them out of its own extras. They are not conditions this list
 *   holds and they return undefined.
 * · `elderly` is not here. It is an MNT rule keyed off age ≥ 65 that nobody
 *   declares, and putting it in a list a citizen ticks would let somebody turn
 *   it off about themselves.
 * · Anything unrecognised → `undefined`. Never a guess, never a default. An
 *   empty list means "nothing ticked", which is an answer; it does not mean
 *   "we have not asked".
 *
 * TWO KEYS CARRY A QUALIFIER, because a rule that already branches on it
 * exists. `pregnancy` carries a trimester (the energy figure is per-trimester,
 * and a plain tick would make every trimester the second one). `kidney`
 * carries a stage (ckdEarly / ckdLate / dialysis are three different protein
 * ceilings). In both cases the qualifier is OPTIONAL and its absence is
 * modelled, not defaulted away — see `KIDNEY_STAGE_UNSTATED` below.
 */

/** Every condition a citizen can declare about themselves, as stored. */
export const HEALTH_CONDITIONS = [
  'diabetes',
  'hypertension',
  'highCholesterol',
  'kidney',
  'fattyLiver',
  'gout',
  'pcos',
  'thyroid',
  'anaemia',
  'jointPain',
  'pregnancy',
  'breastfeeding',
] as const;

export type HealthCondition = (typeof HEALTH_CONDITIONS)[number];

/** What a screen shows. Written out; never derived from the key. */
const LABELS: Record<HealthCondition, string> = {
  diabetes: 'Diabetes',
  hypertension: 'High blood pressure',
  highCholesterol: 'High cholesterol',
  kidney: 'Kidney disease',
  fattyLiver: 'Fatty liver',
  gout: 'Gout / high uric acid',
  pcos: 'PCOS',
  thyroid: 'Thyroid condition',
  anaemia: 'Anaemia',
  jointPain: 'Joint sensitivity',
  pregnancy: 'Pregnancy',
  breastfeeding: 'Breastfeeding',
};

/** The citizen-facing name of a stored condition. */
export function healthConditionLabel(key: string): string {
  return LABELS[key as HealthCondition] ?? key;
}

/**
 * Everything that has ever meant one of these conditions, in any of the five
 * vocabularies, in lower case with spaces and punctuation removed.
 *
 * Written out rather than derived. A derivation clever enough to fold
 * 'Kidney Disease' and 'ckd' together is clever enough to fold 'no diabetes'
 * into diabetes, and this list decides what somebody is fed.
 */
const KEY_OF: Record<string, HealthCondition> = {
  // Nutrition's five chips, as stored today.
  diabetes: 'diabetes',
  hypertension: 'hypertension',
  pcos: 'pcos',
  kidneydisease: 'kidney',
  fattyliver: 'fattyLiver',

  // Fitness's closed enum.
  jointpain: 'jointPain',
  pregnancy: 'pregnancy',

  // Beauty's extras.
  thyroid: 'thyroid',
  breastfeeding: 'breastfeeding',

  // Spellings the clinical matchers already accept, so nothing a reader
  // recognises today stops being recognised.
  type1diabetes: 'diabetes', type2diabetes: 'diabetes',
  t1d: 'diabetes', t2d: 'diabetes', t2dm: 'diabetes',
  diabetic: 'diabetes', raisedhba1c: 'diabetes', highbloodsugar: 'diabetes',
  highbloodpressure: 'hypertension', bloodpressure: 'hypertension',
  htn: 'hypertension', hypertensive: 'hypertension',
  highcholesterol: 'highCholesterol', cholesterol: 'highCholesterol',
  dyslipidaemia: 'highCholesterol', dyslipidemia: 'highCholesterol',
  raisedldl: 'highCholesterol', highldl: 'highCholesterol',
  hightriglycerides: 'highCholesterol',
  kidney: 'kidney', renal: 'kidney', ckd: 'kidney',
  chronickidneydisease: 'kidney', renaldisease: 'kidney',
  nephropathy: 'kidney', dialysis: 'kidney',
  nafld: 'fattyLiver', masld: 'fattyLiver', nash: 'fattyLiver',
  nonalcoholicfattyliver: 'fattyLiver',
  gout: 'gout', highuricacid: 'gout', uricacid: 'gout', hyperuricaemia: 'gout',
  polycysticovarysyndrome: 'pcos', polycysticovariansyndrome: 'pcos',
  hypothyroid: 'thyroid', hypothyroidism: 'thyroid',
  hyperthyroid: 'thyroid', hyperthyroidism: 'thyroid', thyroiddisorder: 'thyroid',
  anaemia: 'anaemia', anemia: 'anaemia',
  irondeficiency: 'anaemia', irondeficiencyanaemia: 'anaemia',
  jointsensitivity: 'jointPain', arthritis: 'jointPain',
  osteoarthritis: 'jointPain', kneepain: 'jointPain',
  pregnant: 'pregnancy', expecting: 'pregnancy',
  lactating: 'breastfeeding', lactation: 'breastfeeding',
  nursing: 'breastfeeding',
};

/** Lower case, and every space, hyphen, slash, dot and apostrophe removed —
 *  so 'Kidney Disease', 'kidney-disease' and 'KidneyDisease' are one lookup. */
const fold = (raw: string): string => raw.trim().toLowerCase().replace(/[\s\-_/.'’()]/g, '');

/**
 * A condition key from whatever any hub stored, or undefined if it is not a
 * condition this list holds. Never a guess: an unknown string is not a
 * condition, it is an unknown string.
 */
export function healthConditionFrom(raw?: string | null): HealthCondition | undefined {
  const k = fold(raw ?? '');
  if (!k) return undefined;
  return KEY_OF[k];
}

/**
 * A stored list — free text, csv, or keys — as canonical keys, deduplicated,
 * in the order of `HEALTH_CONDITIONS` so two citizens who ticked the same
 * boxes hold byte-identical lists. Anything unrecognised is DROPPED, and the
 * caller that cares which strings were dropped can ask for them.
 */
export function healthConditionsFrom(raw: readonly string[] | null | undefined): HealthCondition[] {
  const seen = new Set<HealthCondition>();
  for (const item of raw ?? []) {
    const key = healthConditionFrom(item);
    if (key) seen.add(key);
  }
  return HEALTH_CONDITIONS.filter((k) => seen.has(k));
}

/** The strings a stored list held that are not conditions — for a migration
 *  report or a log, never for a decision about what somebody is fed. */
export function unrecognisedConditions(raw: readonly string[] | null | undefined): string[] {
  return (raw ?? []).filter((item) => item.trim() !== '' && !healthConditionFrom(item));
}

/**
 * PREGNANCY'S QUALIFIER.
 *
 * `computeTargets` adds +0 kcal in the first trimester, +340 in the second and
 * +450 in the third (ACOG/IOM). A plain tick with no trimester would have to
 * pick one for everybody, and picking the second is wrong in the first and low
 * in the third — a figure served to somebody pregnant, which is the case
 * `micronutrients.ts` refuses rather than guesses. So the trimester is asked,
 * and NOT KNOWING IS AN ANSWER: `'unstated'` is stored, read as the second
 * trimester by the engine, and SAID OUT LOUD wherever the figure is shown.
 */
export const TRIMESTERS = ['first', 'second', 'third', 'unstated'] as const;
export type Trimester = (typeof TRIMESTERS)[number];

const TRIMESTER_LABELS: Record<Trimester, string> = {
  first: 'First trimester',
  second: 'Second trimester',
  third: 'Third trimester',
  unstated: 'I’d rather not say',
};

export function trimesterLabel(key: string): string {
  return TRIMESTER_LABELS[key as Trimester] ?? key;
}

export function trimesterFrom(raw?: string | null): Trimester | undefined {
  const k = fold(raw ?? '');
  if (!k) return undefined;
  const direct: Record<string, Trimester> = {
    first: 'first', '1': 'first', t1: 'first', firsttrimester: 'first',
    second: 'second', '2': 'second', t2: 'second', secondtrimester: 'second',
    third: 'third', '3': 'third', t3: 'third', thirdtrimester: 'third',
    unstated: 'unstated', unknown: 'unstated', prefernottosay: 'unstated',
  };
  return direct[k];
}

/**
 * KIDNEY'S QUALIFIER.
 *
 * `activeMntRules` already branches three ways on the condition TEXT — the
 * word 'dialysis' picks the dialysis rule, 'stage 3/4/5' picks ckdLate, and
 * anything else falls to ckdEarly, whose own label reads 'CKD stage 1–2 /
 * unstaged'. Keys keep all three and change nothing: `KIDNEY_STAGE_UNSTATED`
 * maps to ckdEarly exactly as the absent text does today. Whether an unstaged
 * citizen SHOULD get the less restrictive protein ceiling is a clinical
 * question, it is the behaviour that has always shipped, and this file is not
 * the place to change it quietly.
 */
export const KIDNEY_STAGE_UNSTATED = 'unstated';
export const KIDNEY_STAGES = ['early', 'late', 'dialysis', KIDNEY_STAGE_UNSTATED] as const;
export type KidneyStage = (typeof KIDNEY_STAGES)[number];

const KIDNEY_STAGE_LABELS: Record<KidneyStage, string> = {
  early: 'Stage 1–2',
  late: 'Stage 3–5, not on dialysis',
  dialysis: 'On dialysis',
  unstated: 'I don’t know the stage',
};

export function kidneyStageLabel(key: string): string {
  return KIDNEY_STAGE_LABELS[key as KidneyStage] ?? key;
}

export function kidneyStageFrom(raw?: string | null): KidneyStage | undefined {
  const k = fold(raw ?? '');
  if (!k) return undefined;
  if (k === 'dialysis' || k === 'ondialysis') return 'dialysis';
  if (/^(late|stage3|stage4|stage5|stage35|3|4|5)$/.test(k)) return 'late';
  if (/^(early|stage1|stage2|stage12|1|2)$/.test(k)) return 'early';
  if (k === 'unstated' || k === 'unknown' || k === 'idontknow') return KIDNEY_STAGE_UNSTATED;
  return undefined;
}
