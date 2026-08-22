import { GEM_BY_ID } from './gem-catalog';
import { KNOWN_DESIGNS, metalQuotes, type MetalKey } from './metal-pricing';
import { PENDANT_STYLES, RING_SETTINGS, STONE_SHAPES } from './ring-studio';
import { chosenWeight, priceAtWeight, recommendedWeight } from './gem-weight';

/**
 * The gem cart — locked configurations, priced when they are read.
 *
 * A COMMISSION IS NOT A PRODUCT ID. "1 × Blue Sapphire" is not something a
 * jeweller can make: the order is the stone, the carats the chart prescribes,
 * the cut, the mount, the metal, the size and the grade. So a line here is the
 * whole configuration, and the studio is the only thing that produces one.
 *
 * NOTHING STORED IS A PRICE. The gem rate, the gold rate, the weight model and
 * the making charge all live in files on this side; a cart carrying its own
 * totals is a cart that checks out at a number the shop no longer offers — and
 * with gold moving daily, that is not a hypothetical. Every figure is recomputed
 * at read time from the same code the studio quoted from.
 *
 * A LINE FOR A STONE THAT LEFT THE CATALOGUE IS DROPPED and counted, rather
 * than silently shortening a total somebody has already read. Same rule as the
 * Beauty bag, for the same reason.
 */

export interface GemCartLine {
  gemId: string;
  worn: 'ring' | 'pendant' | 'loose';
  shape: string;
  setting?: string;
  style?: string;
  size?: number;
  metal?: MetalKey;
  /** 0 is the plainest stone of this weight, 100 the finest. */
  grade: number;
  /**
   * THE WEIGHT THE CITIZEN CHOSE, when they chose one.
   *
   * The studio does not set this and never will: a prescription reads the
   * carats off the chart and the body weight, and a slider in that room would
   * be inviting somebody to overrule their own reading. The OPEN MARKET's gem
   * counter does set it — that floor ranks nothing and prescribes nothing, and
   * a shop that will not sell you a four-carat stone because your chart asked
   * for three is not a shop.
   *
   * Absent, and the line prices at the prescribed weight exactly as before, so
   * every commission locked from the studio is untouched by this. Present, and
   * it is still held inside the stone's own customary range by `chosenWeight` —
   * the one constraint the weight model says is never overridden.
   */
  carats?: number;
  /** ISO date, so the cart can be ordered oldest-first and read as a list. */
  addedAt: string;
}

const MAX_LINES = 12;

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const x = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(hi, Math.max(lo, x));
};

