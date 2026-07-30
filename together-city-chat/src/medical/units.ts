import { biomarkerDef } from './biomarker-catalog';

/**
 * The unit the lab printed, converted to the one this app reasons in.
 *
 * FE-5.1 asks for "enter values with unit selector". That reads like a
 * convenience and is not one. Every reference range in biomarker-catalog.ts is
 * stated in one unit, and every value entered is compared against that range
 * with no record of what unit it arrived in. So a report printed in SI units —
 * which is most of the world outside the United States and India — is read as
 * if it were printed in the catalog's unit.
 *
 * The failure is silent and it is clinical:
 *
 *   Vitamin D of 30 nmol/L is deficient. Entered bare, it is compared against
 *   a 20–100 ng/mL range and comes back NORMAL. The true value is 12 ng/mL.
 *   Fasting glucose of 7 mmol/L is diabetic. Entered bare it reads 7 mg/dL,
 *   which is not a survivable blood sugar, but the range check only asks
 *   whether it is below 70, so it comes back LOW and the app suggests eating.
 *
 * Those values then flow into the panel flags, the health score, the clinical
 * narrative and — through the shared-biomarker consent — the nutrition targets.
 *
 * THE RULE HERE: a unit we do not recognise is REFUSED, never assumed. The
 * expensive mistake in this file would be a default, and the default that
 * suggests itself ("treat it as canonical") is exactly the bug above.
 *
 * WHERE THE NUMBERS COME FROM. Every factor below is either a decimal
 * relationship (g/dL to g/L), or derived from the analyte's molar mass and
 * cross-checked against a published clinical table. The two used:
 *
 *   Labcorp, "SI Unit Conversion Table"
 *     https://www.labcorp.com/test-menu/resources/si-unit-conversion-table
 *   Mayo Clinic Laboratories, "International System of Units (SI) Conversion"
 *     https://www.mayocliniclabs.com/order-tests/si-unit-conversion.html
 *
 * HbA1c is the exception and is not a factor at all — see IFCC below.
 *
 * WHAT IS DELIBERATELY ABSENT. Haemoglobin in mmol/L (used in the
 * Netherlands and parts of Scandinavia) depends on whether the figure is per
 * haemoglobin monomer or per tetramer, and the two differ fourfold. Ferritin
 * in pmol/L depends on an assumed molecular weight that varies by assay.
 * Neither is here, so both are refused rather than guessed at. A refusal is a
 * message asking the person which unit their report used; a wrong factor is a
 * wrong number they will never see the working for.
 */

/**
 * canonical = printed * factor + offset.
 *
 * The offset exists for exactly one analyte and it is not decoration: HbA1c in
 * IFCC units is an affine transform of the NGSP percentage, not a multiple of
 * it. Treating it as a ratio gets 48 mmol/mol (a diabetes diagnosis) to 4.4%
 * instead of 6.5%, which is the wrong side of the line.
 */
export interface UnitOption {
  /** The unit as a lab prints it. */
  unit: string;
  factor: number;
  offset?: number;
  /** Shown in the selector when the unit needs a word of care. */
  note?: string;
}

export interface UnitChoice extends UnitOption {
  /** True for the unit the reference range is stated in. */
  canonical: boolean;
}

export interface AnalyteUnits {
  key: string;
  /** MUST equal the unit on this marker in biomarker-catalog.ts. A test asserts it. */
  canonical: string;
  alternates: UnitOption[];
}

/** Molar masses used to derive the factors above, in g/mol. Stated so the
 *  arithmetic can be checked rather than taken on trust — the spec tests
 *  re-derive several of these factors from this table. */
export const MOLAR_MASS: Record<string, number> = {
  glucose: 180.156,
  cholesterol: 386.65,
  triglyceride: 885.4,
  creatinine: 113.12,
  urea: 60.06,
  ureaNitrogen: 28.014,
  uricAcid: 168.11,
  bilirubin: 584.66,
  iron: 55.845,
  magnesium: 24.305,
  zinc: 65.38,
  vitaminD3_25OH: 400.64,
  folate: 441.4,
  cyanocobalamin: 1355.37,
  freeT3: 650.98,
  freeT4: 776.87,
};

