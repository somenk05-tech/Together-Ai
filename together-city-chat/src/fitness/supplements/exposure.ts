import {
  NUTRIENTS, nutrient, matchNutrient, HARM_CAPABLE,
  type NutrientFact, type Unit, type RefValue, type UlScope,
} from './nutrients';
import { ALL_FORMULATIONS, type Formulation, type Row } from './formulations';

/**
 * THE EXPOSURE ENGINE — HOW MUCH, AGAINST WHAT, AND WHOSE NUMBER.
 *
 * This is the only file in the hub that does arithmetic on a nutrient amount,
 * and everything it is allowed to compute is listed here:
 *
 *   · convert a unit, where the conversion is a defined constant
 *   · add up the same nutrient across several products
 *   · divide by a requirement to get a percentage
 *   · compare against a ceiling that knows what it is a ceiling on
 *
 * It does NOT scale a dose to a body weight, derive a dose from a lab value,
 * or turn a percentage into a recommendation. Those remain what they have
 * always been in this hub: strings copied out of a reviewed source, or
 * nothing at all.
 *
 * ── THE FOUR RULES ────────────────────────────────────────────────────────
 *
 * 1. A SUSPECT ROW IS NOT COMPUTED ON. `formulations.ts` carries a label
 *    reading "chromium 50 mg" exactly as printed, because repairing a source
 *    silently hides the fact that it was wrong. The consequence is that this
 *    file must REFUSE that row rather than use it — either figure would be a
 *    fabrication, the printed one absurd and the corrected one invented. It
 *    comes back as `excluded`, with the reason, and the total says so.
 *
 * 2. A TOTAL-INTAKE CEILING CANNOT BE TESTED FROM SUPPLEMENTS ALONE. Iron's
 *    45 mg, zinc's 40 mg and calcium's 2,500 mg are limits on food AND
 *    supplements together, and this engine knows only the supplement half. So
 *    it never says "you are over the limit" for those. It says what fraction
 *    of the ceiling the pills alone occupy and that food has to fit in the
 *    rest. Magnesium, niacin, vitamin E and folic acid are different — their
 *    ceilings are on the supplemental fraction specifically, and there the
 *    engine CAN say the limit is exceeded, because it can see everything the
 *    limit covers.
 *
 * 3. A PERCENTAGE OF A FOREIGN NUMBER SAYS SO. Where ICMR publishes no
 *    requirement — vitamin E, K, B5, biotin, selenium, copper, manganese,
 *    chromium, molybdenum, phosphorus, potassium — the percentage is computed
 *    against an American figure and comes back with `basisOrigin:
 *    'foreign-fallback'`. The screen is obliged to render that differently.
 *    A percentage whose denominator is undeclared is the commonest lie in
 *    this category and this engine will not add to it.
 *
 * 4. THE CEILING THAT MATTERS IN INDIA IS NOT THE TOXICITY ONE. Indian food
 *    law caps a health supplement at ONE ICMR RDA — far below every tolerable
 *    upper limit. So a product can be perfectly safe and still be, on its
 *    composition, not a food. `classify()` computes that separately from
 *    `safety`, because they are different questions with different answers and
 *    conflating them would let a legal problem read as a health warning or,
 *    worse, the other way round.
 */

/* ── UNIT CONVERSION, and there are only two ────────────────────────────────
   Both are defined constants, not estimates. Anything else this engine cannot
   convert, it refuses to convert. */

/** Cholecalciferol and ergocalciferol alike: 1 µg = 40 IU. */
const IU_PER_MCG_VITAMIN_D = 40;
/** Retinol: 1 IU = 0.3 µg. This is the RETINOL factor and is not valid for
 *  beta-carotene, whose IU-to-µg conversion is a different number and whose
 *  conversion to retinol activity is variable and poor. Beta-carotene is
 *  therefore held as its own nutrient and never folded into a vitamin A total. */
const MCG_RETINOL_PER_IU = 0.3;

/** Canonical unit per nutrient — the one its reference value is expressed in. */
const canonicalUnit = (n: NutrientFact): Unit => n.unit;