/** Whatever is in the column, turned into something that is definitely a cart. */
export function parseGemCart(raw: unknown): GemCartLine[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: GemCartLine[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const l = item as Partial<GemCartLine>;
    if (typeof l.gemId !== 'string' || !GEM_BY_ID.has(l.gemId)) continue;
    const worn = l.worn === 'pendant' || l.worn === 'loose' ? l.worn : 'ring';
    const shape = typeof l.shape === 'string' && STONE_SHAPES.some((s) => s.key === l.shape) ? l.shape : 'oval';
    const design = worn === 'ring' ? l.setting : l.style;
    out.push({
      gemId: l.gemId,
      worn,
      shape,
      setting: worn === 'ring' ? (typeof design === 'string' && KNOWN_DESIGNS.has(design) ? design : 'solitaire') : undefined,
      style: worn === 'pendant' ? (typeof design === 'string' && KNOWN_DESIGNS.has(design) ? design : 'classic') : undefined,
      size: worn === 'ring' ? clamp(l.size, 1, 40, 16) : undefined,
      metal: worn === 'loose' ? undefined
        : (l.metal === 'silver' || l.metal === 'panchdhatu' ? l.metal : 'gold22'),
      grade: clamp(l.grade, 0, 100, 35),
      /* Kept as given and bounded at PRICING time rather than here, because the
         bound belongs to the STONE and this function is deliberately ignorant
         of which stone it is looking at. A number that survives
         `Number.isFinite` is enough to keep; `chosenWeight` decides what it
         means.

         SPREAD RATHER THAN ASSIGNED, so a line with no chosen weight does not
         grow a `carats: undefined` key it never had. Every commission already
         locked in somebody's cart is the object it was, which is what
         'stores no price anywhere in a line' is really asserting. */
      ...(typeof l.carats === 'number' && Number.isFinite(l.carats) && l.carats > 0
        ? { carats: l.carats }
        : {}),
      addedAt: typeof l.addedAt === 'string' ? l.addedAt : new Date(0).toISOString(),
    });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

export interface PricedGemLine extends GemCartLine {
  name: string;
  image: string;
  imageAlt: string;
  carats: number;
  spec: string;
  stoneInr: number;
  metalInr: number;
  metalGrams: number;
  totalInr: number;
}

/**
 * Price the cart.
 *
 * TWO WAYS A LINE GETS ITS CARATS, and which one applies is a property of the
 * line rather than of the citizen. A line locked in the studio carries none, so
 * `bodyKg` decides — and a citizen who has not given one has a line that cannot
 * be priced, which the surface says rather than showing a total built on a
 * guessed weight. A line bought at the open market's counter carries the weight
 * the citizen chose, and prices from that; it needs no body weight at all,
 * which is the point of a counter.
 */
export function priceGemCart(lines: GemCartLine[], bodyKg: number | null | undefined) {
  const priced: PricedGemLine[] = [];
  let dropped = 0;
  for (const l of lines) {
    const gem = GEM_BY_ID.get(l.gemId);
    const weight = !gem
      ? null
      : l.carats !== undefined
        ? chosenWeight(l.carats, gem.planet, gem.kind)
        : recommendedWeight(bodyKg, gem.planet, gem.kind);
    if (!gem || !weight) { dropped += 1; continue; }

    const p = priceAtWeight(weight.carats, gem.perCaratMinInr, gem.perCaratMaxInr);
    const stoneInr = Math.round(p.fromInr + ((p.toInr - p.fromInr) * l.grade) / 100);

    const design = l.worn === 'ring' ? l.setting ?? 'solitaire' : l.style ?? 'classic';
    const metal = l.worn === 'loose' || !l.metal
      ? null
      : metalQuotes(l.worn, design, l.size ?? 16, weight.carats, gem.planet).find((m) => m.key === l.metal) ?? null;

    const shapeName = STONE_SHAPES.find((s) => s.key === l.shape)?.name ?? 'Oval';
    const stone = `${gem.name} · ${weight.carats} ct · ${shapeName}`;
    const spec = l.worn === 'loose'
      ? `${stone} · loose, unset`
      : l.worn === 'ring'
        ? `${stone} · ${RING_SETTINGS.find((x) => x.key === design)?.name ?? 'Solitaire'} · ${metal?.name ?? ''} (${metal?.grams ?? 0} g) · size ${l.size ?? 16}`
        : `${stone} · ${PENDANT_STYLES.find((x) => x.key === design)?.name ?? 'Classic'} pendant · ${metal?.name ?? ''} (${metal?.grams ?? 0} g)`;

    priced.push({
      ...l,
      name: gem.name, image: gem.image, imageAlt: gem.imageAlt,
      carats: weight.carats, spec,
      stoneInr,
      metalInr: metal?.priceInr ?? 0,
      metalGrams: metal?.grams ?? 0,
      totalInr: stoneInr + (metal?.priceInr ?? 0),
    });
  }
  return {
    lines: priced,
    count: priced.length,
    stoneInr: priced.reduce((n, l) => n + l.stoneInr, 0),
    metalInr: priced.reduce((n, l) => n + l.metalInr, 0),
    totalInr: priced.reduce((n, l) => n + l.totalInr, 0),
    /** Lines we could not price — a withdrawn stone, or no body weight on file. */
    dropped,
  };
}