const ANALYTE_UNITS: AnalyteUnits[] = [
  // ── Blood sugar ───────────────────────────────────────────────────────
  // 1 mmol/L = 18.0156 mg/dL (glucose, MW 180.156). Labcorp: 0.0555 the other way.
  { key: 'fbs', canonical: 'mg/dL', alternates: [{ unit: 'mmol/L', factor: 18.0156 }] },
  { key: 'ppbs', canonical: 'mg/dL', alternates: [{ unit: 'mmol/L', factor: 18.0156 }] },
  // NGSP % from IFCC mmol/mol, by the NGSP/IFCC master equation:
  //   NGSP = 0.09148 x IFCC + 2.152        https://ngsp.org/ifccngsp.asp
  { key: 'hba1c', canonical: '%', alternates: [
    { unit: 'mmol/mol', factor: 0.09148, offset: 2.152, note: 'IFCC units, as reported across most of Europe' },
  ] },
  // 1 pmol/L = 1/6.95 uIU/mL (Mayo: 6.95 the other way). mIU/L is the same size as uIU/mL.
  { key: 'insulin', canonical: 'µIU/mL', alternates: [
    { unit: 'mIU/L', factor: 1 },
    { unit: 'pmol/L', factor: 0.1439 },
  ] },

  // ── Lipids ────────────────────────────────────────────────────────────
  // Cholesterol MW 386.65 → 1 mmol/L = 38.665 mg/dL. Labcorp: 0.0259.
  // Triglyceride is a DIFFERENT factor (MW 885.4 → 88.54), which is the whole
  // reason these are listed per marker and not per unit pair.
  { key: 'totalChol', canonical: 'mg/dL', alternates: [{ unit: 'mmol/L', factor: 38.665 }] },
  { key: 'ldl', canonical: 'mg/dL', alternates: [{ unit: 'mmol/L', factor: 38.665 }] },
  { key: 'hdl', canonical: 'mg/dL', alternates: [{ unit: 'mmol/L', factor: 38.665 }] },
  { key: 'nonHdl', canonical: 'mg/dL', alternates: [{ unit: 'mmol/L', factor: 38.665 }] },
  { key: 'vldl', canonical: 'mg/dL', alternates: [{ unit: 'mmol/L', factor: 38.665 }] },
  { key: 'trig', canonical: 'mg/dL', alternates: [{ unit: 'mmol/L', factor: 88.54 }] },

  // ── Iron & blood ──────────────────────────────────────────────────────
  { key: 'hb', canonical: 'g/dL', alternates: [{ unit: 'g/L', factor: 0.1 }] },
  // ng/mL and ug/L are the same size. Nothing else is safe (see the header).
  { key: 'ferritin', canonical: 'ng/mL', alternates: [{ unit: 'µg/L', factor: 1 }] },
  // Iron MW 55.845 → 1 umol/L = 5.5845 ug/dL. Labcorp: 0.179.
  { key: 'serumIron', canonical: 'µg/dL', alternates: [{ unit: 'µmol/L', factor: 5.5845 }] },
  { key: 'tibc', canonical: 'µg/dL', alternates: [{ unit: 'µmol/L', factor: 5.5845 }] },
  { key: 'uibc', canonical: 'µg/dL', alternates: [{ unit: 'µmol/L', factor: 5.5845 }] },
  // Folate MW 441.4 → 1 nmol/L = 0.4414 ng/mL. Labcorp: 2.265 the other way.
  { key: 'folate', canonical: 'ng/mL', alternates: [
    { unit: 'nmol/L', factor: 0.4414 },
    { unit: 'µg/L', factor: 1 },
  ] },
  // B12: Labcorp gives ng/mL -> pmol/L = 738, so pmol/L -> pg/mL = 1/0.738.
  // pg/mL and ng/L are the same size.
  { key: 'b12', canonical: 'pg/mL', alternates: [
    { unit: 'pmol/L', factor: 1.35537 },
    { unit: 'ng/L', factor: 1 },
  ] },

  // ── Vitamins & minerals ───────────────────────────────────────────────
  // 25-OH vitamin D3, MW 400.64 → 1 nmol/L = 0.40064 ng/mL. Mayo: 2.496.
  { key: 'vitd', canonical: 'ng/mL', alternates: [
    { unit: 'nmol/L', factor: 0.40064, note: 'the unit used across most of Europe, Australia and Canada' },
  ] },
  // Magnesium is divalent, so mEq/L is HALF mmol/L — the one place a
  // "milli-equivalent is basically millimoles" habit produces a doubled number.
  { key: 'magnesium', canonical: 'mg/dL', alternates: [
    { unit: 'mmol/L', factor: 2.4305 },
    { unit: 'mEq/L', factor: 1.2153 },
  ] },
  { key: 'zinc', canonical: 'µg/dL', alternates: [{ unit: 'µmol/L', factor: 6.538 }] },

  // ── Liver ─────────────────────────────────────────────────────────────
  // Enzyme activity: U/L and IU/L are the same unit under two names, which is
  // worth accepting because labs print both and a person should not have to
  // wonder whether they are the same.
  { key: 'alt', canonical: 'U/L', alternates: [{ unit: 'IU/L', factor: 1 }] },
  { key: 'ast', canonical: 'U/L', alternates: [{ unit: 'IU/L', factor: 1 }] },
  { key: 'ggt', canonical: 'U/L', alternates: [{ unit: 'IU/L', factor: 1 }] },
  { key: 'alp', canonical: 'U/L', alternates: [{ unit: 'IU/L', factor: 1 }] },
  { key: 'bilirubin', canonical: 'mg/dL', alternates: [{ unit: 'µmol/L', factor: 0.058466 }] },
  { key: 'albumin', canonical: 'g/dL', alternates: [{ unit: 'g/L', factor: 0.1 }] },
  { key: 'totalProtein', canonical: 'g/dL', alternates: [{ unit: 'g/L', factor: 0.1 }] },

  // ── Kidney ────────────────────────────────────────────────────────────
  { key: 'creatinine', canonical: 'mg/dL', alternates: [{ unit: 'µmol/L', factor: 0.011312 }] },
  /**
   * Urea and BUN are not the same measurement and the catalog's range (15–40
   * mg/dL) is urea's, not BUN's (roughly 7–20). A BUN result pasted in as
   * urea reads 2.14x low — a normal 15 mg/dL BUN arrives as 15 mg/dL urea and
   * is flagged as the bottom of the range instead of the middle of it. So BUN
   * is its own selectable unit, converted by the nitrogen fraction of urea
   * (60.06 / 28.014), rather than a footnote somebody has to notice.
   */
  { key: 'urea', canonical: 'mg/dL', alternates: [
    { unit: 'mmol/L', factor: 6.006 },
    { unit: 'mg/dL (BUN)', factor: 2.1439, note: 'blood urea nitrogen — a different measurement, converted for you' },
  ] },
  // Uric acid MW 168.11 → 1 umol/L = 0.016811 mg/dL. Labcorp: 0.059 to mmol/L.
  { key: 'uricAcid', canonical: 'mg/dL', alternates: [
    { unit: 'µmol/L', factor: 0.016811 },
    { unit: 'mmol/L', factor: 16.811 },
  ] },
  // Sodium and potassium are monovalent, so mEq/L and mmol/L are equal here.
  { key: 'sodium', canonical: 'mmol/L', alternates: [{ unit: 'mEq/L', factor: 1 }] },
  { key: 'potassium', canonical: 'mmol/L', alternates: [{ unit: 'mEq/L', factor: 1 }] },

  // ── Inflammation ──────────────────────────────────────────────────────
  // The tenfold one. A CRP of 0.8 mg/dL is 8 mg/L, which is raised; read as
  // 0.8 mg/L it is unremarkable.
  { key: 'crp', canonical: 'mg/L', alternates: [{ unit: 'mg/dL', factor: 10 }] },

  // ── Thyroid ───────────────────────────────────────────────────────────
  { key: 'tsh', canonical: 'µIU/mL', alternates: [
    { unit: 'mIU/L', factor: 1 },
    { unit: 'µU/mL', factor: 1 },
  ] },
  // Free T3, MW 650.98 → 1 pmol/L = 0.65098 pg/mL.
  { key: 'ft3', canonical: 'pg/mL', alternates: [
    { unit: 'pmol/L', factor: 0.65098 },
    { unit: 'ng/L', factor: 1 },
  ] },
  // Free T4, MW 776.87 → 1 pmol/L = 0.077687 ng/dL.
  { key: 'ft4', canonical: 'ng/dL', alternates: [
    { unit: 'pmol/L', factor: 0.077687 },
    { unit: 'ng/L', factor: 0.1 },
  ] },
];

