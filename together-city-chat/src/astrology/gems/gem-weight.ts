import type { GemPlanet, GemKind } from './gem-types';

/**
 * How much stone, for this person — and the first version of this was wrong in
 * a way worth writing down.
 *
 * WHAT IT DID. It applied ONE rule to all thirty stones: about a ratti for every
 * ten kilos of body weight, converted at the trade's 0.91 carat to the ratti.
 * That rule is real and it is the one most often quoted, but quoted alone it is
 * a rule about the WEARER with nothing in it about the STONE. A hundred-kilo
 * citizen was therefore prescribed a NINE-CARAT BLUE SAPPHIRE — between
 * ₹1,35,000 and ₹4,50,000 of Neelam — which is not a cautious recommendation in
 * any tradition. Practice says the opposite about that stone in particular:
 * blue sapphire is worn SMALL, three to five ratti, and heavy Neelam is the
 * classic warning.
 *
 * A diamond makes the same point from the other end. Nobody is prescribed nine
 * carats of it. Venus's stone is worn at well under two ratti and the price is
 * why the tradition ever had to say so.
 *
 * ── SO THE STONE HAS A SAY ──────────────────────────────────────────────────
 *
 * Two inputs, in this order:
 *
 *   1. THE STONE'S CUSTOMARY RANGE. Each of the nine has one, and they are not
 *      close to each other: coral and hessonite are worn heavy, sapphire and
 *      diamond light. This is the constraint, and it is never overridden.
 *   2. THE BODY-WEIGHT RULE, used to place somebody INSIDE that range rather
 *      than to set the figure outright. A heavier person sits toward the top of
 *      the stone's range; a lighter one toward the bottom. Outside it, they sit
 *      at whichever end they are nearest, and the plan says so.
 *
 * A SUBSTITUTE IS WORN HEAVIER — the upratna carry the same planet at a
 * fraction of the price and the tradition compensates with mass, about three
 * quarters again. The factor is applied to the RANGE, not to the answer, so a
 * substitute is still bounded by what its own stone is worn at.
 *
 * ALL OF IT IS CUSTOM, NOT CALCULATION, AND THE PAGE SAYS SO. A chart-specific
 * weight is an astrologer's call on the whole chart. What this gives is the
 * conventional figure and the range around it, with the instruction to have it
 * confirmed before anything is commissioned.
 */

/** The trade's ratti, which is what Indian jewellers quote. 1 ratti = 0.91 ct. */
export const CT_PER_RATTI = 0.91;
/** The general rule of thumb: about one ratti for every ten kilos. */
export const KG_PER_RATTI = 10;
/** Upratna are worn at 1.5–2× the primary. The middle of the data sheet's range. */
export const SUBSTITUTE_FACTOR = 1.75;

/**
 * What each planet's stone is customarily worn at, in ratti.
 *
 * These are the conventional ranges, and the spread between them IS the point —
 * a rule that gave coral and sapphire the same weight would be ignoring the
 * thing every practitioner is most careful about.
 */
export const RATTI_RANGE: Record<GemPlanet, { min: number; max: number }> = {
  sun: { min: 3, max: 6 },        // Ruby
  moon: { min: 4, max: 11 },      // Pearl — light stone, worn generously
  mars: { min: 6, max: 12 },      // Red coral — the heaviest of the nine
  mercury: { min: 3, max: 6 },    // Emerald
  jupiter: { min: 5, max: 9 },    // Yellow sapphire
  venus: { min: 0.5, max: 2 },    // Diamond — worn small, and priced accordingly
  saturn: { min: 3, max: 5 },     // Blue sapphire — the stone practice warns about
  rahu: { min: 6, max: 11 },      // Hessonite
  ketu: { min: 3, max: 7 },       // Cat's eye
};

/** Cut and sold in quarter carats; "6.37 ct" is a number no jeweller hands you. */
const quarter = (n: number) => Math.round(n * 4) / 4;
/** Ratti are quoted in halves. */
const half = (n: number) => Math.round(n * 2) / 2;

