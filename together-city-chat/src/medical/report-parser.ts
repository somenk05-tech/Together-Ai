/**
 * Deterministic blood-report text parser — the LAST-RESORT fallback when AI
 * extraction is unavailable (key unset, credits exhausted, model outage) or
 * returned nothing. Works on the plain text of a text-based PDF (the format
 * every major Indian lab portal — Thyrocare, Dr Lal, Metropolis, Redcliffe,
 * Healthians, SRL, Apollo — exports).
 *
 * Safety posture: values feed an auto-run analysis the user can review and
 * correct, so every accepted number must clear three gates:
 *   1. it sits on (or immediately after) a line naming the marker,
 *   2. it is NOT part of a reference range ("13.0 - 17.0", "< 5.0", "> 40"),
 *   3. after unit conversion it falls inside generous physiological bounds.
 * Anything ambiguous is simply omitted — the user types that one in manually.
 */

/** A reference interval as the LAB printed it, in the value's own units.
 *  `low` or `high` is null for a one-sided bound ("< 5.0", "> 40"). */
export interface PrintedRange { low: number | null; high: number | null }

export interface ParsedReport {
  values: Record<string, number>;
  /** The interval the citizen's own lab printed beside each value, where one was
   *  found and could be trusted. The lab applied their sex, their age and their
   *  assay to produce it, which is three things our catalogue cannot do. */
  ranges?: Record<string, PrintedRange>;
  lab?: string;
  takenOn?: string; // YYYY-MM-DD
}

interface MarkerSpec {
  key: string;
  /** Line must match this to be considered the marker's row. */
  name: RegExp;
  /** Line must NOT match this (disambiguates e.g. Hb vs HbA1c vs MCH). */
  exclude?: RegExp;
  /** Alternate-unit conversions applied when the unit string appears on the line. */
  convert?: { unit: RegExp; factor: (v: number) => number }[];
  /** If no unit is printed, values above this threshold are assumed to be in the
   *  common alternate unit and converted with `autoConvert`. */
  autoThreshold?: number;
  autoConvert?: (v: number) => number;
  /** Plausible physiological bounds AFTER conversion (generous). */
  lo: number;
  hi: number;
}