/**
 * DIETARY FOLATE EQUIVALENTS, which are the reason folate needs its own path.
 *
 * The requirement is in µg DFE. The ceiling is in µg of synthetic folic acid.
 * These are different quantities and the definition that relates them is
 * 1 µg folic acid taken with food = 1.7 µg DFE. So a label printing "folic
 * acid 1500 µg" is declaring 2,550 µg DFE against a 300 µg requirement AND
 * 1,500 µg against a 1,000 µg ceiling — two true statements with different
 * numbers, and adding the wrong one to the wrong total is exactly the error
 * this file's header warns about.
 *
 * The one premise: all the folate in a tablet is synthetic. That holds for
 * every product here, because India's permitted-forms schedule lists only
 * folic acid and a methyltetrahydrofolate salt — there is no food folate in
 * a pill. Where a label declares DFE directly, the folic acid weight is
 * derived back through the same defined factor and marked as derived.
 */
const DFE_PER_MCG_FOLIC_ACID = 1.7;

export interface Converted {
  amount: number;
  unit: Unit;
  /** Set when a conversion was applied, so it can be shown rather than assumed. */
  note?: string;
  /**
   * The amount in the units the CEILING is expressed in, where that differs
   * from the requirement's units — folate only. null means the ceiling cannot
   * be tested against this row, and then `ceilingNote` says why.
   */
  ceilingAmount?: number | null;
  ceilingNote?: string;
}

/**
 * Normalise a declared amount to the nutrient's own unit. Returns null when
 * the conversion is not one of the defined ones — an unconvertible pair is a
 * refusal, not a guess.
 */
export const convert = (n: NutrientFact, amount: number, unit: Unit, form?: string | null): Converted | null => {
  const target = canonicalUnit(n);

  if (n.id === 'vitamin-d') {
    if (unit === target) return { amount, unit };
    if (unit === 'mcg' && target === 'IU') return { amount: amount * IU_PER_MCG_VITAMIN_D, unit: target, note: `${amount} µg converted at 40 IU per µg` };
    if (unit === 'IU' && target === 'mcg') return { amount: amount / IU_PER_MCG_VITAMIN_D, unit: target, note: `${amount} IU converted at 40 IU per µg` };
    return null;
  }

  if (n.id === 'vitamin-a') {
    const carotene = (form ?? '').toLowerCase().includes('carotene');
    const base = unit === 'IU'
      ? { amount: amount * MCG_RETINOL_PER_IU, unit: target, note: `${amount} IU converted at 0.3 µg retinol per IU — the retinol factor, which is not valid for carotenoids` }
      : (unit === 'mcg' || unit === 'mcg RAE') ? { amount, unit: target } : null;
    if (!base) return null;
    /* The ceiling is on PREFORMED retinol only. A label declaring part of its
       vitamin A as beta-carotene cannot be split without inventing the split,
       so the ceiling is not tested against that row and says so. */
    return carotene
      ? { ...base, ceilingAmount: null, ceilingNote: 'The label declares part of this vitamin A as beta-carotene, and the upper limit is on preformed retinol only. Splitting the declared figure would mean inventing the proportion, so this row is not tested against the ceiling. The beta-carotene fraction carries the smoker warning instead.' }
      : base;
  }

  if (n.id === 'folate') {
    if (unit === 'mcg DFE') {
      return {
        amount, unit: target,
        ceilingAmount: Math.round((amount / DFE_PER_MCG_FOLIC_ACID) * 10) / 10,
        ceilingNote: `The label declares ${amount} µg DFE. The ceiling is on synthetic folic acid, so the folic acid weight is derived back through the defined 1.7 factor — ${Math.round((amount / DFE_PER_MCG_FOLIC_ACID) * 10) / 10} µg.`,
      };
    }
    if (unit === 'mcg') {
      /* A label printing "folic acid X µg" is declaring folic acid weight. */
      const dfe = Math.round(amount * DFE_PER_MCG_FOLIC_ACID * 10) / 10;
      return {
        amount: dfe, unit: target,
        note: `${amount} µg of folic acid is ${dfe} µg DFE — the requirement is in dietary folate equivalents and folic acid counts 1.7× against it.`,
        ceilingAmount: amount,
      };
    }
    return null;
  }

  if (unit === target) return { amount, unit };
  return null;
};

/* ── PERCENTAGE OF REQUIREMENT ─────────────────────────────────────────────*/

export type Sex = 'male' | 'female';

export interface AgainstRequirement {
  /** null when neither India nor a fallback publishes a figure at all. */
  pct: number | null;
  reference: RefValue | null;
  basisOrigin: 'india' | 'foreign-fallback' | 'none';
  /** Said to the citizen when the denominator is not an Indian number. */
  caveat?: string;
}