export interface GemWeight {
  /** The figure to commission, in carats. */
  carats: number;
  /** The same, in the unit the tradition counts in. */
  ratti: number;
  /** The stone's customary range, in carats — the spread a jeweller will work in. */
  fromCt: number;
  toCt: number;
  /** That range in ratti, for the sentence that names the custom. */
  fromRatti: number;
  toRatti: number;
  /**
   * Why the figure is where it is:
   *   'placed'   the body-weight rule landed inside the stone's range
   *   'floor'    lighter than the stone is worn — set at the bottom of its range
   *   'ceiling'  heavier than the stone is worn — held at the top of its range
   */
  bound: 'placed' | 'floor' | 'ceiling';
}

/**
 * ── THE STONE'S RANGE, WITH NOBODY IN IT ────────────────────────────────────
 *
 * `recommendedWeight` needs a body weight because it PLACES somebody inside the
 * stone's range. The counter shelf does not place anybody: it hands the range
 * over and lets the citizen choose inside it. So this is the same range, minus
 * the placement — and it is the same range, computed the same way, rather than
 * a second table that could disagree with the first.
 */
export function customaryWeight(planet: GemPlanet, kind: GemKind = 'primary') {
  const base = RATTI_RANGE[planet];
  if (!base) return null;
  const factor = kind === 'primary' ? 1 : SUBSTITUTE_FACTOR;
  const min = half(base.min * factor);
  const max = half(base.max * factor);
  return {
    fromCt: quarter(min * CT_PER_RATTI),
    toCt: quarter(max * CT_PER_RATTI),
    fromRatti: min,
    toRatti: max,
  };
}

/**
 * A weight the CITIZEN chose, held inside what the stone is worn at.
 *
 * THE CLAMP IS NOT A CONVENIENCE. The stone's customary range is the one input
 * the weight model says is "the constraint, and it is never overridden" — heavy
 * Neelam is the classic warning and nine carats of it is not a thing this shop
 * will quote for because somebody dragged a slider. A request outside the range
 * comes back at the nearest end with `bound` saying which, exactly as the
 * body-weight rule already reports it, so the surface can say so rather than
 * silently pricing something else.
 *
 * QUARTER CARATS, because that is what jewellers cut and quote. A slider that
 * produced 6.37 ct would be offering a stone nobody can make.
 */
export function chosenWeight(
  carats: number | null | undefined,
  planet: GemPlanet,
  kind: GemKind = 'primary',
): GemWeight | null {
  if (typeof carats !== 'number' || !Number.isFinite(carats) || carats <= 0) return null;
  const span = customaryWeight(planet, kind);
  if (!span) return null;
  const held = Math.min(span.toCt, Math.max(span.fromCt, carats));
  const ct = quarter(held);
  return {
    carats: ct,
    ratti: half(ct / CT_PER_RATTI),
    ...span,
    bound: carats < span.fromCt ? 'floor' : carats > span.toCt ? 'ceiling' : 'placed',
  };
}

/**
 * The recommended weight, or null when no body weight is on file.
 *
 * NO AVERAGE IS SUBSTITUTED. The same refusal the ascendant gets without a
 * birth time, and for more money.
 */
export function recommendedWeight(
  bodyKg: number | null | undefined,
  planet: GemPlanet,
  kind: GemKind = 'primary',
): GemWeight | null {
  if (typeof bodyKg !== 'number' || !Number.isFinite(bodyKg) || bodyKg <= 0) return null;

  const base = RATTI_RANGE[planet];
  if (!base) return null;
  // The factor scales the RANGE, so a substitute is still bounded by what its
  // own stone is worn at rather than by a multiple of somebody's answer.
  const factor = kind === 'primary' ? 1 : SUBSTITUTE_FACTOR;
  const min = half(base.min * factor);
  const max = half(base.max * factor);

  const wanted = bodyKg / KG_PER_RATTI * factor;
  const ratti = half(Math.min(max, Math.max(min, wanted)));
  const bound = wanted < min ? 'floor' : wanted > max ? 'ceiling' : 'placed';

  return {
    carats: quarter(ratti * CT_PER_RATTI),
    ratti,
    fromCt: quarter(min * CT_PER_RATTI),
    toCt: quarter(max * CT_PER_RATTI),
    fromRatti: min,
    toRatti: max,
    bound,
  };
}

/** What that weight costs at the two ends of the stone's own price range. */
export function priceAtWeight(carats: number, perCaratMin: number, perCaratMax: number) {
  return {
    fromInr: Math.round(carats * perCaratMin),
    toInr: Math.round(carats * perCaratMax),
  };
}