const MARKERS: MarkerSpec[] = [
  {
    key: 'hb',
    name: /\bh(?:a?e)?moglobin\b|\bhb\b/i,
    exclude: /a1c|glyc(?:at|osylat)ed|mean\s+corp|mch|mchc|electrophoresis|variant/i,
    convert: [{ unit: /g\s*\/\s*l(?![a-z])/i, factor: (v) => v / 10 }],
    autoThreshold: 30, autoConvert: (v) => v / 10, // g/L printed without unit
    lo: 3, hi: 25,
  },
  {
    key: 'ferritin',
    name: /\bferritin\b/i,
    lo: 1, hi: 4000, // ng/mL == µg/L, no conversion needed
  },
  {
    key: 'vitd',
    name: /25[\s-]*(?:oh|hydroxy)|vitamin\s*d\s*(?:total|\(|,|$)|vitamin\s*d3?\s*25/i,
    exclude: /d2\b(?!.*total)|1,\s*25|dihydroxy/i,
    convert: [{ unit: /nmol\s*\/\s*l/i, factor: (v) => v / 2.5 }],
    autoThreshold: 150, autoConvert: (v) => v / 2.5,
    lo: 3, hi: 200, // ng/mL
  },
  {
    key: 'b12',
    name: /b[\s-]*12\b|cobalamin/i,
    exclude: /active\s*b12|holo/i,
    convert: [{ unit: /pmol\s*\/\s*l/i, factor: (v) => v * 1.355 }],
    lo: 50, hi: 4000, // pg/mL
  },
  {
    key: 'folate',
    name: /\bfolate\b|folic\s*acid/i,
    exclude: /rbc\s*folate/i,
    convert: [{ unit: /nmol\s*\/\s*l/i, factor: (v) => v / 2.266 }],
    lo: 0.5, hi: 60, // ng/mL
  },
  {
    key: 'hba1c',
    name: /hba1c|\ba1c\b|glyc(?:at|osylat)ed\s+h(?:a?e)?moglobin/i,
    exclude: /estimated\s+average|eag|mean\s+(?:blood\s+)?glucose/i,
    convert: [{ unit: /mmol\s*\/\s*mol/i, factor: (v) => 0.0915 * v + 2.15 }],
    autoThreshold: 25, autoConvert: (v) => 0.0915 * v + 2.15,
    lo: 3.5, hi: 20, // %
  },
  {
    key: 'ldl',
    name: /\bldl\b/i,
    exclude: /vldl|non[\s-]*hdl|ratio/i,
    convert: [{ unit: /mmol\s*\/\s*l/i, factor: (v) => v * 38.67 }],
    autoThreshold: 0, // handled below: mg/dL values are ≥ 20; mmol values < 15
    lo: 20, hi: 500, // mg/dL
  },
  {
    key: 'trig',
    name: /triglycerid/i,
    exclude: /ratio/i,
    convert: [{ unit: /mmol\s*\/\s*l/i, factor: (v) => v * 88.57 }],
    lo: 20, hi: 3000, // mg/dL
  },
  {
    key: 'crp',
    name: /c[\s-]*reactive|\bh?s?[\s-]*crp\b/i,
    exclude: /ratio/i,
    convert: [{ unit: /mg\s*\/\s*dl/i, factor: (v) => v * 10 }],
    lo: 0.02, hi: 400, // mg/L
  },
];

// Small-unit auto-detects for markers where the magnitude is unambiguous.
const SMALL_UNIT_AUTOCONVERT: Record<string, (v: number) => number> = {
  ldl: (v) => (v < 15 ? v * 38.67 : v),
  trig: (v) => (v < 15 ? v * 88.57 : v),
};

const KNOWN_LABS =
  /(thyrocare|dr\.?\s*lal\s*path\s*labs?|lalpathlabs|metropolis|redcliffe|healthians|srl\s*diagnostics|apollo\s*diagnostics|max\s*lab|tata\s*1mg|orange\s*health|vijaya\s*diagnostic|suburban\s*diagnostics|neuberg|pathkind|agilus)/i;

/** Numbers on a line, excluding reference-range members, comparator bounds, and
 *  digits embedded in identifiers ("HbA1c", "B12", "25-OH", "D3"). */
export function standaloneNumbers(line: string): number[] {
  const out: number[] = [];
  const numRe = /\d+(?:[.,]\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(line)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const before = line.slice(Math.max(0, start - 8), start);
    const after = line.slice(end, end + 10);
    // Part of an identifier, not a result: letter directly before ("A1c", "B12"),
    // or a letter directly after — possibly through a dash/paren ("25-OH",
    // "25(OH)", "3rd"). A unit after a SPACE ("14.2 g/dL") is fine.
    if (/[A-Za-z]$/.test(before)) continue;
    if (/^[-–(]?[A-Za-z%]/.test(after) && !/^%/.test(after)) continue;
    // "< 5.0" / "> 40" / "≤ 6" — a comparator bound, not a result.
    if (/[<>≤≥]\s*$/.test(before)) continue;
    // Left or right side of an explicit range "13.0 - 17.0" / "13–17" / "13 to 17".
    if (/^\s*(?:-|–|—|to\b)\s*\d/.test(after)) continue;
    if (/\d\s*(?:-|–|—|to)\s*$/.test(before)) continue;
    const v = parseFloat(m[0].replace(',', '.'));
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * The reference interval printed on a line, or null.
 *
 * `standaloneNumbers()` above already finds these — it has to, so it can refuse
 * to mistake one for a result. Lines 134-136 are that refusal. This is the same
 * three shapes, kept instead of discarded.
 *
 * Deliberately NOT clever. One interval per line, the first one found, and only
 * the forms a lab actually prints. A range guessed off a busy line would end up
 * beside somebody's haemoglobin as though their own lab had said it.
 */
export function printedRange(line: string): PrintedRange | null {
  // "13.0 - 17.0", "13–17", "13 to 17"
  const two = line.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:[.,]\d+)?)/);
  if (two) {
    const low = parseFloat(two[1].replace(',', '.'));
    const high = parseFloat(two[2].replace(',', '.'));
    if (Number.isFinite(low) && Number.isFinite(high) && low < high) return { low, high };
    return null;
  }
  // "< 5.0" / "≤ 6" — an upper bound with no lower one stated.
  const upper = line.match(/[<≤]\s*(\d+(?:[.,]\d+)?)/);
  if (upper) {
    const high = parseFloat(upper[1].replace(',', '.'));
    if (Number.isFinite(high)) return { low: null, high };
  }
  // "> 40" / "≥ 40"
  const lower = line.match(/[>≥]\s*(\d+(?:[.,]\d+)?)/);
  if (lower) {
    const low = parseFloat(lower[1].replace(',', '.'));
    if (Number.isFinite(low)) return { low, high: null };
  }
  return null;
}

function pickValue(spec: MarkerSpec, lines: string[], idx: number): { value: number; range: PrintedRange | null } | null {
  // Candidates: numbers on the marker's own line after the name, else the next line
  // (text extracted from PDF columns often wraps the value onto its own line).
  const candidateLines = [lines[idx], lines[idx + 1] ?? ''];
  for (let li = 0; li < candidateLines.length; li++) {
    const line = candidateLines[li];
    if (li === 1 && (MARKERS.some((s) => s !== spec && s.name.test(line)) || !line.trim())) break;
    // Scan only AFTER the marker name so digits inside the name region
    // ("25-OH Vitamin D") can never be mistaken for the result.
    const nameMatch = li === 0 ? line.match(spec.name) : null;
    const from = nameMatch ? (nameMatch.index ?? 0) + nameMatch[0].length : 0;
    const tail = line.slice(from);
    const nums = standaloneNumbers(tail);
    for (const raw of nums) {
      let v = raw;
      const unitConv = spec.convert?.find((c) => c.unit.test(line));
      // Whether the printed range can be trusted alongside this value.
      //
      // A range is only useful in the SAME units as the value beside it. An
      // explicit unit conversion is linear and applies to the bounds exactly as
      // it applies to the value, so those are safe. The threshold conversions
      // are not: `v < 15 ? v * 38.67 : v` decides per number, so a bound either
      // side of 15 converts differently from the value and the interval comes
      // out nonsense. We would rather have no range than a wrong one — a wrong
      // one is printed beside somebody's result as though their lab said it.
      let trustRange = true;
      if (unitConv) v = unitConv.factor(v);
      else if (spec.autoThreshold && spec.autoConvert && v > spec.autoThreshold) { v = spec.autoConvert(v); trustRange = false; }
      else if (SMALL_UNIT_AUTOCONVERT[spec.key]) {
        const converted = SMALL_UNIT_AUTOCONVERT[spec.key](v);
        if (converted !== v) trustRange = false;
        v = converted;
      }
      v = Math.round(v * 100) / 100;
      if (v < spec.lo || v > spec.hi) continue;

      let range = trustRange ? printedRange(tail) : null;
      if (range && unitConv) {
        range = {
          low: range.low === null ? null : Math.round(unitConv.factor(range.low) * 100) / 100,
          high: range.high === null ? null : Math.round(unitConv.factor(range.high) * 100) / 100,
        };
      }
      // A range the value itself sits nowhere near is a range we attributed to
      // the wrong marker. Dropping it costs a caveat; keeping it would tell
      // somebody their result is abnormal against numbers that are not theirs.
      if (range && !plausibleFor(spec, range)) range = null;
      return { value: v, range };
    }
  }
  return null;
}

/** Both stated bounds must sit inside the marker's physiological span, and the
 *  interval must not be wider than that span. Cheap, and it catches a range
 *  scraped from the wrong column. */
function plausibleFor(spec: MarkerSpec, r: PrintedRange): boolean {
  // `spec.lo` is the floor of a plausible RESULT, not of a stated bound: labs
  // routinely print "0.0 - 0.5", and rejecting that threw away every CRP range
  // on the first run of this. Only the top is checked against the span.
  const inSpan = (n: number | null) => n === null || (n >= 0 && n <= spec.hi);
  if (!inSpan(r.low) || !inSpan(r.high)) return false;
  if (r.low !== null && r.high !== null && r.high - r.low > spec.hi - spec.lo) return false;
  return true;
}

function findDate(text: string): string | undefined {
  // Prefer a date near collection/reporting labels; Indian reports are dd/mm/yyyy.
  const labelled = text.match(
    /(?:collect|drawn|sample|report)[^\n]{0,40}?(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i,
  );
  const any = labelled ?? text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (any) {
    const [, d, mo, y] = any;
    const day = +d, mon = +mo;
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const named = text.match(/(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{4})/);
  if (named) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mi = months.indexOf(named[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${named[3]}-${String(mi + 1).padStart(2, '0')}-${String(+named[1]).padStart(2, '0')}`;
  }
  return undefined;
}

/** Parse marker values deterministically from report text. Conservative: omits
 *  anything it can't confidently attribute; never throws. */
export function parseReportText(text: string): ParsedReport {
  const values: Record<string, number> = {};
  const ranges: Record<string, PrintedRange> = {};
  try {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const spec of MARKERS) {
      if (values[spec.key] !== undefined) continue;
      for (let i = 0; i < lines.length; i++) {
        if (!spec.name.test(lines[i])) continue;
        if (spec.exclude?.test(lines[i])) continue;
        const hit = pickValue(spec, lines, i);
        if (hit !== null) {
          values[spec.key] = hit.value;
          if (hit.range) ranges[spec.key] = hit.range;
          break;
        }
      }
    }
    const labMatch = text.match(KNOWN_LABS);
    return {
      values,
      ranges: Object.keys(ranges).length ? ranges : undefined,
      lab: labMatch ? labMatch[1].replace(/\s+/g, ' ').trim() : undefined,
      takenOn: findDate(text),
    };
  } catch {
    return { values };
  }
}