/**
 * WHOSE REQUIREMENT. Indian first, always; an American figure only where
 * India publishes none, and then labelled as such rather than laundered.
 * Where the sex is unknown the HIGHER requirement is used, because a
 * percentage that overstates adequacy is the error that stops somebody
 * looking further.
 */
export const requirement = (n: NutrientFact, sex?: Sex): { ref: RefValue | null; origin: AgainstRequirement['basisOrigin'] } => {
  const m = n.rdaMale, f = n.rdaFemale;
  if (m || f) {
    if (sex === 'male' && m) return { ref: m, origin: 'india' };
    if (sex === 'female' && f) return { ref: f, origin: 'india' };
    const higher = m && f ? (m.value >= f.value ? m : f) : (m ?? f)!;
    return { ref: higher, origin: 'india' };
  }
  if (n.fallback) return { ref: n.fallback, origin: 'foreign-fallback' };
  return { ref: null, origin: 'none' };
};

export const againstRequirement = (n: NutrientFact, amount: number, sex?: Sex): AgainstRequirement => {
  const { ref, origin } = requirement(n, sex);
  if (!ref) return { pct: null, reference: null, basisOrigin: 'none' };
  return {
    pct: Math.round((amount / ref.value) * 1000) / 10,
    reference: ref,
    basisOrigin: origin,
    caveat: origin === 'foreign-fallback'
      ? `India publishes no requirement for ${n.name}. This percentage is of ${ref.provenance.authority}'s figure (${ref.provenance.year}), which is an American number and not an Indian recommendation.`
      : sex === undefined && n.rdaMale && n.rdaFemale && n.rdaMale.value !== n.rdaFemale.value
        ? `Sex not on file, so the higher of the two Indian requirements is used — a percentage that overstates adequacy is the one that stops somebody looking further.`
        : undefined,
  };
};

/* ── THE CEILING ───────────────────────────────────────────────────────────*/

export type CeilingVerdict =
  /** Under the ceiling, on the part of intake the ceiling actually covers. */
  | 'within'
  /** Above a ceiling that covers exactly what we can see. A real exceedance. */
  | 'over-supplemental'
  /** The supplement alone occupies most or all of a ceiling that food must
   *  also fit inside. Not an exceedance — a warning that there is no room. */
  | 'crowds-total'
  /** No ceiling published for this nutrient. */
  | 'no-ceiling';

export interface AgainstCeiling {
  verdict: CeilingVerdict;
  pctOfCeiling: number | null;
  scope: UlScope | null;
  /** The sentence the screen prints. Never a bare percentage. */
  text: string;
  source?: string;
  /** True when this nutrient is on the harm-capable list, which changes how
   *  loudly an exceedance should be said. */
  harmCapable: boolean;
}

/** Ceilings whose scope is exactly the supplemental fraction — the ones this
 *  engine can genuinely test, because it can see everything they cover. */
const SUPPLEMENT_SCOPED: UlScope[] = ['supplemental', 'supplemental-niacin', 'supplemental-alpha-tocopherol', 'synthetic-folic-acid'];

export const againstCeiling = (n: NutrientFact, amountFromSupplements: number): AgainstCeiling => {
  const harmCapable = HARM_CAPABLE.includes(n.id);
  if (!n.ul) {
    return {
      verdict: 'no-ceiling', pctOfCeiling: null, scope: null, harmCapable,
      text: n.ulAbsentBecause ?? 'No upper limit has been published for this nutrient.',
    };
  }
  const ul = n.ul;
  /* Preformed retinol: the ceiling is on retinol only, and beta-carotene is a
     separate nutrient here precisely so it is never added into this. */
  const pct = Math.round((amountFromSupplements / ul.value) * 1000) / 10;
  const src = `${ul.provenance.authority} (${ul.provenance.year})`;

  if (SUPPLEMENT_SCOPED.includes(ul.scope)) {
    if (amountFromSupplements > ul.value) {
      return {
        verdict: 'over-supplemental', pctOfCeiling: pct, scope: ul.scope, harmCapable, source: src,
        text: `${amountFromSupplements} ${ul.unit} is above the ${ul.value} ${ul.unit} upper limit — and that limit covers exactly what is in these products. ${ul.scopeNote}`,
      };
    }
    return {
      verdict: 'within', pctOfCeiling: pct, scope: ul.scope, harmCapable, source: src,
      text: `${pct}% of the ${ul.value} ${ul.unit} upper limit. ${ul.scopeNote}`,
    };
  }

  /* A total-intake ceiling. We can see the supplements and not the food, so
     the honest statement is about crowding, never about exceeding. */
  if (pct >= 80) {
    return {
      verdict: 'crowds-total', pctOfCeiling: pct, scope: ul.scope, harmCapable, source: src,
      text: `These products alone are ${pct}% of the ${ul.value} ${ul.unit} upper limit — and that limit covers food as well, which this page cannot see. It is not a statement that you are over it. It is a statement that there is very little room left for the rest of your day.`,
    };
  }
  return {
    verdict: 'within', pctOfCeiling: pct, scope: ul.scope, harmCapable, source: src,
    text: `These products are ${pct}% of the ${ul.value} ${ul.unit} upper limit, which covers food as well.`,
  };
};

