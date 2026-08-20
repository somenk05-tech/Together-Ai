/**
 * How many grams are in a pack, read off the pack label the retailer printed.
 *
 * Its own file now: it used to live in `subscription.ts`, and when the repeat-
 * delivery room was removed the price-per-kg column on the comparison table
 * would have gone with it. A helper two features share belongs to neither.
 */

/** '3kg', '1.2 kg', '480g', '14x80g' → grams. Null when the label is unclear. */
export function packGrams(pack: string | null): number | null {
  if (!pack) return null;
  const multi = pack.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g)/i);
  if (multi) {
    const each = parseFloat(multi[2]) * (multi[3].toLowerCase() === 'kg' ? 1000 : 1);
    return Math.round(parseInt(multi[1], 10) * each);
  }
  const one = pack.match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  if (!one) return null;
  return Math.round(parseFloat(one[1]) * (one[2].toLowerCase() === 'kg' ? 1000 : 1));
}
