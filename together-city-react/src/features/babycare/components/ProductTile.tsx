/**
 * ── THE SHELF TILE ──────────────────────────────────────────────────────────
 *
 * Four things you compare across a grid — mark, brand, name, price — with
 * everything else one tap down. The same argument the Beauty market settled and
 * the Pet District inherited: a card that prints every fact at once is right for
 * thirteen products and unreadable across three hundred.
 *
 * WHAT THIS TILE HAS THAT NEITHER OF THOSE DOES:
 *
 * · IT ASKS PERMISSION TO BADGE. `mayAdvertise` is computed here, once, and
 *   handed to PriceLine. A restricted row shows its price and no discount, no
 *   struck-through MRP and no percentage — see ims.ts.
 * · IT NEVER CARRIES A REASON LINE. The Pet District's tile takes a `reason`
 *   prop — "picked because your dog is a senior". A reason line on a tin of
 *   formula is a recommendation, and a recommendation is a promotion. Rather
 *   than a prop with a rule attached, this tile has no such prop at all.
 *
 * THE PICTURE IS A DRAWN MARK, NOT THE RETAILER'S PHOTOGRAPH. Republishing a
 * shop's product images is a licence question nobody has answered, so the tile
 * draws a tinted initial. When a merchant agreement is signed this is one line.
 */

import { Link } from 'react-router-dom';
import type { BabyProduct } from '../types';
import { mayAdvertise } from '../ims';
import { AgeMark, CertMark, GateMark, PriceLine } from './Marks';

/** The mark: two letters of the brand on a wash. */
function Mark({ product }: { product: BabyProduct }) {
  const initials = product.brand.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean)
    .slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return (
    <div className="bc-mark" aria-hidden>
      <span>{initials || '·'}</span>
    </div>
  );
}

export function ProductTile({ product }: { product: BabyProduct }) {
  const badge = mayAdvertise(product);
  return (
    <article className="card bc-tile">
      <Link to={`/babycare/product/${product.id}`} className="bc-tile-link">
        <Mark product={product} />
        <div className="bc-tile-name">
          <span className="bc-brand">{product.brand}</span>
          <span className="bc-title">{product.name}</span>
          {product.size && <span className="bc-size">{product.size}</span>}
        </div>
      </Link>

      <PriceLine product={product} mayBadge={badge} size="sm" />

      <div className="bc-marks">
        <AgeMark product={product} />
        {product.gate && <GateMark gate={product.gate} />}
        {product.cert && <CertMark cert={product.cert} />}
      </div>
    </article>
  );
}