/* ── TOTAL DAILY EXPOSURE, AND THE DUPLICATE-NUTRIENT PROBLEM ──────────────*/

export interface Contribution {
  formulationId: string;
  productName: string;
  amount: number;
  unit: Unit;
  form: string | null;
  conversionNote?: string;
  ceilingAmount?: number | null;
  ceilingNote?: string;
}

export interface Excluded {
  formulationId: string;
  nutrientId: string;
  printed: string;
  because: string;
}

export interface NutrientExposure {
  nutrientId: string;
  name: string;
  total: number;
  unit: Unit;
  contributions: Contribution[];
  requirement: AgainstRequirement;
  ceiling: AgainstCeiling;
  /** Where the ceiling is expressed in different units from the requirement —
   *  folate — this is the amount the ceiling was actually tested against, and
   *  `ceilingBasisNote` says how it was arrived at. null means the ceiling
   *  could not be tested on this nutrient at all. */
  ceilingAmount?: number | null;
  ceilingBasisNote?: string;
  /** Set when more than one product supplies this nutrient. The whole reason
   *  this function exists. */
  stacked?: string;
}

export interface Exposure {
  nutrients: NutrientExposure[];
  excluded: Excluded[];
  /** Nutrients that appear in more than one product, named first because they
   *  are the ones a citizen will not have added up themselves. */
  stacking: NutrientExposure[];
  /** Ingredients no reference database row could be found for. Counted against
   *  nothing, and listed rather than dropped. */
  unrecognised: Array<{ formulationId: string; name: string }>;
  /** Formulations included whose composition is not fully known. Any total
   *  here is a floor, not a total, and the screen must say so. */
  incomplete: Array<{ formulationId: string; productName: string; because: string }>;
}

/**
 * ADD UP EVERYTHING BEING SWALLOWED.
 *
 * The failure this exists to prevent is ordinary and common: a multivitamin,
 * a separate vitamin D, a B-complex for energy and a hair supplement, each
 * individually reasonable, together delivering four doses of B6 and enough
 * biotin to corrupt the blood test that was going to check on all of it.
 * Nobody adds those up, and the labels do not help — three of the four will
 * not print a percentage of anything.
 */
