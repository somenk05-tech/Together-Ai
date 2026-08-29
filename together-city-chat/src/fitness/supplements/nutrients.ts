import type { Grade } from './knowledge';

/**
 * THE NUTRIENT REFERENCE DATABASE — WHAT A NUMBER IS, AND WHO SET IT.
 *
 * `knowledge.ts` holds what an evidence review says about SUPPLEMENTS.
 * `labs.ts` holds what national bodies say about BLOOD RESULTS. This file
 * holds the third kind of claim, and it is the one a multivitamin is made of:
 * how much of a nutrient a body is said to need, how much is too much, and
 * whether the number came from India or from somewhere else.
 *
 * ── WHY THIS FILE IS SHAPED THE WAY IT IS ─────────────────────────────────
 *
 * While this file was being researched, a plausible, tidy, fully-formatted
 * table of "ICMR tolerable upper limits" was produced and very nearly
 * believed. Vitamin A 3,000 µg. Calcium 2,500 mg. Iron 45 mg. Zinc 40 mg.
 * Selenium 400 µg. Every single value was character-for-character the AMERICAN
 * limit, wearing an Indian institution's name. What ICMR-NIN 2020 actually
 * says, in its own words, is:
 *
 *     "There is a paucity of data to arrive at upper tolerable limits."
 *
 * and the only nutrient-specific Indian upper limit that could be quoted from
 * it verbatim is pyridoxine, at 100 mg/day.
 *
 * That near-miss is the design of this file. Every reference value carries a
 * `provenance` with an authority, a year, and an `origin` that is either
 * 'india' or 'foreign-fallback' — and 'foreign-fallback' means *India has not
 * set this number and an American or European one is standing in its place*.
 * The engine may print such a value. It may never call it a recommendation for
 * an Indian. A spec asserts that no value carries an Indian authority's name
 * without an Indian origin, because that is precisely the error that was made
 * once already and would not have been visible in the output.
 *
 * ── THE FOUR TRAPS THIS FILE ENCODES RATHER THAN AVERAGES ─────────────────
 *
 * 1. AN UPPER LIMIT IS A LIMIT ON SOMETHING SPECIFIC. Magnesium's 350 mg
 *    ceiling is for SUPPLEMENTS AND MEDICINES ONLY; the Indian RDA for an
 *    adult man is 440 mg, which is above it, and that is not a contradiction.
 *    Niacin's 35 mg is supplemental niacin. Vitamin E's 1,000 mg is
 *    supplemental alpha-tocopherol. Folic acid's 1,000 µg is synthetic folic
 *    acid from fortification and pills, and there is expressly NO limit on
 *    food folate. Vitamin A's 3,000 µg is preformed retinol and expressly not
 *    beta-carotene. Treat any of these as a total-intake ceiling and the
 *    engine invents alarms that are not real. `UlScope` exists for this and
 *    for nothing else.
 *
 * 2. THE UNIT ON THE RDA IS NOT ALWAYS THE UNIT ON THE LIMIT. Folate's
 *    requirement is in µg DFE and its limit is in µg of synthetic folic acid.
 *    They are different quantities. They are never summed here.
 *
 * 3. INDIA'S NUMBER IS OFTEN NOT AMERICA'S, AND SOMETIMES BY A LOT. Iron for
 *    an Indian woman is 29 mg against 18 mg; zinc for an Indian man is 17 mg
 *    against 11; riboflavin is roughly double. Folate runs the other way —
 *    ICMR asks 220 µg DFE of a woman where the US asks 400 — and that one is
 *    dangerous, because a woman who might become pregnant needs the higher
 *    figure for reasons that have nothing to do with meeting an average
 *    requirement. `periconceptionalOverride` carries that, and the engine is
 *    required to read it rather than a percentage.
 *
 * 4. "NO UPPER LIMIT" IS SOMETIMES THE MOST MISLEADING TRUE SENTENCE
 *    AVAILABLE. No body sets one for beta-carotene, and two randomised trials
 *    were stopped early for excess lung cancer in smokers. `harm` is a
 *    separate field from `ul` because of that case.
 *
 * ── WHAT ICMR-NIN 2020 SIMPLY DOES NOT COVER ──────────────────────────────
 *
 * Vitamin E, vitamin K, pantothenic acid, biotin, selenium, copper,
 * manganese, chromium, phosphorus and potassium get a one-to-three page
 * narrative chapter or none at all, and appear in no Indian RDA table.
 * Molybdenum has no chapter whatsoever. Each of those carries `rdaMale: null`
 * here, and the screen is obliged to say "India sets no value for this" rather
 * than quietly printing Washington's.
 *
 * Researched 29 August 2026 against: ICMR-NIN, "A Brief Note on Nutrient
 * Requirements for Indians, RDA and EAR" (2020) — the free first-party
 * summary, which covers 17 nutrients and no more; NIH Office of Dietary
 * Supplements professional fact sheets; EFSA's 2024 UL summary. The full
 * printed ICMR report is a paid publication and was NOT read. Where a value
 * would have come from it, this file says UNKNOWN.
 */

export type Unit = 'mcg' | 'mg' | 'IU' | 'mcg DFE' | 'mcg RAE';

export type RefBasis =
  | 'RDA'   // meets the requirement of ~97.5% of the group
  | 'EAR'   // meets the requirement of half of it
  | 'AI'    // adequate intake — a weaker construct than an RDA, see `basis`
  | 'UL'
  | 'safe-level';

/**
 * WHERE A NUMBER CAME FROM. Never optional, never blank, and `origin` is the
 * field that matters: 'foreign-fallback' means India has not published this
 * and somebody else's number is standing in.
 */
export interface Provenance {
  authority: string;
  year: number;
  origin: 'india' | 'foreign-fallback';
  note?: string;
}

export interface RefValue {
  value: number;
  unit: Unit;
  basis: RefBasis;
  provenance: Provenance;
}

/** WHAT AN UPPER LIMIT IS A LIMIT ON. See trap 1 in the header. */
export type UlScope =
  | 'total'
  | 'supplemental'
  | 'preformed-retinol'
  | 'supplemental-alpha-tocopherol'
  | 'synthetic-folic-acid'
  | 'supplemental-niacin';

export interface UpperLimit extends RefValue {
  scope: UlScope;
  /** Said to the citizen when the scope is not 'total', because otherwise a
   *  ceiling below the RDA reads as a contradiction. */
  scopeNote: string;
}

/**
 * WHETHER A RETEST IS WORTH PAYING FOR.
 *
 * Only three markers in this whole file clear the bar, and the bar is: the
 * marker reflects stores, it moves on a known timescale, and the result
 * changes a decision. Vitamin D, ferritin with haemoglobin, and red-cell
 * folate clear it. Zinc, magnesium, copper, selenium and iodine do not, and
 * for several of them the correct behaviour is to REFUSE to offer the test.
 *
 * 'none'     — no routine blood monitoring; follow diet, symptom or ceiling
 * 'consider' — a test has a place in specific circumstances, not routinely
 * 'retest'   — a defensible consumer retest exists, with an interval
 * 'medical'  — monitoring belongs with a clinician, not with this screen
 */
export type MonitorClass = 'none' | 'consider' | 'retest' | 'medical';

export interface Marker {
  /** null where no individual blood test is usable at all. */
  baseline: string | null;
  /** A second test the first cannot honestly be read without. */
  alongside?: string;
  limitation: string;
  monitor: MonitorClass;
  /** Weeks, as a window. null where no retest is worth paying for — and then
   *  `insteadWatch` is required and the spec asserts it. */
  retestWeeks: [number, number] | null;
  retestSource: string;
  insteadWatch?: string;
  /** The physiology that sets the interval — never a round number for its own
   *  sake. "Retest everything at three months" is not a finding, it is a habit. */
  why?: string;
}

/**
 * THE THREE QUESTIONS, KEPT APART ON PURPOSE.
 *
 * Almost every wrong supplement recommendation ever made comes from answering
 * the first and reporting it as the third. Vitamin D corrects deficiency —
 * settled. Vitamin D prevents disease in the replete — VITAL says no, D-Health
 * says no, the fracture ancillary says no. Both sentences are true and they
 * are not the same sentence. The engine may never quote `deficient` to
 * somebody whose result is normal.
 */
export interface ThreeAnswers {
  deficient: { verdict: string; grade: Grade; source: string };
  insufficient: { verdict: string; grade: Grade; source: string };
  replete: { verdict: string; grade: Grade; source: string };
}

export interface NutrientFact {
  id: string;
  name: string;
  /** Matched loosely against label text, lower-cased. */
  aliases: string[];
  unit: Unit;
  role: string;
  deficiency: string;
  rdaMale: RefValue | null;
  rdaFemale: RefValue | null;
  /** Only where rdaMale is null: whose number is standing in, labelled. */
  fallback?: RefValue;
  /** Why India publishes nothing, where that is the case. */
  indiaSilentBecause?: string;
  ul: UpperLimit | null;
  ulAbsentBecause?: string;
  /** A requirement that is not a percentage of anything — see trap 3. */
  periconceptionalOverride?: { text: string; source: string };
  forms: Array<{ form: string; note: string }>;
  answers: ThreeAnswers;
  /** Documented harm from excess. Separate from `ul` because beta-carotene has
   *  no upper limit and two trials stopped early. */
  harm?: { what: string; at: string; source: string };
  marker: Marker;
}

/* ── BUILDERS ───────────────────────────────────────────────────────────────
   Three of them, and the reason there are three rather than one is the whole
   argument of this file: an Indian number, a foreign number standing in for a
   missing Indian one, and a ceiling that knows what it is a ceiling on. A
   value cannot be constructed here without declaring which of those it is. */

const ICMR_2020 = 'ICMR-NIN, Nutrient Requirements for Indians (RDA & EAR), Brief Note';

const icmr = (value: number, unit: Unit, basis: RefBasis = 'RDA', note?: string): RefValue => ({
  value, unit, basis,
  provenance: { authority: ICMR_2020, year: 2020, origin: 'india', note },
});

