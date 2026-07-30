/**
 * Micronutrient targets, from a versioned reference-intake table (BE-7.3).
 *
 * The ticket is specific about the shape: "a versioned reference-intake table
 * (ICMR-NIN RDA for Indian users; WHO/IOM as alternate set) keyed by age band,
 * sex, pregnancy/lactation. Table is data, not code, with a source and version
 * column per row." ICMR-NIN is the standard chosen for this app.
 *
 * SO EVERY ROW CARRIES ITS OWN PROVENANCE, and that is not ceremony. These are
 * numbers a citizen may act on — buy a supplement, change what they cook — and
 * "the app said 29 mg of iron" is only worth anything if the app can say who
 * says so and which edition. When a second standard is added, or ICMR revises
 * these, rows are added rather than numbers edited in place.
 *
 * WHAT IS HERE, AND WHAT IS DELIBERATELY NOT.
 *
 * The adult rows below are the ICMR-NIN 2020 figures as published in the
 * Institute's own summary. They are cited per row.
 *
 * Pregnancy, lactation and the paediatric bands are NOT here. The full ICMR-NIN
 * table is a paid publication and those figures are not in the free summary, so
 * there is nothing to cite for them. They are the rows where being wrong matters
 * most — iron and folate in pregnancy are the difference between a healthy
 * pregnancy and a preventable harm — and a plausible-looking guess is worse in
 * exactly proportion to how much the reader needs it to be right.
 *
 * So the lookup REFUSES for those life stages, and says why, rather than
 * quietly serving an adult figure to somebody who is pregnant. Completing the
 * table is a purchase, not a research task: ICMR-NIN's "Nutrient Requirements
 * and Recommended Dietary Allowances for Indians". Adding them is data entry
 * against this shape, no code change.
 *
 * Sources:
 *   ICMR-NIN Expert Group, "Nutrient Requirements for Indians" (2020),
 *   brief note: https://www.nin.res.in/rdabook/brief_note.pdf
 */

export type Sex = 'male' | 'female';

/** The groups the table is keyed by. Only the first two are populated. */
export type LifeStage = 'adultMan' | 'adultWoman' | 'pregnant' | 'lactating' | 'child' | 'adolescent';

export interface NutrientRow {
  nutrient: string;
  /** What to call it on screen. */
  label: string;
  unit: string;
  amount: number;
  /** RDA covers ~97% of the group; EAR is the median requirement. Not interchangeable. */
  kind: 'RDA' | 'EAR';
  lifeStage: LifeStage;
  source: string;
  sourceRef: string;
  version: string;
}

const NIN = {
  source: 'ICMR-NIN Expert Group on Nutrient Requirements for Indians',
  sourceRef: 'https://www.nin.res.in/rdabook/brief_note.pdf',
  version: '2020',
} as const;

/**
 * The reference bodies these figures were set for.
 *
 * Worth carrying, because the protein RDA is an amount for a body of that
 * weight, not a rate. Handing 54 g to a 95 kg man because he is a man is a
 * misreading of the table; the scalable figure is the EAR in g/kg, below.
 */
export const REFERENCE_BODY_KG: Record<'adultMan' | 'adultWoman', number> = {
  adultMan: 65,
  adultWoman: 55,
};

/** Protein EAR in g per kg per day — the figure that scales to a real body. */
export const PROTEIN_EAR_G_PER_KG = 0.66;

const row = (
  lifeStage: LifeStage, nutrient: string, label: string, unit: string, amount: number,
  kind: NutrientRow['kind'] = 'RDA',
): NutrientRow => ({ nutrient, label, unit, amount, kind, lifeStage, ...NIN });