export const totalExposure = (formulations: Formulation[], sex?: Sex): Exposure => {
  const byNutrient = new Map<string, Contribution[]>();
  const excluded: Excluded[] = [];
  const unrecognised: Array<{ formulationId: string; name: string }> = [];
  const incomplete: Exposure['incomplete'] = [];

  for (const f of formulations) {
    if (f.compositionSource === 'UNKNOWN') {
      incomplete.push({
        formulationId: f.id, productName: `${f.brand} ${f.productName}`,
        because: f.unknownBecause ?? 'Composition not published anywhere reachable.',
      });
      continue;
    }
    if (f.compositionSource === 'partial') {
      incomplete.push({
        formulationId: f.id, productName: `${f.brand} ${f.productName}`,
        because: f.unknownBecause ?? 'Some declared ingredients carry no quantity, so anything computed from this product is a floor rather than a total.',
      });
    }
    for (const row of f.nutrients) {
      /* RULE 1. A suspect figure is refused, not corrected. */
      if (row.suspect) {
        excluded.push({
          formulationId: f.id, nutrientId: row.nutrient,
          printed: `${row.amount} ${row.unit}`, because: row.suspect,
        });
        continue;
      }
      let n: NutrientFact;
      try { n = nutrient(row.nutrient); } catch {
        unrecognised.push({ formulationId: f.id, name: row.nutrient });
        continue;
      }
      const c = convert(n, row.amount * f.servingsPerDay, row.unit, row.form);
      if (!c) {
        excluded.push({
          formulationId: f.id, nutrientId: row.nutrient,
          printed: `${row.amount} ${row.unit}`,
          because: `No defined conversion from ${row.unit} to ${n.unit} for ${n.name}. This engine converts only where the factor is a constant, and refuses where it is not.`,
        });
        continue;
      }
      const list = byNutrient.get(n.id) ?? [];
      list.push({
        formulationId: f.id, productName: `${f.brand} ${f.productName}`,
        amount: c.amount, unit: c.unit, form: row.form, conversionNote: c.note,
        ceilingAmount: c.ceilingAmount, ceilingNote: c.ceilingNote,
      });
      byNutrient.set(n.id, list);
    }
    for (const o of f.others) unrecognised.push({ formulationId: f.id, name: o.name });
  }

  const nutrients: NutrientExposure[] = [];
  for (const [id, contributions] of byNutrient) {
    const n = nutrient(id);
    const total = Math.round(contributions.reduce((s, c) => s + c.amount, 0) * 1000) / 1000;
    /* THE CEILING IS NOT ALWAYS MEASURED IN THE SAME UNITS AS THE REQUIREMENT.
       Folate is the case that forces this: the requirement is in µg DFE and
       the limit is in µg of folic acid. And a row that cannot be tested at all
       — vitamin A part-declared as beta-carotene — makes the whole nutrient
       untestable rather than testable on the remainder, because the remainder
       is not known. */
    const untestable = contributions.some((c) => c.ceilingAmount === null);
    const ceilingAmount = untestable ? null
      : Math.round(contributions.reduce((s, c) => s + (c.ceilingAmount ?? c.amount), 0) * 1000) / 1000;
    const ceilingBasisNote = untestable
      ? contributions.find((c) => c.ceilingAmount === null)?.ceilingNote
      : contributions.find((c) => c.ceilingNote)?.ceilingNote;
    nutrients.push({
      nutrientId: id, name: n.name, total, unit: n.unit, contributions,
      ceilingAmount, ceilingBasisNote,
      requirement: againstRequirement(n, total, sex),
      ceiling: ceilingAmount === null
        ? { verdict: 'no-ceiling' as const, pctOfCeiling: null, scope: n.ul?.scope ?? null,
            harmCapable: HARM_CAPABLE.includes(n.id),
            text: ceilingBasisNote ?? 'This nutrient could not be tested against its upper limit from what the labels declare.' }
        : againstCeiling(n, ceilingAmount),
      stacked: contributions.length > 1
        ? `${contributions.length} of these products contain ${n.name}: ${contributions.map((c) => `${c.productName} (${c.amount} ${c.unit})`).join(', ')}.`
        : undefined,
    });
  }

  /* Loudest first: a real supplemental exceedance, then a crowded total
     ceiling, then the merely stacked, then everything else by percentage. */
  const rank = (e: NutrientExposure) =>
    e.ceiling.verdict === 'over-supplemental' ? 0
      : e.ceiling.verdict === 'crowds-total' ? 1
        : e.stacked ? 2 : 3;
  nutrients.sort((a, b) => rank(a) - rank(b) || (b.requirement.pct ?? 0) - (a.requirement.pct ?? 0));

  return {
    nutrients, excluded,
    stacking: nutrients.filter((e) => e.stacked),
    unrecognised, incomplete,
  };
};

/* ── REGULATORY CLASSIFICATION ─────────────────────────────────────────────*/

export type ImpliedClass = 'health-supplement' | 'above-the-food-ceiling' | 'indeterminate';

export interface Classification {
  implied: ImpliedClass;
  /** What the retailer actually sells it as. */
  channel: Formulation['channel'];
  /** True when the composition and the channel do not agree — the finding. */
  mismatch: boolean;
  exceedances: Array<{ nutrientId: string; name: string; amount: number; unit: Unit; times: number; harmCapable: boolean }>;
  text: string;
  basis: string;
}

