/**
 * ── A PHOTOGRAPH FOR A THING THAT HAS NO BARCODE ────────────────────────────
 *
 * Owner, 11 Sep: "let users add the images for the item; for now you scrape
 * the internet and add the items photos."
 *
 * The catalogue's photographs come off the barcode databases, so a packaged
 * biscuit has one and a kilo of toor dal does not — and a shop's own typed
 * lines ("Rice (Regular)", "Moong Dal") have nothing to fall back on at all.
 * This file is the fallback: ONE photograph per loose good, read off
 * Wikimedia Commons under a licence that allows it, with the file page, the
 * licence and the photographer kept on the row so every card can print who
 * took it.
 *
 * THE ORDER OF PRECEDENCE, and it is the whole honesty argument:
 *
 *      1. the shop's own photo (ServiceMenuItem.photoUrl)   — theirs, always wins
 *      2. the catalogue pack shot (GroceryProduct.imageUrl)  — the source's, cited
 *      3. this bank                                           — a STOCK photo, cited
 *
 * A stock photograph is an illustration of the KIND of thing, never a claim
 * about this shop's stock — so a card that draws one says "photo" with the
 * source under it, and the shopkeeper's own upload replaces it the moment
 * they add one from My business.
 *
 * MATCHING IS EXACT. A typed name reaches a photo only when, lowercased and
 * whitespace-collapsed, it equals one of the spellings a human wrote into
 * scripts/gen-loose-goods-photos.mjs ("toor dal", "tur dal", "arhar dal").
 * No prefix, no fuzzy, no reading the name for hints — the same rule
 * grocery.ts holds for aisles: a wrong picture under the right name is worse
 * than no picture, because the shop cannot see it happened.
 *
 * Catalogue rows match by their SOURCE REF (the Agmarknet commodity id), which
 * is stabler than a name the marketing boards respell.
 */
import { LOOSE_GOODS_PHOTOS, type LooseGoodsPhoto } from './loose-goods-photos.data';

export interface StockPhoto {
  url: string;
  /** Printed under the picture: who took it, and under what licence. */
  credit: { name: string; licence: string; url: string };
}

const byName = new Map<string, LooseGoodsPhoto>();
const byRef = new Map<string, LooseGoodsPhoto>();
for (const p of LOOSE_GOODS_PHOTOS) {
  for (const a of p.aliases) byName.set(a, p);
  for (const r of p.refs) byRef.set(`agmarknet:${r}`, p);
}

/** Lowercased, one space between words, the brackets' spacing normalised. */
export const photoKey = (name: string): string =>
  name.toLowerCase().replace(/\s*\(\s*/g, ' (').replace(/\s*\)\s*/g, ') ').replace(/\s+/g, ' ').trim();

const shape = (p: LooseGoodsPhoto): StockPhoto => ({
  url: p.url,
  credit: { name: `${p.artist ? `${p.artist} · ` : ''}Wikimedia Commons`, licence: p.licence, url: p.page },
});

/** A stock photograph for a typed line, by its exact name — or null. */
export function stockPhotoForName(name: string): StockPhoto | null {
  const p = byName.get(photoKey(name));
  return p ? shape(p) : null;
}

/** A stock photograph for a catalogue row that has none of its own — or null. */
export function stockPhotoForRef(sourceKey: string, sourceRef: string): StockPhoto | null {
  const p = byRef.get(`${sourceKey}:${sourceRef}`);
  return p ? shape(p) : null;
}

/** How many products the bank can illustrate — for the spec and the console. */
export const STOCK_PHOTO_COUNT = LOOSE_GOODS_PHOTOS.length;