/** A number India has not published. It prints with its passport showing. */
const foreign = (
  value: number, unit: Unit, basis: RefBasis, authority: string, year: number, note?: string,
): RefValue => ({
  value, unit, basis,
  provenance: { authority, year, origin: 'foreign-fallback', note },
});

const FNB = 'US Food and Nutrition Board, via NIH Office of Dietary Supplements';

const fnbUl = (
  value: number, unit: Unit, year: number, scope: UlScope, scopeNote: string, note?: string,
): UpperLimit => ({
  value, unit, basis: 'UL', scope, scopeNote,
  provenance: { authority: FNB, year, origin: 'foreign-fallback', note },
});

/* ── THE VITAMINS ───────────────────────────────────────────────────────── */

export const NUTRIENTS: NutrientFact[] = [
  {
    id: 'vitamin-a',
    name: 'Vitamin A',
    aliases: ['vitamin a', 'retinol', 'retinyl', 'vitamin a acetate', 'vitamin a palmitate'],
    unit: 'mcg',
    role: 'Vision, epithelial integrity, immune function and gene transcription through the retinoic-acid receptors.',
    deficiency: 'Night blindness, xerophthalmia, impaired immunity. Serum retinol is homeostatically defended and falls only late, so it detects deficiency and not insufficiency.',
    rdaMale: icmr(1000, 'mcg'),
    rdaFemale: icmr(840, 'mcg'),
    ul: fnbUl(3000, 'mcg', 2001, 'preformed-retinol',
      'This ceiling is for preformed vitamin A — retinol and retinyl esters. It is expressly NOT a ceiling on beta-carotene, which has no upper limit and its own separate problem.'),
    forms: [
      { form: 'Retinyl acetate / retinyl palmitate', note: 'Preformed. Counts fully against the ceiling above.' },
      { form: 'Beta-carotene', note: 'Provitamin. Converted at a poor and variable rate, does not count against the retinol ceiling, and carries the smoker warning instead. Tracked as its own row.' },
    ],
    answers: {
      deficient: { verdict: 'Correcting documented deficiency prevents blindness and reduces child mortality. Not in dispute.', grade: 'strong', source: 'WHO vitamin A supplementation guidance' },
      insufficient: { verdict: 'Dietary correction first; a nutritional-dose multivitamin closes a marginal gap without needing a test.', grade: 'moderate', source: 'NIH ODS vitamin A fact sheet' },
      replete: { verdict: 'No benefit shown from adding preformed vitamin A to an adequate diet, and the harm side of the ledger is real. There is no reason to seek it out.', grade: 'null-or-harm', source: 'NIH ODS vitamin A fact sheet' },
    },
    harm: {
      what: 'Acute: headache, blurred vision, raised intracranial pressure. Chronic: dry skin, bone and joint pain, hepatotoxicity. And it is teratogenic — malformations of eye, skull, lungs and heart.',
      at: 'Teratogenic risk above 3,000 mcg RAE (10,000 IU) a day in pregnancy. Acute toxicity at roughly a hundred times the requirement.',
      source: 'NIH ODS vitamin A fact sheet (FNB 2001 basis)',
    },
    marker: {
      baseline: 'Serum retinol',
      limitation: 'Defended within a narrow band by the liver until stores are nearly gone, and suppressed by inflammation. It cannot grade adequacy.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'no guideline supports routine retinol retesting at nutritional doses',
      insteadWatch: 'Total preformed intake against the ceiling, and pregnancy status.',
    },
  },
  {
    id: 'beta-carotene',
    name: 'Beta-carotene',
    aliases: ['beta carotene', 'beta-carotene', 'β-carotene', 'provitamin a'],
    unit: 'mcg',
    role: 'Provitamin A carotenoid, cleaved to retinal in the intestinal mucosa at a rate that falls as vitamin A status rises — which is why dietary carotene does not cause vitamin A toxicity.',
    deficiency: 'None. There is no beta-carotene deficiency state; it is a source of vitamin A, not a nutrient in its own right.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'ICMR-NIN publishes no separate beta-carotene requirement; it is accounted for inside the vitamin A figure.',
    ul: null,
    ulAbsentBecause: 'Neither the FNB (2001) nor EFSA (2024) has set one — and this is the single most misleading "no upper limit" in the file. See `harm`.',
    forms: [{ form: 'Beadlet, usually declared as a percentage strength', note: 'A label reading "2100 mcg (beta-carotene 20%)" is genuinely ambiguous between 2,100 mcg of beadlet and 2,100 mcg of carotene. Only a photograph of the label settles it.' }],
    answers: {
      deficient: { verdict: 'A legitimate vitamin A source in a vitamin-A-deficient diet.', grade: 'moderate', source: 'NIH ODS vitamin A fact sheet' },
      insufficient: { verdict: 'Food carotenoids are fine. Supplemental beta-carotene adds risk without adding a demonstrated benefit.', grade: 'null-or-harm', source: 'ATBC and CARET' },
      replete: { verdict: 'The FNB advises against beta-carotene supplements for the general population.', grade: 'null-or-harm', source: 'NIH ODS vitamin A fact sheet' },
    },
    harm: {
      what: 'Increased lung cancer, and increased death from it, in smokers. Both trials were stopped early.',
      at: 'ATBC: 20 mg/day for 5–8 years, +18% lung cancer. CARET: 30 mg/day with retinyl palmitate, +28% lung cancer and +46% lung-cancer death.',
      source: 'ATBC and CARET, reviewed in JNCI',
    },
    marker: {
      baseline: null,
      limitation: 'Plasma carotenoids reflect recent vegetable intake, not status, because there is no status.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'not a testable question',
      insteadWatch: 'Whether the citizen smokes. That is the only fact about beta-carotene this engine needs.',
    },
  },
  {
    id: 'vitamin-d',
    name: 'Vitamin D',
    aliases: ['vitamin d', 'vitamin d3', 'vitamin d2', 'cholecalciferol', 'ergocalciferol'],
    unit: 'IU',
    role: 'A steroid hormone in all but name. Hydroxylated in the liver to 25(OH)D — the storage form a blood test measures — then in the kidney to calcitriol, which drives intestinal calcium absorption through the nuclear vitamin D receptor.',
    deficiency: 'Rickets, osteomalacia, secondary hyperparathyroidism. Measured as 25(OH)D below 20 ng/mL.',
    rdaMale: icmr(600, 'IU', 'RDA', 'ICMR prints this in IU, not micrograms. 600 IU = 15 mcg. A secondary source rendering it as "600 mcg" is wrong by a factor of forty and would exceed every upper limit in existence.'),
    rdaFemale: icmr(600, 'IU', 'RDA', 'Same figure for both sexes.'),
    ul: fnbUl(4000, 'IU', 2010, 'total',
      'Food, fortified food and supplements together. EFSA (2023) sets the same figure.',
      'India\'s characteristic 60,000 IU weekly sachet is not a supplement dose at all — it is a repletion course, and it sits outside food law entirely.'),
    forms: [
      { form: 'D3, cholecalciferol', note: 'Raises and holds 25(OH)D better than D2. Usually lanolin-derived, so not vegetarian unless the label says lichen.' },
      { form: 'D3 from lichen', note: 'The vegan D3. Declared explicitly by only a handful of Indian products; where a label says "D3" and nothing else, the source is unstated.' },
      { form: 'D2, ergocalciferol', note: 'Yeast or fungal, so it carries a green dot — which appears to be why a large part of the Indian market uses it. It raises 25(OH)D less efficiently than D3.' },
    ],
    answers: {
      deficient: { verdict: 'Correcting a documented deficiency is the settled part of the vitamin D evidence.', grade: 'strong', source: 'Endocrine Society 2011; Indian Expert Group Consensus, IJEM 2025' },
      insufficient: { verdict: 'A nutritional dose is reasonable and cheap. What it buys is a number, and whether that number buys an outcome is exactly what the trials could not show.', grade: 'moderate', source: 'NIH ODS vitamin D fact sheet' },
      replete: { verdict: 'It does not prevent disease in people who already have enough. VITAL was null for cancer and cardiovascular events, its fracture ancillary was null for total, non-vertebral and hip fractures, D-Health was null for mortality, and Jolliffe 2024 was null for respiratory infection.', grade: 'null-or-harm', source: 'VITAL, NEJM 2018–2022; Jolliffe 2024' },
    },
    harm: {
      what: 'Hypercalcaemia, hypercalciuria, nausea and neuropsychiatric disturbance; at the severe end renal failure, soft-tissue calcification and arrhythmia.',
      at: 'Risk rises substantially above 10,000 IU/day; frank toxicity is reported at 25(OH)D above roughly 150 ng/mL.',
      source: 'IOM 2011; Indian Expert Group Consensus, IJEM 2025',
    },
    marker: {
      baseline: '25(OH)D',
      alongside: 'Adjusted serum calcium one month after any loading course — a loading dose can unmask primary hyperparathyroidism.',
      limitation: 'Substantial inter-assay variability, and biotin at 5 mg or more corrupts the immunoassay. 1,25(OH)2D is the wrong test and is often normal in deficiency.',
      monitor: 'retest',
      retestWeeks: [12, 26],
      retestSource: 'Royal Osteoporosis Society 2020 (3–6 months); Indian Expert Group Consensus, IJEM 2025',
      why: 'A 25(OH)D half-life of about a fortnight puts steady state near twelve weeks. In obesity that stretches — calculated half-lives run 39 to 98 days, so a three-month retest reads low and invites a dose increase that was never needed.',
      insteadWatch: undefined,
    },
  },
  {
    id: 'vitamin-e',
    name: 'Vitamin E',
    aliases: ['vitamin e', 'tocopherol', 'tocopheryl', 'alpha tocopherol', 'tocotrienol'],
    unit: 'mg',
    role: 'The principal lipid-phase chain-breaking antioxidant of cell membranes.',
    deficiency: 'Essentially confined to fat-malabsorption states and rare genetic defects. Dietary deficiency in a free-living adult is close to unheard of.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'ICMR-NIN 2020 gives vitamin E and vitamin K a three-page shared narrative chapter and no row in its RDA table.',
    fallback: foreign(15, 'mg', 'RDA', FNB, 2000, 'An American requirement. India has not published one, and this figure should never be described to a citizen as an Indian recommendation.'),
    ul: fnbUl(1000, 'mg', 2000, 'supplemental-alpha-tocopherol',
      'Supplemental alpha-tocopherol only, including all eight synthetic stereoisomers. Food vitamin E does not count against it.',
      'EFSA sets 300 mg on a total-intake basis, which is a materially stricter position.'),
    forms: [
      { form: 'd-alpha-tocopherol (natural)', note: 'Higher biological activity than the synthetic form per milligram.' },
      { form: 'dl-alpha-tocopheryl acetate (synthetic)', note: 'What almost every Indian multivitamin actually contains.' },
    ],
    answers: {
      deficient: { verdict: 'Correcting malabsorption-driven deficiency is a clinical matter and belongs with a doctor.', grade: 'strong', source: 'NIH ODS vitamin E fact sheet' },
      insufficient: { verdict: 'The amount inside a nutritional multivitamin is unremarkable and uncontroversial.', grade: 'moderate', source: 'NIH ODS vitamin E fact sheet' },
      replete: { verdict: 'Standalone vitamin E is the clearest do-not-buy in the whole category. SELECT, 34,887 men: significantly increased prostate cancer, HR 1.17. Meta-analyses find a small but significant rise in all-cause mortality from around 150 IU/day.', grade: 'null-or-harm', source: 'Klein et al., JAMA 2011' },
    },
    harm: {
      what: 'Haemorrhage and haemorrhagic stroke; an all-cause mortality signal; increased prostate cancer.',
      at: '50 mg/day for six years raised haemorrhagic stroke in one trial; 400 IU alternate-day for eight years in another.',
      source: 'NIH ODS vitamin E fact sheet; Klein et al., JAMA 2011',
    },
    marker: {
      baseline: 'Serum alpha-tocopherol, lipid-adjusted',
      limitation: 'It travels in lipoproteins, so an unadjusted value tracks the citizen\'s cholesterol rather than their vitamin E.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'no guideline recommends monitoring vitamin E at nutritional intakes',
      insteadWatch: 'The dose on the label, and whether a standalone vitamin E product has been added on top of a multivitamin.',
    },
  },
  {
    id: 'vitamin-k',
    name: 'Vitamin K',
    aliases: ['vitamin k', 'vitamin k1', 'vitamin k2', 'phylloquinone', 'phytonadione', 'menaquinone', 'mk-7', 'mk7'],
    unit: 'mcg',
    role: 'Cofactor for gamma-carboxylation of the Gla proteins — the clotting factors, osteocalcin in bone, and matrix Gla protein in the vessel wall.',
    deficiency: 'Impaired coagulation. Rare outside malabsorption and the newborn period.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'Shares vitamin E\'s three-page chapter in ICMR-NIN 2020 and appears in no Indian RDA table.',
    fallback: foreign(120, 'mcg', 'AI', FNB, 2001, 'An adequate intake, not a recommended allowance — a weaker construct, set because the data would not support an EAR. Men 120 mcg, women 90 mcg. American.'),
    ul: null,
    ulAbsentBecause: 'The FNB set none, citing low toxicity potential. The real vitamin K hazard is not a ceiling at all — it is warfarin.',
    forms: [
      { form: 'K1, phylloquinone', note: 'The dietary form, from green leaves.' },
      { form: 'K2 MK-7, menaquinone-7', note: 'The one sold at a premium for bone. Three years at 375 mcg in women who actually had osteopenia was null at every site, despite successfully carboxylating osteocalcin.' },
    ],
    answers: {
      deficient: { verdict: 'Correcting a coagulation defect is a clinical matter.', grade: 'strong', source: 'NIH ODS vitamin K fact sheet' },
      insufficient: { verdict: 'Nutritional amounts are unobjectionable. Consistency of intake matters more than quantity for anybody anticoagulated.', grade: 'moderate', source: 'NIH ODS vitamin K fact sheet' },
      replete: { verdict: 'A biomarker moving is not an outcome moving. Do not pay a premium for the "+K2" upsell.', grade: 'emerging', source: 'Rønn et al., Osteoporos Int 2020' },
    },
    harm: {
      what: 'Direct antagonism of warfarin and acenocoumarol. This is a hard interaction, not a caution.',
      at: 'Even 10–20 mcg of MK-7 can destabilise anticoagulation.',
      source: 'Linus Pauling Institute micronutrient information centre',
    },
    marker: {
      baseline: null,
      limitation: 'Only impaired coagulation is used as a clinical measure. Plasma phylloquinone reflects the last meal; PIVKA-II and undercarboxylated osteocalcin are research assays with no clinical reference standard.',
      monitor: 'medical',
      retestWeeks: null,
      retestSource: 'no consumer-level vitamin K test exists',
      insteadWatch: 'Whether the citizen takes warfarin. If they do, INR is the test and it belongs to their anticoagulation clinic.',
    },
  },
  {
    id: 'vitamin-c',
    name: 'Vitamin C',
    aliases: ['vitamin c', 'ascorbic acid', 'ascorbate', 'sodium ascorbate'],
    unit: 'mg',
    role: 'Cofactor for collagen hydroxylases and for carnitine and catecholamine synthesis; reduces dietary non-haem iron to the absorbable ferrous form.',
    deficiency: 'Scurvy — perifollicular haemorrhage, bleeding gums, poor wound healing.',
    rdaMale: icmr(80, 'mg'),
    rdaFemale: icmr(65, 'mg'),
    ul: fnbUl(2000, 'mg', 2000, 'total', 'Food and supplements together.'),
    forms: [{ form: 'Ascorbic acid', note: 'There is nothing to improve on. Absorption is 70–90% at 30–180 mg a day and falls below 50% above a gram — the body is the rate limiter, not the salt.' }],
    answers: {
      deficient: { verdict: 'Scurvy resolves. Settled since 1747.', grade: 'strong', source: 'NIH ODS vitamin C fact sheet' },
      insufficient: { verdict: 'Nutritional amounts close a real gap in a diet without fruit.', grade: 'moderate', source: 'NIH ODS vitamin C fact sheet' },
      replete: { verdict: 'Regular vitamin C did not reduce cold incidence in the general population across 29 comparisons and 11,306 participants. Tissues saturate around 100 mg a day and plasma plateaus regardless of dose — a gram is mostly an expensive urine additive.', grade: 'null-or-harm', source: 'Hemilä & Chalker, Cochrane CD000980' },
    },
    harm: {
      what: 'Osmotic diarrhoea, and oxalate kidney stones in susceptible people. It also increases iron absorption, which is a hazard in haemochromatosis.',
      at: 'Above about 2 g/day.',
      source: 'NIH ODS vitamin C fact sheet',
    },
    marker: {
      baseline: 'Plasma ascorbate',
      limitation: 'Reflects recent intake and saturates, so it is a poor reflection of tissue stores except at frank scurvy levels.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'no guideline supports routine plasma ascorbate testing',
      insteadWatch: 'Fruit and vegetable intake, and the total dose across every product being taken.',
    },
  },

  /* ── THE B VITAMINS ───────────────────────────────────────────────────────
     Where India's numbers diverge from America's most sharply, and where the
     Indian market's dose exceedances are almost entirely concentrated. Every
     product in `formulations.ts` that breaks the one-RDA ceiling breaks it on
     a B vitamin. */

  {
    id: 'vitamin-b1',
    name: 'Thiamine (B1)',
    aliases: ['b1', 'thiamine', 'thiamin', 'vitamin b1', 'thiamine mononitrate', 'thiamine hydrochloride'],
    unit: 'mg',
    role: 'Cofactor for pyruvate dehydrogenase and transketolase — the entry point of carbohydrate into aerobic metabolism.',
    deficiency: 'Beriberi; Wernicke encephalopathy in alcohol dependence, which is a medical emergency and not a supplement question.',
    rdaMale: icmr(1.8, 'mg', 'RDA', 'ICMR scales thiamine with energy expenditure, so sedentary, moderate and heavy activity carry different figures. This is the moderate column; the full report would be needed to separate them.'),
    rdaFemale: icmr(1.7, 'mg'),
    ul: null,
    ulAbsentBecause: 'The FNB set none — excess is excreted in urine.',
    forms: [{ form: 'Thiamine mononitrate or hydrochloride', note: 'Interchangeable at these doses.' }],
    answers: {
      deficient: { verdict: 'Correction is rapid and unambiguous.', grade: 'strong', source: 'NIH ODS thiamin fact sheet' },
      insufficient: { verdict: 'A nutritional amount closes a polished-rice-diet gap.', grade: 'moderate', source: 'NIH ODS thiamin fact sheet' },
      replete: { verdict: 'No benefit from more. The "2x energy" claim on a high-dose B-complex is a claim about a cofactor, not about a person who already has enough of it.', grade: 'null-or-harm', source: 'NIH ODS thiamin fact sheet' },
    },
    marker: {
      baseline: 'Erythrocyte transketolase activation coefficient',
      limitation: 'A specialist assay, not a routine one, and not offered by consumer laboratories.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'no consumer-level thiamine status test is available',
      insteadWatch: 'Dietary adequacy and alcohol intake.',
    },
  },
  {
    id: 'vitamin-b2',
    name: 'Riboflavin (B2)',
    aliases: ['b2', 'riboflavin', 'vitamin b2'],
    unit: 'mg',
    role: 'Precursor of FAD and FMN, the flavin cofactors of the respiratory chain and of glutathione reductase.',
    deficiency: 'Angular stomatitis, cheilosis, glossitis.',
    rdaMale: icmr(2.5, 'mg', 'RDA', 'Roughly double the American figure of 1.3 mg. Any "% of RDA" shown to an Indian looks very different from the same product\'s American label.'),
    rdaFemale: icmr(2.4, 'mg'),
    ul: null,
    ulAbsentBecause: 'The FNB set none, citing limited gastrointestinal absorption.',
    forms: [{ form: 'Riboflavin or riboflavin 5\'-phosphate', note: 'Both permitted in India. It is what turns urine bright yellow, which is not a sign of anything except riboflavin.' }],
    answers: {
      deficient: { verdict: 'Correction is straightforward.', grade: 'strong', source: 'NIH ODS riboflavin fact sheet' },
      insufficient: { verdict: 'Nutritional amounts are reasonable, and India\'s requirement is high enough that a marginal intake is common.', grade: 'moderate', source: 'NIH ODS riboflavin fact sheet' },
      replete: { verdict: 'No benefit from more.', grade: 'null-or-harm', source: 'NIH ODS riboflavin fact sheet' },
    },
    marker: {
      baseline: 'Erythrocyte glutathione reductase activity coefficient',
      limitation: 'Research assay. Not available to a consumer.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'no consumer-level riboflavin status test is available',
      insteadWatch: 'Dietary adequacy — milk, curd and eggs are the Indian sources.',
    },
  },
  {
    id: 'vitamin-b3',
    name: 'Niacin (B3)',
    aliases: ['b3', 'niacin', 'niacinamide', 'nicotinamide', 'nicotinic acid', 'vitamin b3'],
    unit: 'mg',
    role: 'Precursor of NAD and NADP, the electron carriers of essentially all oxidative metabolism.',
    deficiency: 'Pellagra — dermatitis, diarrhoea, dementia. Historically a maize-diet disease.',
    rdaMale: icmr(18, 'mg'),
    rdaFemale: icmr(14, 'mg'),
    ul: fnbUl(35, 'mg', 1998, 'supplemental-niacin',
      'Supplemental niacin only. Niacin from food does not count against it — which is why a mixed diet plus a multivitamin is not the arithmetic it looks like.'),
    forms: [
      { form: 'Niacinamide / nicotinamide', note: 'What multivitamins contain. Does not flush.' },
      { form: 'Nicotinic acid', note: 'Flushes at 30–50 mg, and is the form used at gram doses as a lipid drug — a different product with a different risk profile.' },
    ],
    answers: {
      deficient: { verdict: 'Pellagra resolves.', grade: 'strong', source: 'NIH ODS niacin fact sheet' },
      insufficient: { verdict: 'Nutritional amounts are fine.', grade: 'moderate', source: 'NIH ODS niacin fact sheet' },
      replete: { verdict: 'No benefit. And a 100 mg niacinamide in a B-complex is nearly three times the supplemental ceiling — sold, in India, as an energy tonic.', grade: 'null-or-harm', source: 'NIH ODS niacin fact sheet' },
    },
    harm: {
      what: 'Flushing — face, arms and chest reddening with burning and itch. At sustained gram doses, raised liver enzymes, hepatic dysfunction and acute liver failure.',
      at: 'Flushing from 30–50 mg of nicotinic acid. Hepatotoxicity at 1,000–3,000 mg/day over months, with extended-release forms at higher risk.',
      source: 'NIH ODS niacin fact sheet (2022)',
    },
    marker: {
      baseline: null,
      limitation: 'Functional biochemical markers for niacin are not routinely available.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'no usable individual niacin status marker exists',
      insteadWatch: 'The supplemental total against 35 mg, and flushing as a symptom.',
    },
  },
  {
    id: 'vitamin-b5',
    name: 'Pantothenic acid (B5)',
    aliases: ['b5', 'pantothenic', 'pantothenate', 'calcium pantothenate', 'panthenol'],
    unit: 'mg',
    role: 'Backbone of coenzyme A and of the acyl-carrier protein — every acyl transfer in metabolism runs through it.',
    deficiency: 'Effectively unknown outside experimental depletion.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'ICMR-NIN 2020 gives pantothenic acid a single narrative page and no RDA table row.',
    fallback: foreign(5, 'mg', 'AI', FNB, 1998, 'An American adequate intake. India publishes nothing.'),
    ul: null,
    ulAbsentBecause: 'No reports of human toxicity.',
    forms: [{ form: 'Calcium D-pantothenate', note: 'The universal supplement form.' }],
    answers: {
      deficient: { verdict: 'A state that barely occurs.', grade: 'moderate', source: 'NIH ODS pantothenic acid fact sheet' },
      insufficient: { verdict: 'Nutritional amounts are harmless and largely beside the point.', grade: 'moderate', source: 'NIH ODS pantothenic acid fact sheet' },
      replete: { verdict: 'No benefit. It is in the tablet because a multivitamin is expected to have it.', grade: 'null-or-harm', source: 'NIH ODS pantothenic acid fact sheet' },
    },
    marker: {
      baseline: null,
      limitation: 'No clinically used status marker.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'not a testable question',
      insteadWatch: 'Nothing. This nutrient does not warrant attention in a free-living adult.',
    },
  },
  {
    id: 'vitamin-b6',
    name: 'Pyridoxine (B6)',
    aliases: ['b6', 'pyridoxine', 'pyridoxal', 'vitamin b6', 'pyridoxine hydrochloride'],
    unit: 'mg',
    role: 'Pyridoxal 5\'-phosphate is the cofactor for over a hundred enzymes, most of them in amino-acid metabolism, plus haem synthesis and homocysteine transsulfuration.',
    deficiency: 'Seborrhoeic dermatitis, glossitis, peripheral neuropathy, microcytic anaemia. Isoniazid causes it.',
    rdaMale: icmr(2.4, 'mg'),
    rdaFemale: icmr(1.9, 'mg'),
    ul: {
      value: 100, unit: 'mg', basis: 'UL', scope: 'total',
      scopeNote: 'Food and supplements together — B6 is the one B vitamin whose ceiling explicitly includes dietary intake.',
      provenance: {
        authority: 'ICMR-NIN 2020, "100 mg/day of pyridoxine has been adopted as the TUL for adults"',
        year: 2020, origin: 'india',
        note: 'The ONLY upper limit in this entire file that India actually publishes and that could be quoted verbatim. The FNB independently sets the same 100 mg. EFSA, however, sets 12 mg — a more than eightfold stricter position, on the same neuropathy evidence.',
      },
    },
    forms: [{ form: 'Pyridoxine hydrochloride', note: 'What every Indian product uses. P5P is sold at a premium without a head-to-head trial to justify it.' }],
    answers: {
      deficient: { verdict: 'Correction is clear, and isoniazid-induced deficiency is routinely prevented this way.', grade: 'strong', source: 'NIH ODS vitamin B6 fact sheet' },
      insufficient: { verdict: 'Nutritional amounts are reasonable.', grade: 'moderate', source: 'NIH ODS vitamin B6 fact sheet' },
      replete: { verdict: 'No benefit — and B6 is the B vitamin with a real neurological ceiling, which makes the high-dose neurotropic B-complex marketed for tingling and numbness an uncomfortable product to look at closely.', grade: 'null-or-harm', source: 'NIH ODS vitamin B6 fact sheet' },
    },
    harm: {
      what: 'Severe progressive sensory neuropathy with ataxia. Dose-dependent, and usually reversible if caught and stopped.',
      at: '1–6 g/day for 12–40 months in the classical reports. EFSA\'s 12 mg ceiling reflects a view that the margin below that is thinner than the FNB assumed.',
      source: 'NIH ODS vitamin B6 fact sheet (FNB 1998); EFSA 2023',
    },
    marker: {
      baseline: 'Plasma pyridoxal 5\'-phosphate',
      limitation: 'Falls with inflammation independently of intake, and is not offered routinely by consumer laboratories.',
      monitor: 'consider',
      retestWeeks: null,
      retestSource: 'no guideline supports routine B6 monitoring at nutritional doses',
      insteadWatch: 'The total dose against 100 mg, and new numbness or tingling in anybody on a high-dose B-complex — which is the symptom the product claims to treat.',
    },
  },
  {
    id: 'biotin',
    name: 'Biotin (B7)',
    aliases: ['b7', 'biotin', 'd-biotin', 'vitamin b7', 'vitamin h'],
    unit: 'mcg',
    role: 'Carboxylase cofactor in gluconeogenesis, fatty-acid synthesis and amino-acid catabolism.',
    deficiency: 'Rare. Alopecia and a scaly periorificial dermatitis; raw-egg-white avidin and biotinidase deficiency are the classical causes.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'ICMR-NIN 2020 gives biotin a single narrative page and no RDA table row.',
    fallback: foreign(30, 'mcg', 'AI', FNB, 1998, 'An American adequate intake. India publishes nothing.'),
    ul: null,
    ulAbsentBecause: 'No evidence of toxicity — which is exactly why hair and nail products contain two hundred times the adequate intake without anybody objecting.',
    forms: [{ form: 'D-biotin', note: 'The only form used.' }],
    answers: {
      deficient: { verdict: 'Correction works, in the rare genuine cases.', grade: 'strong', source: 'NIH ODS biotin fact sheet' },
      insufficient: { verdict: 'The 25–40 mcg in a multivitamin is a nutritional amount and is unobjectionable.', grade: 'moderate', source: 'NIH ODS biotin fact sheet' },
      replete: { verdict: 'No evidence that high-dose biotin improves hair or nails in people who are not deficient — and 5,000 to 10,000 mcg is what hair supplements actually contain.', grade: 'null-or-harm', source: 'NIH ODS biotin fact sheet' },
    },
    harm: {
      what: 'Not toxicity — ASSAY INTERFERENCE, and it is the single most under-known hazard in consumer supplement testing. High-dose biotin corrupts the streptavidin-biotin immunoassays used for 25(OH)D, B12, folate, ferritin, TSH, free T4, PTH, troponin and more. Sandwich assays read falsely LOW, competitive assays falsely HIGH — so one blood draw can make B12 look high and ferritin look low at the same time.',
      at: 'Interference begins at supplemental doses of 5 mg. Washout is at least 8 hours after 5–10 mg, and at least 72 hours after regimens of 100 mg or more.',
      source: 'ADLM/AACC guidance on biotin interference; FDA safety communication',
    },
    marker: {
      baseline: null,
      limitation: 'No validated status marker in routine use — and, decisively, biotin destroys the validity of the tests used to monitor everything else.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'not a testable question',
      insteadWatch: 'Whether a hair or nail supplement is being taken before ANY blood test is booked. That is an interlock, not a footnote.',
    },
  },
  {
    id: 'folate',
    name: 'Folate (B9)',
    aliases: ['b9', 'folate', 'folic acid', 'vitamin b9', 'dietary folate', 'methylfolate'],
    unit: 'mcg DFE',
    role: 'One-carbon transfer for thymidylate and purine synthesis, and for remethylating homocysteine to methionine.',
    deficiency: 'Megaloblastic anaemia; in early pregnancy, neural tube defects.',
    rdaMale: icmr(300, 'mcg DFE'),
    rdaFemale: icmr(220, 'mcg DFE', 'RDA', 'LOWER than the American 400 mcg, and this is the most dangerous divergence in the file. See periconceptionalOverride — a woman at 100% of this figure is not thereby protected against neural tube defects.'),
    ul: fnbUl(1000, 'mcg', 1998, 'synthetic-folic-acid',
      'Synthetic folic acid from fortified food and supplements only. The FNB expressly set NO limit on folate from food, and the requirement is in µg DFE while this ceiling is in µg of folic acid — two different quantities that must never be added together.'),
    periconceptionalOverride: {
      text: '400 mcg of folic acid daily for any woman who might become pregnant, from before conception through the first trimester. This is not a percentage of the ICMR requirement and cannot be derived from one: the neural tube closes before most pregnancies are recognised, so the intake has to already be in place. A screen that tells an Indian woman she is at "100% of RDA" on 220 mcg has told her something true and let her believe something false.',
      source: 'WHO 2015 guidance; CDC recommendation',
    },
    forms: [
      { form: 'Folic acid', note: 'The synthetic form, and the one every trial of neural-tube prevention used. More bioavailable than food folate, which is why the DFE unit exists.' },
      { form: '5-methyltetrahydrofolate', note: 'Permitted in India as a glucosamine salt. Sold on MTHFR-variant marketing without an outcome trial behind it.' },
    ],
    answers: {
      deficient: { verdict: 'Correction works — but never before B12 has been checked. Folate fixes the anaemia while the neurological damage continues.', grade: 'strong', source: 'BSH 2014 guideline' },
      insufficient: { verdict: 'A nutritional amount is reasonable, and periconceptionally the higher figure is not optional.', grade: 'strong', source: 'WHO 2015' },
      replete: { verdict: 'No benefit, and a real signal against it. 800 mcg/day was associated with 21% more cancer incidence and 38% more cancer mortality in one Norwegian trial, and a 2018 meta-analysis of six trials in 25,738 men found 24% more prostate cancer.', grade: 'null-or-harm', source: 'NIH ODS folate fact sheet' },
    },
    harm: {
      what: 'Masks B12-deficiency anaemia while subacute combined degeneration of the cord progresses. Unmetabolised folic acid, and a cancer signal at supplemental doses.',
      at: 'Masking is the concern at 1 mg/day and above — which is what several Indian B-complex products contain.',
      source: 'NIH ODS folate fact sheet',
    },
    marker: {
      baseline: 'Serum folate',
      alongside: 'B12, always, and before any folate is given for a macrocytic anaemia.',
      limitation: 'Serum folate rises within hours of a dose, so testing after supplementation has started measures the supplement rather than the person. Red-cell folate reflects a rolling four-month average but its assays agree poorly between laboratories.',
      monitor: 'consider',
      retestWeeks: [8, 16],
      retestSource: 'WHO 2015 for the preconception red-cell folate threshold; BSH 2014 declines to specify a repletion interval',
      why: 'Folate enters the red cell only during erythropoiesis and is then trapped for the cell\'s 120-day life. A red-cell folate drawn before eight weeks is measuring the old cell population and is money spent on nothing.',
    },
  },
  {
    id: 'vitamin-b12',
    name: 'Vitamin B12',
    aliases: ['b12', 'cobalamin', 'cyanocobalamin', 'methylcobalamin', 'hydroxocobalamin', 'vitamin b12'],
    unit: 'mcg',
    role: 'Cofactor for exactly two human enzymes — methionine synthase and methylmalonyl-CoA mutase. Which is why homocysteine and methylmalonic acid are the functional markers.',
    deficiency: 'Megaloblastic anaemia and a subacute combined degeneration of the cord that becomes irreversible if treatment is delayed past about six months.',
    rdaMale: icmr(2.2, 'mcg', 'RDA', 'The printed ICMR row is ambiguous between 2.2 and 2.5 in the free summary; 2.2 is the probable value and the full report would settle it. Either way the figure is small, which is what makes a 500 mcg tablet remarkable.'),
    rdaFemale: icmr(2.2, 'mcg'),
    ul: null,
    ulAbsentBecause: 'The FNB set none, citing low toxicity potential. Absorption is the limiter: about half of a 1–2 mcg dose is absorbed and only 1.3% of a 1,000 mcg one.',
    forms: [
      { form: 'Cyanocobalamin', note: 'Works, costs a fraction. NIH ODS: "no evidence indicates that absorption rates of vitamin B12 in supplements vary by form of the vitamin."' },
      { form: 'Methylcobalamin', note: 'A price premium without a bioavailability case. It is also not on India\'s permitted-forms schedule for a health supplement, so a product containing it is arguably not a food at all.' },
    ],
    answers: {
      deficient: { verdict: 'Correction is not in dispute, and oral 1,000–2,000 mcg normalises status comparably to intramuscular injection — the 1% passive diffusion is why high oral doses work even in malabsorption.', grade: 'strong', source: 'Cochrane 2018; BSH 2014' },
      insufficient: { verdict: 'The most India-specific case on this page: B12 exists naturally only in animal foods, 39% of Indians are vegetarian, and pooled Indian deficiency runs at 53%.', grade: 'strong', source: 'DABS-India, Eur J Clin Nutr 2024' },
      replete: { verdict: 'No benefit from more in somebody with adequate status. A high level on treatment is expected and is not a finding.', grade: 'null-or-harm', source: 'NIH ODS vitamin B12 fact sheet' },
    },
    marker: {
      baseline: 'Serum B12',
      alongside: 'Methylmalonic acid or homocysteine where the serum value is equivocal and the answer matters.',
      limitation: 'A blunt test. Roughly 22–30% of results below 200 ng/L are falsely low, and clinical deficiency is present in 2.9–5.2% of people above 200. About 80% of circulating B12 is bound to haptocorrin and never reaches tissue, so the assay measures a pool that is largely unavailable — and it fails hardest in pernicious anaemia, the diagnosis it most needs to catch.',
      monitor: 'consider',
      retestWeeks: null,
      retestSource: 'BSH 2014: "no further testing for cobalamin levels is required" once treatment has started. NICE NG239 (2024) found NO clinical studies on follow-up frequency and advises against routine retesting on oral treatment, because the level is falsely elevated by the dose.',
      insteadWatch: 'The response, not the number: reticulocytes by 7–10 days, a normal blood count and MCV by eight weeks, and symptoms. A test that cannot come back "no" is not a test.',
      why: 'Retesting B12 after starting B12 measures the tablet. On injections it measures the injection.',
    },
  },

  /* ── THE MINERALS ─────────────────────────────────────────────────────────
     Where the upper limits actually bite, where the "no useful individual
     blood marker" verdict falls hardest, and where the two most consequential
     Indian divergences live: a woman's iron requirement of 29 mg against
     America's 18, and a man's magnesium requirement of 440 mg against a
     ceiling of 350 that is not a ceiling on the same thing. */

  {
    id: 'calcium',
    name: 'Calcium',
    aliases: ['calcium', 'calcium carbonate', 'calcium citrate', 'calcium phosphate'],
    unit: 'mg',
    role: 'Bone mineral, and the intracellular signal for muscle contraction, neurotransmitter release and clotting.',
    deficiency: 'Long-term inadequacy costs bone. Serum calcium says nothing about it — the skeleton is buffered against dietary shortfall for decades.',
    rdaMale: icmr(1000, 'mg'),
    rdaFemale: icmr(1000, 'mg'),
    ul: fnbUl(2500, 'mg', 2010, 'total',
      'Food and supplements together; 2,000 mg from age 51. Set on kidney-stone risk.',
      'The Women\'s Health Initiative found a 17% rise in stone risk at around 2,100 mg total intake.'),
    forms: [
      { form: 'Calcium citrate', note: 'Absorbed without stomach acid, so the right one on a proton-pump inhibitor.' },
      { form: 'Calcium carbonate', note: 'Cheapest and densest; needs acid, so take it with food. What almost every Indian multivitamin uses.' },
    ],
    answers: {
      deficient: { verdict: 'Correction matters for bone, alongside vitamin D and protein.', grade: 'strong', source: 'NIH ODS calcium fact sheet' },
      insufficient: { verdict: 'Food first. The 100–400 mg inside a multivitamin is a fraction of the requirement and will not carry a deficient diet.', grade: 'moderate', source: 'NIH ODS calcium fact sheet' },
      replete: { verdict: 'No benefit, and a signal against. A fourteen-RCT meta-analysis in postmenopausal women found 15% more cardiovascular disease and 16% more coronary heart disease on supplemental calcium.', grade: 'null-or-harm', source: 'NIH ODS calcium fact sheet' },
    },
    harm: {
      what: 'Hypercalcaemia, kidney stones, and a cardiovascular signal on supplements specifically rather than on dietary calcium.',
      at: 'Stone risk from about 1,000 mg/day supplemental. Hypercalcaemia risk is a clinical matter in chronic kidney disease, hyperparathyroidism and on thiazides.',
      source: 'NIH ODS calcium fact sheet',
    },
    marker: {
      baseline: 'Serum calcium — but as a SAFETY test, never a status test.',
      limitation: 'Tightly parathyroid-regulated. A normal serum calcium tells you nothing about whether the diet contains enough; a raised one tells you to stop and investigate.',
      monitor: 'medical',
      retestWeeks: null,
      retestSource: 'IOM/NASEM does not recommend routine monitoring at nutritional doses',
      insteadWatch: 'Dietary calcium, and adjusted calcium one month after any vitamin D loading course. Bone density is the status measure and its minimum meaningful repeat interval is about two years.',
    },
  },
  {
    id: 'iron',
    name: 'Iron',
    aliases: ['iron', 'ferrous', 'ferrous fumarate', 'ferrous sulphate', 'ferrous sulfate', 'carbonyl iron', 'ferrous ascorbate', 'elemental iron'],
    unit: 'mg',
    role: 'Haemoglobin and myoglobin oxygen carriage, and the iron-sulphur clusters of the respiratory chain.',
    deficiency: 'Iron-deficiency anaemia, and a fatigue that appears before the anaemia does. Ferritin is the store marker.',
    rdaMale: icmr(19, 'mg'),
    rdaFemale: icmr(29, 'mg', 'RDA', 'Against America\'s 18 mg — 61% higher, and the tightest requirement-to-ceiling gap of any nutrient here. An Indian woman at her RDA has only 16 mg of headroom before the limit, which a single therapeutic tablet clears in one go.'),
    ul: fnbUl(45, 'mg', 2001, 'total',
      'Food and supplements together.',
      'EFSA (2024) declined to set a limit at all and published a "safe level" of 40 mg instead.'),
    forms: [
      { form: 'Ferrous salts — fumarate, sulphate, ascorbate', note: 'Well absorbed, and the cause of the constipation people stop over.' },
      { form: 'Alternate-day morning dosing', note: 'A single dose raises hepcidin for about 24 hours and suppresses the next day\'s absorption. Alternate-day dosing absorbs 40–50% better per dose and is far better tolerated — one trial reported 9% adverse events against 45%. It does NOT correct anaemia faster; the outcome trials show equivalence, not superiority.' },
    ],
    answers: {
      deficient: { verdict: 'Correction works and matters. Reticulocytes at 7–10 days, haemoglobin rising 0.7–1.0 g/dL a week, normal by six to eight weeks.', grade: 'strong', source: 'BSG 2021' },
      insufficient: { verdict: 'Non-anaemic iron deficiency with ferritin below 50 does respond — fatigue fell 47.7% against 28.8% on placebo, with haemoglobin barely moving, so the benefit is not anaemia correction.', grade: 'moderate', source: 'Vaucher et al., CMAJ 2012' },
      replete: { verdict: 'The supplement with the clearest harm profile given to somebody who does not need it. Iron deficiency explains under a third of Indian anaemia; the rest is B12, folate, haemoglobinopathy and inflammation, and iron will cause constipation while missing the diagnosis.', grade: 'null-or-harm', source: 'DABS-India, Eur J Clin Nutr 2024' },
    },
    harm: {
      what: 'Gastric upset, constipation, gastritis. In overload: cirrhosis, hepatocellular carcinoma, cardiac and pancreatic damage. Acute paediatric overdose is lethal.',
      at: 'Forty-three American child deaths between 1983 and 2000. Around 60 mg/kg causes multi-organ failure in an adult.',
      source: 'NIH ODS iron fact sheet (2025)',
    },
    marker: {
      baseline: 'Ferritin',
      alongside: 'CRP always — ferritin is a positive acute-phase reactant and reads falsely normal in an inflamed, genuinely deficient person. WHO says to measure CRP and AGP alongside it. Transferrin saturation is the fallback when a false-normal is suspected.',
      limitation: 'Haemoglobin is a late marker and falls only after stores are gone, so a normal haemoglobin does not exclude iron deficiency. Biotin at 5 mg falsely LOWERS ferritin.',
      monitor: 'retest',
      retestWeeks: [4, 8],
      retestSource: 'BSG 2021 — haemoglobin in the first four weeks, continue about three months past normalisation, then a blood count every six months initially',
      why: 'Total body iron is 3–4 g and oral absorption caps near 10–25 mg a day even under maximum deficiency drive, so refilling a gram of stores takes months. The "continue three months after haemoglobin normalises" rule is an absorption-rate constraint, not a convention. This is the only nutrient in this file with a complete guideline-specified monitoring schedule, and it should not be generalised to the ones that lack it.',
    },
  },
  {
    id: 'zinc',
    name: 'Zinc',
    aliases: ['zinc', 'zinc oxide', 'zinc sulphate', 'zinc sulfate', 'zinc gluconate', 'zinc picolinate'],
    unit: 'mg',
    role: 'Structural and catalytic cofactor in several hundred enzymes and in every zinc-finger transcription factor.',
    deficiency: 'Growth failure, impaired immunity, delayed wound healing, taste disturbance. High-phytate cereal diets are the Indian risk factor.',
    rdaMale: icmr(17, 'mg', 'RDA', 'Against America\'s 11 mg. An Indian man meeting his own RDA plus a common 15 mg supplement is already at EFSA\'s entire ceiling of 25 mg.'),
    rdaFemale: icmr(13, 'mg'),
    ul: fnbUl(40, 'mg', 2001, 'total',
      'Food and supplements together.',
      'EFSA sets 25 mg. The 40 mg figure exists because roughly 60 mg/day for ten weeks measurably reduced copper-dependent enzyme activity.'),
    forms: [
      { form: 'Zinc sulphate, gluconate, picolinate', note: 'All adequately absorbed.' },
      { form: 'Zinc oxide', note: 'The cheapest and least bioavailable common salt, and what a large share of Indian multivitamins contain. Worth naming when a label declares it.' },
    ],
    answers: {
      deficient: { verdict: 'Correction works, and matters most in childhood diarrhoea and in high-phytate diets.', grade: 'strong', source: 'NIH ODS zinc fact sheet' },
      insufficient: { verdict: 'A nutritional dose is defensible in a vegetarian, high-phytate Indian diet.', grade: 'moderate', source: 'NIH ODS zinc fact sheet' },
      replete: { verdict: 'No benefit, and sustained high doses cause copper deficiency — anaemia, neutropenia and a myelopathy that is often irreversible.', grade: 'null-or-harm', source: 'NIH ODS zinc and copper fact sheets' },
    },
    harm: {
      what: 'Copper deficiency, immune suppression, lowered HDL, nausea. Intranasal zinc has caused permanent loss of smell.',
      at: 'From about 50–60 mg/day sustained over weeks.',
      source: 'NIH ODS zinc fact sheet',
    },
    marker: {
      baseline: null,
      limitation: 'Serum zinc is a population statistic, not an individual one. It is homeostatically defended, swings about 9% between morning and afternoon, falls with inflammation, low albumin, pregnancy and oestrogen — and, decisively, it RISES rapidly on supplementation regardless of whether the person was deficient. A retest that cannot come back "no" is not a test.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'IZiNCG/BOND: serum zinc "not a reliable indicator of zinc status" for an individual',
      insteadWatch: 'Dietary adequacy, phytate load, and the total dose against 40 mg — with copper in mind for anybody above it long-term.',
    },
  },
  {
    id: 'magnesium',
    name: 'Magnesium',
    aliases: ['magnesium', 'magnesium oxide', 'magnesium citrate', 'magnesium glycinate', 'magnesium sulphate'],
    unit: 'mg',
    role: 'Cofactor in over three hundred enzyme systems, and Mg-ATP is the biologically active form of ATP itself.',
    deficiency: 'Neuromuscular irritability, arrhythmia, and a hypokalaemia or hypocalcaemia that will not correct until the magnesium does.',
    rdaMale: icmr(440, 'mg', 'RDA', 'THIS FIGURE IS ABOVE THE UPPER LIMIT BELOW, AND THAT IS NOT AN ERROR. The 350 mg ceiling applies to supplements and medicines only; food magnesium is excluded entirely. An Indian man eating to his requirement is at 126% of the "limit" and is perfectly fine. This is the clearest demonstration in the file of why UlScope exists.'),
    rdaFemale: icmr(370, 'mg'),
    ul: fnbUl(350, 'mg', 1997, 'supplemental',
      'SUPPLEMENTS AND MEDICINES ONLY. Magnesium occurring naturally in food and drink does not count against it — clinicians get this wrong routinely.',
      'EFSA sets 250 mg on the same supplemental basis.'),
    forms: [
      { form: 'Magnesium citrate', note: 'The best-documented absorption in the one good randomised head-to-head. Mildly laxative.' },
      { form: 'Magnesium glycinate', note: 'Better gut tolerance, which is a real advantage — just not the absorption advantage printed on the box.' },
      { form: 'Magnesium oxide', note: 'A cheap laxative and a multivitamin filler, performing about as well as placebo on plasma magnesium. Several popular Indian products are oxide.' },
    ],
    answers: {
      deficient: { verdict: 'Correction matters and, in renal impairment, belongs with a doctor.', grade: 'strong', source: 'NIH ODS magnesium fact sheet' },
      insufficient: { verdict: 'Blood pressure falls a little — 34 double-blind RCTs at a median 368 mg/day gave systolic −2.0 and diastolic −1.8 mmHg. Consistent, causal-looking, and small.', grade: 'moderate', source: 'Zhang et al., Hypertension 2016' },
      replete: { verdict: 'For sleep the pooled effect is 17 minutes off sleep onset with total sleep time not significantly changed, at low to very low GRADE certainty across 151 participants. Real, tiny, and oversold.', grade: 'emerging', source: 'Mah & Pitre, BMC Complement Med Ther 2021' },
    },
    harm: {
      what: 'Diarrhoea is the dose-limiting effect. Hypermagnesaemia — hypotension, muscle weakness, respiratory difficulty, cardiac arrest — is a real and documented danger in renal impairment.',
      at: 'Diarrhoea near the 350 mg supplemental ceiling. Serious toxicity from laxative and antacid doses above 5,000 mg/day, and at far less in chronic kidney disease.',
      source: 'NIH ODS magnesium fact sheet',
    },
    marker: {
      baseline: 'Serum magnesium — a specific test, an insensitive one.',
      limitation: 'Under 1% of body magnesium is in blood; 53% is in bone. Serum is defended within a narrow band by exchange with that pool, so a LOW result is meaningful and a NORMAL result excludes nothing. Red-cell magnesium is marketed direct to consumers and is not a validated clinical test.',
      monitor: 'consider',
      retestWeeks: null,
      retestSource: 'no body recommends routine magnesium monitoring; testing is indicated by risk factor, not by schedule',
      insteadWatch: 'Symptoms and context — long-term proton-pump inhibitor use, loop or thiazide diuretics, alcohol, chronic diarrhoea, and any potassium or calcium that will not correct.',
    },
  },
  {
    id: 'selenium',
    name: 'Selenium',
    aliases: ['selenium', 'sodium selenite', 'sodium selenate', 'selenomethionine', 'selenious acid'],
    unit: 'mcg',
    role: 'Incorporated as selenocysteine into the glutathione peroxidases, thioredoxin reductases and the deiodinases that activate thyroid hormone.',
    deficiency: 'Keshan cardiomyopathy in severely deficient geographies. Not a common Indian finding.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'ICMR-NIN 2020 has a selenium chapter, but no figure from it could be verified from the free summary. UNKNOWN — the printed report would settle it.',
    fallback: foreign(55, 'mcg', 'RDA', FNB, 2000, 'American. India\'s own figure exists in a chapter this file could not read.'),
    ul: fnbUl(400, 'mcg', 2000, 'total',
      'Food and supplements together.',
      'EFSA sets 255 mcg. Selenium has one of the narrowest windows between requirement and harm of any micronutrient.'),
    forms: [{ form: 'Sodium selenite or selenomethionine', note: 'Both used. The 30–70 mcg in a multivitamin is unremarkable; the hazard is a standalone product stacked on top.' }],
    answers: {
      deficient: { verdict: 'Correction matters in genuinely deficient soil regions.', grade: 'strong', source: 'NIH ODS selenium fact sheet' },
      insufficient: { verdict: 'The multivitamin dose is fine.', grade: 'moderate', source: 'NIH ODS selenium fact sheet' },
      replete: { verdict: 'No benefit, and a narrow margin. Selenoprotein P plateaus at adequacy, which is precisely why it defines the requirement and is useless for titrating a dose above it.', grade: 'null-or-harm', source: 'Xia et al., AJCN 2010' },
    },
    harm: {
      what: 'Selenosis — hair loss, brittle or lost nails, a garlic odour on the breath, metallic taste, rash, nausea, irritability and neurological abnormality.',
      at: 'Chronic high intake. One misformulated American product delivered 200 times its labelled dose and injured 201 people.',
      source: 'NIH ODS selenium fact sheet',
    },
    marker: {
      baseline: null,
      limitation: 'The functional markers plateau at adequacy and stop responding, so they cannot grade a dose above the requirement; plasma selenoproteins also fall with inflammation.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'no routine screening is recommended',
      insteadWatch: 'The intake ceiling. This is a nutrient to monitor by arithmetic, not by blood test.',
    },
  },
  {
    id: 'iodine',
    name: 'Iodine',
    aliases: ['iodine', 'potassium iodide', 'iodide'],
    unit: 'mcg',
    role: 'The element the thyroid hormones are built from. There is no other use for it in the body.',
    deficiency: 'Goitre, hypothyroidism, and in pregnancy irreversible impairment of foetal brain development.',
    rdaMale: icmr(150, 'mcg'),
    rdaFemale: icmr(150, 'mcg'),
    ul: fnbUl(1100, 'mcg', 2001, 'total',
      'Food and supplements together.',
      'EFSA sets 600 mcg. Anybody with autoimmune thyroid disease, or a history of deficiency, is harmed at lower intakes than these figures suggest.'),
    forms: [{ form: 'Potassium iodide', note: 'The universal form, and the one in iodised salt.' }],
    answers: {
      deficient: { verdict: 'Correction prevents goitre and, in pregnancy, protects foetal neurodevelopment. Salt iodisation is one of public health\'s clearest wins.', grade: 'strong', source: 'WHO' },
      insufficient: { verdict: 'The 100–150 mcg in a multivitamin is a reasonable top-up on iodised salt.', grade: 'moderate', source: 'NIH ODS iodine fact sheet' },
      replete: { verdict: 'No benefit, and excess mirrors deficiency — goitre, raised TSH, hypothyroidism, and also iodine-induced hyperthyroidism and thyroiditis. Kelp products are the usual route to trouble.', grade: 'null-or-harm', source: 'NIH ODS iodine fact sheet' },
    },
    harm: {
      what: 'Both hypothyroidism and hyperthyroidism, by opposite mechanisms; thyroiditis; papillary thyroid cancer in some analyses.',
      at: 'Highly variable, and much lower in autoimmune thyroid disease or after prior deficiency.',
      source: 'NIH ODS iodine fact sheet',
    },
    marker: {
      baseline: null,
      limitation: 'Urinary iodine is a POPULATION statistic by construction. Day-to-day variation within one person swamps the between-person signal — about ten repeat collections are needed to place one individual within 20%. A single urinary iodine result must never be reported to a person as their iodine status.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'WHO: spot urine samples "cannot be used to classify individual status"',
      insteadWatch: 'Whether the household salt is iodised, and whether there is known thyroid disease — in which case any iodine supplement is a medical decision.',
    },
  },
  {
    id: 'copper',
    name: 'Copper',
    aliases: ['copper', 'cupric', 'copper gluconate', 'copper sulphate', 'cupric gluconate'],
    unit: 'mcg',
    role: 'Cofactor in cytochrome c oxidase, superoxide dismutase, lysyl oxidase and ceruloplasmin\'s ferroxidase activity.',
    deficiency: 'Anaemia, neutropenia, and a myelopathy resembling subacute combined degeneration that is often irreversible. The two live causes are high-dose zinc and bariatric surgery.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'ICMR-NIN 2020 covers copper in a shared chapter with manganese and chromium; no figure could be verified from the free summary. UNKNOWN.',
    fallback: foreign(900, 'mcg', 'RDA', FNB, 2001, 'American. India\'s own figure was not obtainable.'),
    ul: fnbUl(10000, 'mcg', 2001, 'total', 'Food and supplements together.'),
    forms: [{ form: 'Copper gluconate or sulphate', note: 'The 0.5–2 mg in a multivitamin is a sensible counterweight to its zinc.' }],
    answers: {
      deficient: { verdict: 'Correction works, but the neurological damage may not reverse — which makes prevention the whole game.', grade: 'strong', source: 'NIH ODS copper fact sheet' },
      insufficient: { verdict: 'Multivitamin amounts are appropriate, particularly alongside zinc.', grade: 'moderate', source: 'NIH ODS copper fact sheet' },
      replete: { verdict: 'No benefit from more.', grade: 'null-or-harm', source: 'NIH ODS copper fact sheet' },
    },
    marker: {
      baseline: null,
      limitation: 'NIH ODS states it plainly: "no biomarkers that accurately and reliably assess copper status have been identified." Serum copper and ceruloplasmin are both positive acute-phase reactants, raised by oestrogen, pregnancy, infection and inflammation independently of status, and neither detects marginal deficiency.',
      monitor: 'medical',
      retestWeeks: null,
      retestSource: 'copper status is not routinely assessed in clinical practice',
      insteadWatch: 'The risk rather than the level — long-term zinc above 40 mg, bariatric surgery, malabsorption — and refer when neurological or blood-count signs appear.',
    },
  },
  {
    id: 'manganese',
    name: 'Manganese',
    aliases: ['manganese', 'manganese sulphate', 'manganese chloride'],
    unit: 'mg',
    role: 'Cofactor for manganese superoxide dismutase, arginase and pyruvate carboxylase.',
    deficiency: 'Not described in free-living humans on ordinary diets.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'Shares the copper and chromium chapter in ICMR-NIN 2020; no verifiable figure. UNKNOWN.',
    fallback: foreign(2.3, 'mg', 'AI', FNB, 2001, 'An American adequate intake — men 2.3 mg, women 1.8 mg.'),
    ul: fnbUl(11, 'mg', 2001, 'total', 'Food and supplements together.', 'EFSA declined to set a limit and published a "safe level" of 8 mg instead.'),
    forms: [{ form: 'Manganese sulphate or chloride', note: 'Unremarkable at multivitamin doses.' }],
    answers: {
      deficient: { verdict: 'A state that essentially does not arise from diet.', grade: 'moderate', source: 'NIH ODS manganese fact sheet' },
      insufficient: { verdict: 'Multivitamin amounts are unobjectionable.', grade: 'moderate', source: 'NIH ODS manganese fact sheet' },
      replete: { verdict: 'No benefit. It is in the tablet for completeness.', grade: 'null-or-harm', source: 'NIH ODS manganese fact sheet' },
    },
    marker: {
      baseline: null,
      limitation: 'No validated status biomarker; blood levels reflect recent exposure and sample contamination rather than status.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'not a testable question',
      insteadWatch: 'The total against the ceiling, and nothing else.',
    },
  },
  {
    id: 'chromium',
    name: 'Chromium',
    aliases: ['chromium', 'chromium picolinate', 'chromium chloride', 'chromium trichloride'],
    unit: 'mcg',
    role: 'Proposed to potentiate insulin action — and even that is contested.',
    deficiency: 'No convincing dietary deficiency state has been demonstrated.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'Shares the copper and manganese chapter in ICMR-NIN 2020; no verifiable figure. UNKNOWN.',
    fallback: foreign(35, 'mcg', 'AI', FNB, 2001, 'An American adequate intake. EFSA went further in 2014 and concluded chromium has not been demonstrated to be an essential nutrient at all.'),
    ul: null,
    ulAbsentBecause: 'The FNB set none, for want of data rather than for want of concern.',
    forms: [{ form: 'Chromium picolinate or chloride', note: 'A label reading "chromium 50 mg" is a unit error for 50 mcg — a thousandfold overstatement that appears on at least one Indian product listing and must never be read as written.' }],
    answers: {
      deficient: { verdict: 'A state whose existence is doubtful.', grade: 'emerging', source: 'EFSA 2014' },
      insufficient: { verdict: 'Multivitamin amounts are harmless.', grade: 'emerging', source: 'NIH ODS chromium fact sheet' },
      replete: { verdict: 'The glucose and weight-loss claims are not supported.', grade: 'null-or-harm', source: 'NIH ODS chromium fact sheet' },
    },
    marker: {
      baseline: null,
      limitation: 'No validated status biomarker.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'not a testable question',
      insteadWatch: 'Nothing.',
    },
  },
  {
    id: 'molybdenum',
    name: 'Molybdenum',
    aliases: ['molybdenum', 'sodium molybdate'],
    unit: 'mcg',
    role: 'Cofactor for sulphite oxidase, xanthine oxidase and aldehyde oxidase.',
    deficiency: 'Not described outside a single documented case on long-term parenteral nutrition.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'ICMR-NIN 2020 has no molybdenum chapter at all — not a short one, none.',
    fallback: foreign(45, 'mcg', 'RDA', FNB, 2001, 'American. India publishes nothing whatsoever on this nutrient.'),
    ul: fnbUl(2000, 'mcg', 2001, 'total', 'Food and supplements together.'),
    forms: [{ form: 'Sodium molybdate', note: 'The only form used.' }],
    answers: {
      deficient: { verdict: 'A state that does not arise from diet.', grade: 'moderate', source: 'NIH ODS molybdenum fact sheet' },
      insufficient: { verdict: 'Multivitamin amounts are harmless.', grade: 'moderate', source: 'NIH ODS molybdenum fact sheet' },
      replete: { verdict: 'No benefit. Its presence on a label is a count, not a contribution.', grade: 'null-or-harm', source: 'NIH ODS molybdenum fact sheet' },
    },
    marker: {
      baseline: null,
      limitation: 'No clinical status test.',
      monitor: 'none',
      retestWeeks: null,
      retestSource: 'not a testable question',
      insteadWatch: 'Nothing.',
    },
  },
  {
    id: 'phosphorus',
    name: 'Phosphorus',
    aliases: ['phosphorus', 'phosphate', 'calcium phosphate'],
    unit: 'mg',
    role: 'Bone mineral, the phosphate of ATP, and the backbone of every nucleic acid and membrane phospholipid.',
    deficiency: 'Dietary deficiency is rare; phosphorus is in almost everything.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'Covered inside the calcium chapter of ICMR-NIN 2020; no separate figure could be verified. UNKNOWN.',
    fallback: foreign(700, 'mg', 'RDA', FNB, 1997, 'American. India\'s own figure sits in a chapter this file could not read.'),
    ul: fnbUl(4000, 'mg', 1997, 'total', 'Food and supplements together; 3,000 mg from age 71.'),
    forms: [{ form: 'Calcium phosphate tribasic', note: 'Usually present as the carrier for calcium rather than as a deliberate addition.' }],
    answers: {
      deficient: { verdict: 'A clinical matter, usually in refeeding or malabsorption.', grade: 'strong', source: 'NIH ODS phosphorus fact sheet' },
      insufficient: { verdict: 'Not an ordinary dietary problem.', grade: 'moderate', source: 'NIH ODS phosphorus fact sheet' },
      replete: { verdict: 'No benefit — and phosphate restriction, not supplementation, is the concern in chronic kidney disease.', grade: 'null-or-harm', source: 'NIH ODS phosphorus fact sheet' },
    },
    marker: {
      baseline: 'Serum phosphate',
      limitation: 'A clinical test, read in the context of renal function and parathyroid hormone — not a nutritional status test.',
      monitor: 'medical',
      retestWeeks: null,
      retestSource: 'monitored in chronic kidney disease, not in nutrition',
      insteadWatch: 'Kidney function, if there is any concern about it.',
    },
  },
  {
    id: 'potassium',
    name: 'Potassium',
    aliases: ['potassium', 'potassium chloride'],
    unit: 'mg',
    role: 'The principal intracellular cation; sets the resting membrane potential of every excitable cell.',
    deficiency: 'Hypokalaemia — weakness and arrhythmia. Usually caused by a drug or by losses, not by diet.',
    rdaMale: null,
    rdaFemale: null,
    indiaSilentBecause: 'ICMR-NIN 2020 covers sodium and potassium in a shared chapter; no verifiable figure. UNKNOWN.',
    fallback: foreign(3400, 'mg', 'AI', 'US National Academies (NASEM), via NIH ODS', 2019, 'An American adequate intake — men 3,400 mg, women 2,600 mg.'),
    ul: null,
    ulAbsentBecause: 'NASEM set neither a limit nor a chronic-disease reduction level. The hazard is not dietary excess but impaired excretion.',
    forms: [{ form: 'Potassium chloride', note: 'Present in multivitamins in token milligram amounts — a few thousandths of a daily intake, which is worth saying rather than counting.' }],
    answers: {
      deficient: { verdict: 'A clinical correction, and one that can be dangerous done carelessly.', grade: 'strong', source: 'NIH ODS potassium fact sheet' },
      insufficient: { verdict: 'The answer is fruit and vegetables, not a tablet.', grade: 'moderate', source: 'NIH ODS potassium fact sheet' },
      replete: { verdict: 'No benefit, and a real hazard in anybody whose kidneys cannot excrete it or who takes an ACE inhibitor, an ARB or a potassium-sparing diuretic.', grade: 'null-or-harm', source: 'NIH ODS potassium fact sheet' },
    },
    harm: {
      what: 'Hyperkalaemia — arrhythmia and cardiac arrest, with no reliable warning symptom.',
      at: 'Not from food in a person with normal kidneys. From supplements and salt substitutes in chronic kidney disease or on potassium-retaining medicines.',
      source: 'NIH ODS potassium fact sheet',
    },
    marker: {
      baseline: 'Serum potassium',
      limitation: 'A safety test belonging to whoever manages the citizen\'s kidneys and medicines.',
      monitor: 'medical',
      retestWeeks: null,
      retestSource: 'monitored by prescription context, never by supplement schedule',
      insteadWatch: 'Kidney function and medicines. Never offer this as a nutrition test.',
    },
  },
];