const BY_KEY = new Map(ANALYTE_UNITS.map((a) => [a.key, a] as const));

/**
 * The unit a marker's reference range is stated in.
 *
 * Read from this table when it has an entry and from the catalog otherwise, so
 * a marker with no alternates (eGFR, HOMA-IR, ESR, transferrin saturation) is
 * still handled rather than refused outright. The two must agree where both
 * speak — a test asserts it, because a range restated in different units with
 * this table left behind would put every conversion in the wrong scale.
 */
function canonicalUnit(key: string): string | undefined {
  return BY_KEY.get(key)?.canonical ?? biomarkerDef(key)?.unit;
}

/**
 * Two labs printing the same unit rarely print the same characters. The micro
 * sign (U+00B5), the Greek mu (U+03BC) and a plain "u" all appear in real
 * reports, as do "mcg", stray spaces and either case. None of that is a
 * different unit, and refusing over it would teach people that the selector is
 * broken.
 */
export function normaliseUnit(unit: string): string {
  return (unit ?? '')
    .trim()
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/\bmcg\b/g, 'ug')
    .replace(/\s+/g, '');
}

/** Every unit this marker accepts, canonical first — what the selector shows. */
export function acceptedUnits(key: string): string[] {
  return unitChoices(key).map((u) => u.unit);
}

