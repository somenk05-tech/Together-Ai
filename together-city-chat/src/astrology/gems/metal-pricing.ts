import { PENDANT_STYLES, RING_SETTINGS } from './ring-studio';
import type { GemPlanet } from './gem-types';
import { WEARING } from './wearing';

/**
 * What the metal costs — and the two things that make this dangerous.
 *
 * A GOLD PRICE GOES STALE IN A DAY. Twenty-two carat gold moved by a fifth
 * across 2025 alone, and a hard-coded rate in a deployed file is a shop quoting
 * last quarter's price with total confidence. So the rates are READ FROM THE
 * ENVIRONMENT first and fall back to a dated constant, which means they can be
 * corrected in a minute without a deploy — and `asOf` travels with them so the
 * staleness is visible to us rather than only to the citizen's bank.
 *
 *     GOLD_22K_INR_PER_G · SILVER_INR_PER_G · PANCHDHATU_INR_PER_G
 *
 * The fallbacks are indicative and dated, exactly like the gem prices in the
 * owner's data sheet, and like those they are to be replaced by a live feed
 * before launch. This file is where that feed lands.
 *
 * THE MAKING CHARGE IS INCLUDED AND NOT ITEMISED. Fifteen per cent, folded into
 * the quoted metal price, at the owner's instruction — which is ordinary
 * jewellery retail practice: the price shown is the price paid and nothing is
 * added at checkout. It is documented HERE so that nobody later "fixes" the
 * quote by adding a making charge on top of one that already contains it. That
 * mistake would be invisible in the code and obvious on the invoice.
 */

/** Indicative, August 2026, to be replaced by a supplier feed. */
const FALLBACK = {
  gold22: 9_000,
  silver: 110,
  panchdhatu: 900,
  asOf: '2026-08-01',
};

const fromEnv = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

/** Rupees per gram, and the day the figure is good for. */
export const metalRates = () => ({
  gold22: fromEnv('GOLD_22K_INR_PER_G', FALLBACK.gold22),
  silver: fromEnv('SILVER_INR_PER_G', FALLBACK.silver),
  panchdhatu: fromEnv('PANCHDHATU_INR_PER_G', FALLBACK.panchdhatu),
  asOf: process.env.METAL_RATES_AS_OF ?? FALLBACK.asOf,
});

/** Fifteen per cent, inside the quoted price. Never shown as a line. */
export const MAKING_CHARGE = 0.15;

export type MetalKey = 'gold22' | 'silver' | 'panchdhatu';

export const METAL_NAME: Record<MetalKey, string> = {
  gold22: '22 carat gold',
  silver: 'Silver',
  panchdhatu: 'Panchdhatu',
};

/**
 * HOW MUCH METAL A PIECE TAKES, and this is an estimate that says so.
 *
 * Three things drive it and all three are real: the MOUNT (a cluster carries
 * far more gold than a solitaire), the SIZE (a size 22 band is meaningfully
 * more metal than a size 8), and the STONE (a big gem needs a bigger seat). The
 * numbers are workshop averages for a plain shank; a jeweller's own quote will
 * differ, which is why the studio says the piece is confirmed before work
 * starts.
 */
const RING_BASE_G: Record<string, number> = {
  solitaire: 3.5, bezel: 4, halo: 5, 'three-stone': 4.5,
  cluster: 6, eternity: 6.5, 'split-shank': 4.5, tension: 4,
};

const PENDANT_BASE_G: Record<string, number> = {
  minimal: 2, classic: 2.5, traditional: 4, contemporary: 3,
};

/** Size 12 is the middle of the Indian chart, so it is the neutral point. */
const SIZE_PIVOT = 12;

export function metalGrams(
  worn: 'ring' | 'pendant',
  design: string,
  sizeIndian: number,
  carats: number,
): number {
  const base = worn === 'ring'
    ? RING_BASE_G[design] ?? 3.5
    : PENDANT_BASE_G[design] ?? 2.5;
  // Only a ring is sized to a finger; a pendant hangs the same on everybody.
  const sizeFactor = worn === 'ring' ? 1 + (sizeIndian - SIZE_PIVOT) * 0.035 : 1;
  // A bigger stone needs a bigger seat, and only above the size a plain mount
  // already allows for.
  const forStone = Math.max(0, carats - 3) * 0.25;
  return Math.round((base * Math.max(0.6, sizeFactor) + forStone) * 10) / 10;
}

export interface MetalQuote {
  key: MetalKey;
  name: string;
  grams: number;
  /** Making charge included. There is nothing to add at checkout. */
  priceInr: number;
  /** True where the wearing table names this metal for the stone's planet. */
  traditional: boolean;
}

/** Does the tradition name this metal for this planet? Read from the one
 *  wearing table rather than guessed from the stone's colour. */
const isTraditional = (metal: MetalKey, planet: GemPlanet): boolean => {
  const said = WEARING[planet].metal.toLowerCase();
  return metal === 'gold22' ? said.includes('gold')
    : metal === 'silver' ? said.includes('silver') || said.includes('platinum')
      : said.includes('panchdhatu') || said.includes('ashtadhatu');
};

/** The three options, priced, for one design. */
export function metalQuotes(
  worn: 'ring' | 'pendant',
  design: string,
  sizeIndian: number,
  carats: number,
  planet: GemPlanet,
): MetalQuote[] {
  const rates = metalRates();
  const grams = metalGrams(worn, design, sizeIndian, carats);
  return (['gold22', 'silver', 'panchdhatu'] as MetalKey[]).map((key) => ({
    key,
    name: METAL_NAME[key],
    grams,
    priceInr: Math.round(grams * rates[key] * (1 + MAKING_CHARGE)),
    traditional: isTraditional(key, planet),
  }));
}

/** Every design key the studio can send, so a bad one is caught rather than
 *  quietly priced as a solitaire. */
export const KNOWN_DESIGNS = new Set([
  ...RING_SETTINGS.map((s) => s.key),
  ...PENDANT_STYLES.map((s) => s.key),
]);