export const REFERENCE_INTAKES: NutrientRow[] = [
  // ── Adult man (reference body 65 kg) ────────────────────────────────
  row('adultMan', 'protein', 'Protein', 'g', 54),
  row('adultMan', 'calcium', 'Calcium', 'mg', 1000),
  row('adultMan', 'iron', 'Iron', 'mg', 19),
  row('adultMan', 'zinc', 'Zinc', 'mg', 17),
  row('adultMan', 'vitaminA', 'Vitamin A', 'µg', 1000),
  row('adultMan', 'vitaminC', 'Vitamin C', 'mg', 80),
  row('adultMan', 'folate', 'Folate', 'µg DFE', 300),
  row('adultMan', 'vitaminB12', 'Vitamin B12', 'µg', 2.2),
  row('adultMan', 'vitaminD', 'Vitamin D', 'IU', 600),
  row('adultMan', 'magnesium', 'Magnesium', 'mg', 440),
  row('adultMan', 'iodine', 'Iodine', 'µg', 150),

  // ── Adult woman (reference body 55 kg) ──────────────────────────────
  row('adultWoman', 'protein', 'Protein', 'g', 45.7),
  row('adultWoman', 'calcium', 'Calcium', 'mg', 1000),
  // Higher than the man's, which is the figure people assume is a typo and is
  // not: menstrual losses.
  row('adultWoman', 'iron', 'Iron', 'mg', 29),
  row('adultWoman', 'zinc', 'Zinc', 'mg', 13),
  row('adultWoman', 'vitaminA', 'Vitamin A', 'µg', 840),
  row('adultWoman', 'vitaminC', 'Vitamin C', 'mg', 65),
  row('adultWoman', 'folate', 'Folate', 'µg DFE', 220),
  row('adultWoman', 'vitaminB12', 'Vitamin B12', 'µg', 2.2),
  row('adultWoman', 'vitaminD', 'Vitamin D', 'IU', 600),
  row('adultWoman', 'magnesium', 'Magnesium', 'mg', 370),
  row('adultWoman', 'iodine', 'Iodine', 'µg', 150),
];

export interface IntakeQuery {
  sex?: string | null;
  age?: number | null;
  pregnant?: boolean;
  lactating?: boolean;
}

export type IntakeResult =
  | { ok: true; lifeStage: LifeStage; referenceWeightKg: number; rows: NutrientRow[]; source: string; version: string; sourceRef: string }
  | { ok: false; reason: string };

/**
 * The reference intakes for this person, or an explanation of why there are
 * none.
 *
 * Refusal is the interesting path. Serving an adult figure to somebody pregnant
 * would be the most confident and most harmful thing this module could do —
 * pregnancy raises iron and folate requirements substantially, and a target set
 * too low reads as "you are doing fine".
 */
export function referenceIntakes(q: IntakeQuery): IntakeResult {
  const sex = (q.sex ?? '').toLowerCase();
  const age = q.age ?? null;

  if (q.pregnant) {
    return {
      ok: false,
      reason: 'We don’t have pregnancy nutrient targets on file yet. Rather than show you an adult '
        + 'figure — iron and folate needs are much higher in pregnancy, and a target set too low would '
        + 'read as though you were doing fine — we would rather say so. Your doctor or midwife has these.',
    };
  }
  if (q.lactating) {
    return {
      ok: false,
      reason: 'We don’t have targets for breastfeeding on file yet, and the adult figures are too low '
        + 'to stand in for them. Your doctor has these.',
    };
  }
  if (age !== null && age < 18) {
    return {
      ok: false,
      reason: 'We don’t have nutrient targets for under-18s on file yet. They differ by age band and '
        + 'an adult figure is not a safe substitute for them.',
    };
  }
  if (sex !== 'male' && sex !== 'female') {
    return {
      ok: false,
      reason: 'These reference intakes are published for men and women only, so we cannot pick a set '
        + 'for you from what the table has. Your energy and macro targets are unaffected.',
    };
  }

  const lifeStage: LifeStage = sex === 'male' ? 'adultMan' : 'adultWoman';
  return {
    ok: true,
    lifeStage,
    referenceWeightKg: REFERENCE_BODY_KG[lifeStage],
    rows: REFERENCE_INTAKES.filter((r) => r.lifeStage === lifeStage),
    source: NIN.source, version: NIN.version, sourceRef: NIN.sourceRef,
  };
}

/**
 * Protein scaled to a real body, rather than the table's reference figure.
 *
 * The RDA row says 54 g because the reference man weighs 65 kg. The EAR in
 * g/kg is what a 95 kg or a 48 kg person needs applied to them, and confusing
 * the two is the most likely way to misread this table.
 */
export function proteinEarFor(weightKg: number): number {
  return Math.round(weightKg * PROTEIN_EAR_G_PER_KG * 10) / 10;
}

/** Every life stage the table could hold, and whether it does. For a status page. */
export const COVERAGE: Record<LifeStage, boolean> = {
  adultMan: true,
  adultWoman: true,
  pregnant: false,
  lactating: false,
  child: false,
  adolescent: false,
};