/**
 * The selector's contents, factors included.
 *
 * The factors go to the client deliberately. The entry form colours each field
 * live against the reference range, so it has to convert too — and the only
 * thing worse than one unit table is two. Sending these means the badge the
 * person watches while typing and the flag the server stores are computed from
 * the same numbers. The server still converts for itself: the client's copy is
 * a preview, never the record.
 */
export function unitChoices(key: string): UnitChoice[] {
  const canonical = canonicalUnit(key);
  // `=== undefined`, not a truthiness check. HOMA-IR is a ratio and its unit is
  // the empty string — genuinely unitless, which is a different thing from a
  // marker we do not hold, and collapsing the two left that field with no unit
  // at all rather than with none needed.
  if (canonical === undefined) return [];
  const a = BY_KEY.get(key);
  return [
    { unit: canonical, factor: 1, offset: 0, canonical: true },
    ...(a?.alternates ?? []).map((u) => ({ ...u, offset: u.offset ?? 0, canonical: false })),
  ];
}

export function unitOptionsFor(key: string): AnalyteUnits | undefined {
  return BY_KEY.get(key);
}

/** Four decimals, matching what the catalog says the store holds. Rounding at
 *  the boundary rather than deeper in keeps a converted value and a typed one
 *  indistinguishable downstream. */
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export type UnitResult =
  | { ok: true; value: number; unit: string; converted: boolean }
  | { ok: false; reason: string };

/**
 * Convert a printed value into the unit this app reasons in.
 *
 * An omitted unit means "the unit the form was labelled with", which is the
 * canonical one — that is the existing behaviour and the only safe reading of
 * silence. An unrecognised unit is refused with the list of what this marker
 * accepts, because the person is holding the report and can answer.
 */
export function toCanonical(key: string, value: number, unit?: string | null): UnitResult {
  const canonical = canonicalUnit(key);
  if (canonical === undefined) return { ok: false, reason: `"${key}" is not a marker we hold.` };
  if (!Number.isFinite(value)) return { ok: false, reason: 'That value is not a number.' };

  // Silence means the unit the form is labelled with, which is the canonical
  // one. That is the behaviour that already existed and the only safe reading.
  if (unit === undefined || unit === null || unit === '') {
    return { ok: true, value, unit: canonical, converted: false };
  }

  const want = normaliseUnit(unit);
  if (want === normaliseUnit(canonical)) return { ok: true, value, unit: canonical, converted: false };

  const opt = BY_KEY.get(key)?.alternates.find((u) => normaliseUnit(u.unit) === want);
  if (!opt) {
    return {
      ok: false,
      reason: `We cannot read ${unit} for this marker. It accepts ${acceptedUnits(key).join(', ')}.`,
    };
  }

  return { ok: true, value: round4(value * opt.factor + (opt.offset ?? 0)), unit: canonical, converted: true };
}

/** The same conversion backwards, for showing a stored value the way the
 *  citizen's own lab printed it. */
export function fromCanonical(key: string, value: number, unit: string): UnitResult {
  const canonical = canonicalUnit(key);
  if (canonical === undefined) return { ok: false, reason: `"${key}" is not a marker we hold.` };
  if (!Number.isFinite(value)) return { ok: false, reason: 'That value is not a number.' };

  const want = normaliseUnit(unit);
  if (want === normaliseUnit(canonical)) return { ok: true, value, unit: canonical, converted: false };

  const opt = BY_KEY.get(key)?.alternates.find((u) => normaliseUnit(u.unit) === want);
  if (!opt) return { ok: false, reason: `We cannot read ${unit} for this marker.` };

  return { ok: true, value: round4((value - (opt.offset ?? 0)) / opt.factor), unit: opt.unit, converted: true };
}

export { ANALYTE_UNITS };