/** Lookup by id. Throws rather than returning undefined — a nutrient the
 *  engine cannot name is a nutrient it must not reason about. */
export const nutrient = (id: string): NutrientFact => {
  const n = NUTRIENTS.find((x) => x.id === id);
  if (!n) throw new Error(`nutrient not in the reference database: ${id}`);
  return n;
};

/**
 * LOOSE MATCH FROM A LABEL'S OWN WORDING.
 *
 * Returns undefined on purpose. An ingredient this file cannot identify is
 * carried through as UNRECOGNISED and counted against nothing — never quietly
 * mapped to the nearest thing with a similar name. "Vitamin B12" and
 * "methylcobalamin" are the same nutrient; "vitamin K1" and "vitamin K2" are
 * two forms of one; "taurine" and "ginseng" are neither, and the honest
 * output for those is a blank rather than a guess.
 */
export const matchNutrient = (label: string): NutrientFact | undefined => {
  const l = label.trim().toLowerCase();
  const exact = NUTRIENTS.find((n) => n.aliases.some((a) => a === l));
  if (exact) return exact;
  /* Longest alias first, so "vitamin b12" is not swallowed by "vitamin b1". */
  let best: { n: NutrientFact; len: number } | undefined;
  for (const n of NUTRIENTS) {
    for (const a of n.aliases) {
      if (l.includes(a) && (!best || a.length > best.len)) best = { n, len: a.length };
    }
  }
  return best?.n;
};