const CEILING_BASIS =
  'Food Safety and Standards (Health Supplements, Nutraceuticals, …) Regulations 2016, regulation 3(21) as amended by the gazette notification of 6 September 2021: a vitamin or mineral in a tablet, capsule or syrup format is covered by food law only "at levels equal to a maximum of one Recommended Dietary Allowance or below". FSSAI confirmed in June 2023 that it would not consider approvals above that line. Above it, in a dosage format, the product is not a food.';

/**
 * WHAT THE COMPOSITION IMPLIES ABOUT WHAT THIS PRODUCT LEGALLY IS.
 *
 * Deliberately separate from safety. A B-complex at five times the requirement
 * is very probably harmless and is, on the face of the regulations, not a food
 * — and a citizen deserves both sentences rather than a blend of them. The
 * interesting output is `mismatch`: a product whose composition puts it above
 * the food ceiling while a retailer sells it on a food page.
 *
 * This is a reading of a composition against a published rule. It is not legal
 * advice and it is not an allegation about any company: labels change, this
 * database is a snapshot with a date on it, and a retailer's category page is
 * not the product's licence.
 */
export const classify = (f: Formulation, sex?: Sex): Classification => {
  if (f.compositionSource === 'UNKNOWN') {
    return {
      implied: 'indeterminate', channel: f.channel, mismatch: false, exceedances: [],
      text: `Nothing is published about what is in this product, so nothing can be said about where it sits against the one-RDA ceiling. ${f.unknownBecause ?? ''}`.trim(),
      basis: CEILING_BASIS,
    };
  }
  const exceedances: Classification['exceedances'] = [];
  for (const row of f.nutrients) {
    if (row.suspect) continue;
    let n: NutrientFact;
    try { n = nutrient(row.nutrient); } catch { continue; }
    const { ref, origin } = requirement(n, sex);
    /* The ceiling is one ICMR RDA. Where ICMR sets none there is no Indian
       ceiling to be above, and an American fallback is not a substitute for
       one — so those nutrients cannot produce an exceedance here. */
    if (!ref || origin !== 'india') continue;
    const c = convert(n, row.amount * f.servingsPerDay, row.unit, row.form);
    if (!c) continue;
    if (c.amount > ref.value) {
      exceedances.push({
        nutrientId: n.id, name: n.name, amount: c.amount, unit: c.unit,
        times: Math.round((c.amount / ref.value) * 10) / 10,
        harmCapable: HARM_CAPABLE.includes(n.id),
      });
    }
  }
  exceedances.sort((a, b) => b.times - a.times);

  const above = exceedances.length > 0;
  const implied: ImpliedClass = above ? 'above-the-food-ceiling' : 'health-supplement';
  const mismatch = above && (f.channel === 'food-otc');

  const worst = exceedances[0];
  const text = !above
    ? `Every nutrient in this product sits at or below one ICMR requirement, which is where Indian food law puts the ceiling for a health supplement.`
    : mismatch
      ? `${exceedances.length} ${exceedances.length === 1 ? 'nutrient is' : 'nutrients are'} above one ICMR requirement — ${worst.name} at ${worst.times}× the highest of them. On its composition this is not a food-category health supplement, and it is being sold on one. That is a statement about a regulatory boundary, not about whether the dose will hurt you: ${worst.harmCapable ? `${worst.name} is one where excess can do harm, so read the safety line as well.` : 'the safety question is answered separately below.'}`
      : `${exceedances.length} ${exceedances.length === 1 ? 'nutrient is' : 'nutrients are'} above one ICMR requirement — ${worst.name} at ${worst.times}×. The product is sold through a drug channel, which is where a composition like this belongs.`;

  return { implied, channel: f.channel, mismatch, exceedances, text, basis: CEILING_BASIS };
};

/** Every product whose composition and sales channel disagree. The single
 *  most useful list this file produces. */
export const misclassified = (): Array<{ formulation: Formulation; classification: Classification }> =>
  ALL_FORMULATIONS
    .map((f) => ({ formulation: f, classification: classify(f) }))
    .filter((x) => x.classification.mismatch);

/** Nutrients declared by a formulation that this database cannot identify.
 *  Exposed so a spec can assert the list is empty for verified products. */
export const unmatchedNutrientIds = (): string[] => {
  const known = new Set(NUTRIENTS.map((n) => n.id));
  const bad = new Set<string>();
  for (const f of ALL_FORMULATIONS) for (const row of f.nutrients) if (!known.has(row.nutrient)) bad.add(row.nutrient);
  return [...bad];
};

export { matchNutrient, type Row };
