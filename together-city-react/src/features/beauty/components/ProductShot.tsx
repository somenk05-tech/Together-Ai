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
  { image, imageAlt, name, category, size = 62, bare = false, fill = false }:
  { image?: string; imageAlt?: string; name?: string; category: string; size?: number; bare?: boolean; fill?: boolean },
) {
  const sources = [image, imageAlt].filter(Boolean) as string[];
  const [tried, setTried] = useState(0);
  const src = sources[tried];
  // `bare` is the gallery tile: a large photograph standing on the page with no
  // frame at all, which is the whole look of the shop reference. The framed
  // version is the small one that sits in a row beside text.
  return (
    <span style={{
      // `fill` is the routine card's well: the picture takes the whole panel it
      // is given rather than a square of a stated size. The reference the owner
      // supplied is a 210px band of white with the product centred in it, and a
      // fixed square inside a variable-width column leaves a margin down one
      // side that reads as a mistake at every breakpoint but one.
      /* A DEFINITE BOX, BY ABSOLUTE POSITIONING, AND THAT IS THE WHOLE TRICK.
         `width/height: 100%` here looks equivalent and is not: this span is a
         flex item inside the well, so its cross size is content-based, its own
         height resolves to `auto`, and every percentage the image then asks for
         has nothing to resolve against. Measured, that is a 500x1200 shot laid
         out 578px tall in a 210px well and clipped by the well's overflow.
         `inset: 0` against the well's `position: relative` gives a box whose
         height is known before the picture is measured, which is the condition
         the whole thing needed. The padding moves here with it, so the content
         box the image fills is the well's 210 less its own margin. */
      ...(fill
        ? { position: 'absolute' as const, inset: 0, padding: 16 }
        : { flex: 'none', width: size, height: size }),
      /* FLEX, NOT GRID, IN THE FILL CASE — the last link in the same chain. A
         grid whose single row is `auto` sizes that row from the item, so the
         item's own `height: 100%` is circular again and dropped, and the tall
         shot was still 578px after the box above it had been made definite. A
         flex container with a definite height resolves a child's percentage
         height against it. Same centring, one word different, and it is the
         word the measurement asked for. */
      ...(fill
        ? { display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : { display: 'grid', placeItems: 'center' }),
      overflow: 'hidden',
      ...(bare || fill ? {} : { borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--line)' }),
    }}>
      {src
        /* THE PHOTOGRAPH IS THE IDENTIFIER, so it is not decorative. The
           routine sheet's own reasoning for printing it large is that it is
           "what somebody matches against a shelf" — which is a description of
           content, and content behind `alt=""` is content a screen reader is
           told to skip. `name` is optional and absent callers are unchanged:
           a 62px thumbnail beside the product's own name IS decorative, and
           reading the name twice is worse than not reading it. */
        ? <img key={src} src={src} alt={name ?? ''} loading="lazy" onError={() => setTried((n) => n + 1)}
            className={fill ? 'no-case' : undefined}
            style={fill
              /* ONE KEYWORD, AND IT REPLACES A RULE THAT SILENTLY DID NOTHING.
                 This was `max-width/max-height: 100%` with `width/height: auto`
                 — the obvious way to say "fit, but never blow it up", and it is
                 the way that does not work here. A PERCENTAGE MAX-HEIGHT
                 RESOLVES AGAINST THE PARENT'S HEIGHT, and the parent is an
                 auto-sized grid track whose height depends on this image: the
                 reference is circular, so the browser drops the constraint
                 entirely. Measured, a 500x1200 shot rendered 578px tall in a
                 210px well and was clipped by the well's overflow — which is
                 the cropping on the live page. The width capped fine, which is
                 exactly why it looked like a cropping bug rather than a sizing
                 one.

                 `scale-down` is the property that means what the two lines were
                 trying to say: lay it out at the box size, then draw it as
                 `contain` — or at its natural size if that is smaller. No crop
                 on any aspect, no upscaling of a small retailer JPEG.

                 NO MULTIPLY. It was melting a white studio ground into cream
                 paper, and that was the wrong half of the fix: an OFF-white
                 ground multiplied against sand is a grey-green box. The well is
                 white now — the ground these were actually shot on — so there
                 is nothing left to blend away. `no-case` stays for the reason
                 the gem sheets wear it: an outline drawn round a cut-out is an
                 outline round nothing. */
              ? { width: '100%', height: '100%', objectFit: 'scale-down' }
              : { width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span aria-hidden style={{ fontSize: fill ? 40 : Math.round(size / 2.8) }}>{glyphFor(category)}</span>}
    </span>
  );
}