/**
 * THE HARM-CAPABLE LIST, NAMED RATHER THAN DERIVED.
 *
 * Being sold without a prescription is not evidence of safety. These are the
 * nutrients where the distance between a day's dose and a documented injury is
 * short enough to matter, and the engine treats an exceedance on one of them
 * differently from an exceedance on molybdenum.
 */
export const HARM_CAPABLE: readonly string[] = [
  'vitamin-a', 'beta-carotene', 'vitamin-d', 'vitamin-e', 'vitamin-b3',
  'vitamin-b6', 'folate', 'calcium', 'iron', 'zinc', 'magnesium',
  'selenium', 'iodine', 'potassium',
];

/**
 * BIOTIN'S INTERFERENCE THRESHOLD, kept as a named constant because it is an
 * interlock and not a fact. Five milligrams of supplemental biotin corrupts
 * the immunoassays used for 25(OH)D, B12, folate and ferritin — the four
 * markers this whole system retests. Sandwich assays read low, competitive
 * assays read high, so one draw can make B12 look high and ferritin look low
 * at the same time. Any retest offered to somebody at or above this must
 * carry the washout with it.
 */
export const BIOTIN_INTERFERENCE = {
  mcgPerDay: 5000,
  washoutHours: 8,
  highDoseWashoutHours: 72,
  affects: ['25(OH)D', 'vitamin B12', 'folate', 'ferritin', 'TSH', 'free T4', 'PTH', 'troponin'],
  source: 'ADLM/AACC guidance on biotin interference in laboratory tests; FDA safety communication',
} as const;
