import { useState } from 'react';

/**
 * A product photograph, or the best thing available instead.
 *
 * THE PICTURES ARE HOTLINKED to whichever retailer the data sheet took them
 * from — Nykaa, Tira, the brands' own Shopify stores. That makes them the least
 * reliable thing on any beauty screen: a CDN can refuse a request with no
 * referrer, a URL can rot, and a shelf of torn-corner icons reads as a broken
 * shop rather than as a missing picture.
 *
 * So the catalogue carries TWO, from different retailers, and this walks them:
 * primary, then alternate, then a mark for the category. The mark is a real
 * answer — it says what kind of thing this is — where a broken frame says only
 * that something went wrong here.
 *
 * `key={src}` on the img is what makes the walk work at all. Without it React
 * reuses the same DOM node when the src changes, and a browser that has already
 * failed on that node does not always re-fire `onError`; the fallback then
 * fires once and stops. It is one attribute and the whole mechanism.
 */

const GLYPH: Array<[RegExp, string]> = [
  [/cleanser|wash/i, '🧼'], [/toner|mist/i, '💧'], [/serum/i, '💧'],
  [/moisturiser|moisturizer|cream|lotion|balm/i, '🫙'], [/sunscreen/i, '☀️'],
  [/mask|pack/i, '🧖'], [/shampoo|conditioner/i, '🧴'], [/oil/i, '🌿'],
  [/scrub/i, '🪨'], [/lip/i, '💋'],
];
export const glyphFor = (category: string) => GLYPH.find(([m]) => m.test(category))?.[1] ?? '🧴';

export function ProductShot(
  { image, imageAlt, category, size = 62, bare = false }:
  { image?: string; imageAlt?: string; category: string; size?: number; bare?: boolean },
) {
  const sources = [image, imageAlt].filter(Boolean) as string[];
  const [tried, setTried] = useState(0);
  const src = sources[tried];
  // `bare` is the gallery tile: a large photograph standing on the page with no
  // frame at all, which is the whole look of the shop reference. The framed
  // version is the small one that sits in a row beside text.
  return (
    <span style={{
      flex: 'none', width: size, height: size, display: 'grid', placeItems: 'center', overflow: 'hidden',
      ...(bare ? {} : { borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line)' }),
    }}>
      {src
        ? <img key={src} src={src} alt="" loading="lazy" onError={() => setTried((n) => n + 1)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span aria-hidden style={{ fontSize: Math.round(size / 2.8) }}>{glyphFor(category)}</span>}
    </span>
  );
}
