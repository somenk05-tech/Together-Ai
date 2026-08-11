/**
 * How much stone, for this person.
 *
 * THE QUESTION EVERY GEM PAGE HAS TO ANSWER AND MOST DO NOT. A price per carat
 * is not a price. "₹8,000 – ₹25,000 per carat" tells somebody nothing about
 * what they are about to spend until they know how many carats their own chart
 * asks for — and the answer is not a property of the stone, it is a property of
 * the wearer.
 *
 * THE RULE IS THE TRADITION'S, NOT OURS, AND IT IS NAMED ON THE PAGE. The
 * convention cited across Indian gem astrology is roughly ONE RATTI PER TEN
 * KILOS of body weight, and the data sheet fixes the conversion this app uses
 * at 1 ratti ≈ 0.91 carat. So a seventy-kilo person is prescribed about seven
 * ratti, which is about 6.4 carats, which this rounds down to 6.25 — quarter-carat steps, because
 * that is how stones are cut and sold.
 *
 * It is a rule of thumb and the page says so. A qualified astrologer looking at
 * the whole chart may set a different weight, and nothing here pretends
 * otherwise — the sheet gives the figure, the tradition it comes from, and the
 * sentence saying to have it confirmed.
 *
 * NO BODY WEIGHT MEANS NO FIGURE. Not an average, not a default, not "most
 * people wear five carats" — the same refusal the ascendant gets when there is
 * no birth time. A number invented on somebody's behalf here is the difference
 * between a ₹50,000 stone and a ₹90,000 one.
 *
 * A SUBSTITUTE IS WORN HEAVIER. The upratna carry the same planet at a
 * fraction of the price and the tradition compensates with mass — the data
 * sheet gives 1.5 to 2 times the primary's weight, and this takes the middle of
 * that. It is the reason a "cheaper" stone is not as much cheaper as its per-
 * carat price suggests, and the sheet shows the arithmetic rather than letting
 * somebody discover it at the counter.
 */

/** The data sheet's own conversion. 1 ratti ≈ 0.91 ct. */
export const CT_PER_RATTI = 0.91;
/** The tradition's rule of thumb: one ratti for every ten kilos. */
export const KG_PER_RATTI = 10;
/** Upratna are worn at 1.5–2× the primary. The middle of the sheet's range. */
export const SUBSTITUTE_FACTOR = 1.75;

/** Nothing is prescribed under two carats or over eleven, whatever the
 *  arithmetic says — below the first it is jewellery, above the second it is a
 *  commission rather than a recommendation. */
const MIN_CT = 2;
const MAX_CT = 11;

/** Quarter-carat steps: stones are cut and sold in them, and "6.37 ct" is a
 *  number no jeweller will hand you. */
const quarter = (n: number) => Math.round(n * 4) / 4;

export interface GemWeight {
  /** What the rule gives for this person, in carats. */
  carats: number;
  /** The same figure in the unit the tradition actually counts in. */
  ratti: number;
  /** The workable spread around it — a stone half a carat either side is the
   *  same prescription, and insisting on an exact figure sends people hunting. */
  fromCt: number;
  toCt: number;
  /** True when the rule was clamped, so the page can say so rather than
   *  quietly presenting a floor as a calculation. */
  clamped: boolean;
}

/**
 * The recommended weight for a body weight in kilos, or null if we were not
 * told one.
 *
 * `factor` carries the substitute multiplier; it is 1 for a primary stone.
 */
export function recommendedWeight(bodyKg: number | null | undefined, factor = 1): GemWeight | null {
  if (typeof bodyKg !== 'number' || !Number.isFinite(bodyKg) || bodyKg <= 0) return null;
  const raw = (bodyKg / KG_PER_RATTI) * CT_PER_RATTI * factor;
  const carats = quarter(Math.min(MAX_CT, Math.max(MIN_CT, raw)));
  return {
    carats,
    ratti: Math.round((carats / CT_PER_RATTI) * 4) / 4,
    fromCt: quarter(Math.max(MIN_CT, carats - 0.5)),
    toCt: quarter(Math.min(MAX_CT, carats + 0.5)),
    clamped: quarter(raw) !== carats,
  };
}

/** What that weight costs at the two ends of the stone's own price range. */
export function priceAtWeight(carats: number, perCaratMin: number, perCaratMax: number) {
  return {
    fromInr: Math.round(carats * perCaratMin),
    toInr: Math.round(carats * perCaratMax),
  };
}
