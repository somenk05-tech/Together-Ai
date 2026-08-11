import { GEM_BY_ID } from './gem-catalog';
import { KNOWN_DESIGNS, metalQuotes, type MetalKey } from './metal-pricing';
import { PENDANT_STYLES, RING_SETTINGS, STONE_SHAPES } from './ring-studio';
import { priceAtWeight, recommendedWeight } from './gem-weight';

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
 * Price the cart. `bodyKg` decides the carats, so a citizen who has not given
 * one has a cart that cannot be priced — and the surface says that rather than
 * showing a total built on a guessed weight.
 */
export function priceGemCart(lines: GemCartLine[], bodyKg: number | null | undefined) {
  const priced: PricedGemLine[] = [];
  let dropped = 0;
  for (const l of lines) {
    const gem = GEM_BY_ID.get(l.gemId);
    const weight = gem ? recommendedWeight(bodyKg, gem.planet, gem.kind) : null;
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
