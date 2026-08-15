/**
 * THE CUT-OFFS, AND WHO PUBLISHED THEM.
 *
 * WHY THIS FILE EXISTS SEPARATELY. `knowledge.ts` holds what the evidence
 * review says about SUPPLEMENTS. This holds what national bodies say about
 * BLOOD RESULTS, and the two are different kinds of claim from different
 * sources — "psyllium lowers LDL by 13 mg/dL" comes out of a meta-analysis,
 * "an LDL of 130 is above the desirable band" comes out of NCEP ATP III. Two
 * files because one of them may only ever be updated by re-reading the review,
 * and the other only by re-reading a guideline.
 *
 * WHAT A CUT-OFF IS ALLOWED TO DO HERE. Exactly two things: put a supplement
 * in a different BUCKET, and add a sentence saying a result belongs in front
 * of a doctor. That is the whole permitted use, and the spec enforces the
 * rest — no cut-off scales a dose, no cut-off is subtracted from a result to
 * produce a "gap", and nothing in the engine multiplies a lab value by
 * anything. Crossing a line on this page is not a diagnosis and the copy never
 * calls it one; the medical hub is where a result gets interpreted, and this
 * engine's only job is to stop being confidently wrong about a bottle.
 *
 * THE ONE THAT IS NOT A GUIDELINE. `vitaminDLow` at 20 ng/mL is the threshold
 * the owner's own evidence review uses, and it is marked as such rather than
 * dressed in an institution's name. It is also, not coincidentally, the lower
 * bound the medical hub's own biomarker catalogue carries for `vitd`.
 *
 * WHERE THE MEDICAL HUB ALREADY AGREES. Its catalogue puts `hba1c` at 4–5.6%,
 * `ldl` at 0–130 and `trig` at 0–150, and its clinical engine already prints
 * the 6.5% and 5.7% HbA1c bands. These numbers are the same numbers. If they
 * ever diverge, the medical hub is right and this file is stale.
 */

export interface Cutoff {
  /** The number itself. Compared against a result; never arithmetic on one. */
  value: number;
  unit: string;
  /** Said to the citizen, in the band's own language. */
  band: string;
  /** Who publishes it. Never blank. */
  authority: string;
}

export const CUTOFF = {
  /* ── the three the engine already turned on ─────────────────────────── */
  vitaminDLow: {
    value: 20, unit: 'ng/mL', band: 'deficient',
    authority: 'the threshold used throughout Supplements, Honestly (Aug 2026)',
  },
  b12Low: {
    value: 200, unit: 'pg/mL', band: 'low',
    authority: 'the medical hub’s biomarker catalogue (200–900 pg/mL)',
  },
  ferritinLow: {
    value: 30, unit: 'ng/mL', band: 'low',
    authority: 'the medical hub’s biomarker catalogue (30–300 ng/mL)',
  },

  /* ── the four his panel actually carries ────────────────────────────── */
  triglyceridesHigh: {
    value: 200, unit: 'mg/dL', band: 'high (200–499 mg/dL)',
    authority: 'NCEP ATP III triglyceride bands',
  },
  triglyceridesVeryHigh: {
    value: 500, unit: 'mg/dL', band: 'very high (≥500 mg/dL)',
    authority: 'NCEP ATP III triglyceride bands',
  },
  ldlAboveDesirable: {
    value: 130, unit: 'mg/dL', band: 'above the desirable range (≥130 mg/dL)',
    authority: 'NCEP ATP III LDL bands',
  },
  hba1cPrediabetes: {
    value: 5.7, unit: '%', band: 'the pre-diabetes range (5.7–6.4%)',
    authority: 'ADA Standards of Care',
  },
  hba1cDiabetes: {
    value: 6.5, unit: '%', band: 'the diabetes range (≥6.5%)',
    authority: 'ADA Standards of Care',
  },
  haemoglobinLowMale: {
    value: 13, unit: 'g/dL', band: 'anaemia in adult men',
    authority: 'WHO haemoglobin thresholds',
  },
  haemoglobinLowFemale: {
    value: 12, unit: 'g/dL', band: 'anaemia in non-pregnant adult women',
    authority: 'WHO haemoglobin thresholds',
  },
} as const satisfies Record<string, Cutoff>;

/**
 * THE FINDINGS THIS ENGINE HANDS BACK RATHER THAN ANSWERS.
 *
 * An HbA1c of 6.7% is not a supplement question. Neither is a triglyceride of
 * 427. The engine could stay silent about both and still be technically
 * correct — every bottle it named would still be defensible — and that silence
 * is precisely the failure this list exists to prevent: a screen that read the
 * result, said nothing about it, and recommended fish oil.
 *
 * Each entry is a sentence about the RESULT, naming who set the band, and
 * ending where a supplement page has to end. The engine never pairs one of
 * these with a product.
 */
export interface ClinicalNote {
  /** The medical hub's key, so the screen can link to the marker. */
  marker: string;
  text: string;
  source: string;
}
