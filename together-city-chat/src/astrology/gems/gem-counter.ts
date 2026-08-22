import { GEMS } from './gem-catalog';
import type { Gem, GemKind } from './gem-types';
import { customaryWeight, priceAtWeight } from './gem-weight';

/**
 * ── THE COUNTER: ALL THIRTY STONES, AND NOBODY'S CHART ──────────────────────
 *
 * Owner, 22 Aug: "create a gemstone store with all the gemstones in the
 * database … prices move based on carats chosen by the user."
 *
 * WHICH IS THE OPPOSITE END OF THIS HUB FROM `gem-recommend.ts`, ON PURPOSE.
 * That file reads a chart and answers with at most five stones, each at the
 * weight the tradition prescribes for THAT body. This one reads nothing, ranks
 * nothing and prescribes nothing: it is the counter in the open market, where
 * the citizen picks the stone and picks the weight. Keeping the two apart is
 * the same rule gem-catalog.ts opens with — "it is a catalogue, not a
 * prescription" — and it is what stops the marketplace from selling whatever is
 * nearest to hand while wearing the authority of a reading.
 *
 * ONE THING IS STILL NOT THE CITIZEN'S TO CHOOSE, and it is the only thing.
 * Every stone has a customary range and the weight model is explicit that the
 * range "is the constraint, and it is never overridden" — heavy Neelam is the
 * classic warning in every account of it. So the counter hands over the range
 * rather than a free field, and `chosenWeight` holds anything outside it at the
 * nearest end. Inside the range the citizen is free.
 *
 * NO PRICE IS STORED AND NONE IS SENT AHEAD OF THE WEIGHT. `priceAtWeight` is
 * the same function the studio and the cart quote from — carats times the
 * stone's own per-carat range — so a shelf, a studio and a till cannot end up
 * quoting three numbers for one stone.
 */

/** A stone on the counter: what it is, what it is worn at, what it costs there. */
export interface CounterStone {
  gem: Gem;
  /** The stone's customary range, which the slider spans and never leaves. */
  fromCt: number;
  toCt: number;
  fromRatti: number;
  toRatti: number;
  /**
   * Where the slider starts. The middle of the stone's own range rather than
   * its floor: opening at the cheapest weight on every tile would be a shelf
   * quietly recommending the smallest stone, which is a recommendation, and
   * this floor does not make them.
   */
  defaultCt: number;
  /** What it costs at `defaultCt` — so a tile has a price before it is touched. */
  fromInr: number;
  toInr: number;
}

/** Cut and sold in quarter carats, exactly as the weight model rounds. */
const quarter = (n: number) => Math.round(n * 4) / 4;

/**
 * THE SHELF IS SPLIT BY WHAT A STONE IS FOR, not by planet.
 *
 * Nine Navaratna, sixteen upratna, five sold with no prescription at all. That
 * is the distinction somebody browsing actually needs — a rose quartz and a
 * blue sapphire are not two options in one decision — and it is a field on the
 * row rather than a grouping invented here.
 */
export const COUNTER_AISLES: { key: GemKind; label: string }[] = [
  { key: 'primary', label: 'The Navaratna' },
  { key: 'substitute', label: 'Substitutes' },
  { key: 'wellness', label: 'Wellness' },
];

export function counterStone(gem: Gem): CounterStone | null {
  const span = customaryWeight(gem.planet, gem.kind);
  if (!span) return null;
  const defaultCt = quarter((span.fromCt + span.toCt) / 2);
  return {
    gem,
    ...span,
    defaultCt,
    ...priceAtWeight(defaultCt, gem.perCaratMinInr, gem.perCaratMaxInr),
  };
}

/**
 * The whole shelf, in the catalogue's own order.
 *
 * NOT SORTED BY PRICE OR BY ANYTHING ELSE. `GEMS` is numbered 1–30 in the
 * owner's card database and that is the order of the deck; re-sorting it here
 * would be this file having an opinion, which is the one thing it must not
 * have. A stone whose planet has no customary range drops out rather than
 * appearing without a weight — there is nowhere on a tile to say "we cannot
 * tell you what this is worn at" and still show a price.
 */
export function gemCounter() {
  const stones = GEMS.map(counterStone).filter((s): s is CounterStone => s !== null);
  return {
    stones,
    aisles: COUNTER_AISLES
      .map((a) => ({ ...a, count: stones.filter((s) => s.gem.kind === a.key).length }))
      .filter((a) => a.count > 0),
  };
}
