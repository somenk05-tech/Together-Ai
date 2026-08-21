/**
 * THE SHELF TILE.
 *
 * Four things you compare across a grid — picture, brand, name, price — and
 * everything else one tap down, which is the same argument the Beauty market
 * settled one hub over. Two additions this hub needs and that one does not:
 *
 * · A VET-GUIDANCE MARK. Prescription diets and parasiticides are in this
 *   catalogue because pet parents need to find them. They must never look like
 *   an ordinary add-to-cart, so they carry the mark on the tile, not on the
 *   product page where the decision has already been made.
 *
 * · AN UNVERIFIED-PRICE STATE. See PriceLine — twelve rows have no confirmed
 *   price and the tile says so rather than hiding them.
 *
 * THE PICTURE IS A DRAWN CASE, NOT THE RETAILER'S PHOTOGRAPH. The catalogue
 * holds the source image URL for research, and republishing it is a licensing
 * question nobody has answered yet, so the shelf draws a pack shape tinted by
 * category. When the merchant deal is signed this is a one-line change.
 */

import type { Product } from '../types';
import { PriceLine } from './PriceLine';
import { shortName } from '../engine/naming';
import { PackShot } from './PackShot';

interface Props {
  product: Product;
  onOpen: () => void;
  onAdd: () => void;
  onWishlist: () => void;
  onCompare: () => void;
  wishlisted: boolean;
  comparing: boolean;
  inCart: number;
  reason?: string | null;
}

export function ProductTile(
  { product, onOpen, onAdd, onWishlist, onCompare, wishlisted, comparing, inCart, reason }: Props,
) {
  return (
    <article
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, position: 'relative', minWidth: 0 }}
    >
      <button
        type="button"
        onClick={onWishlist}
        aria-label={wishlisted ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        aria-pressed={wishlisted}
        style={{
          // 34 → 44 with the offsets pulled in by the same five pixels, so the
          // heart stays exactly where it was drawn and only the target grows.
          // The background is transparent; nothing else on the card moves.
          position: 'absolute', top: 3, right: 3, width: 44, height: 44, borderRadius: '50%',
          border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15, lineHeight: 1,
          color: wishlisted ? 'var(--danger-ink)' : 'var(--muted)',
        }}
      >
        {wishlisted ? '♥' : '♡'}
      </button>

      <button
        type="button"
        onClick={onOpen}
        style={{
          border: 'none', background: 'var(--wash)', borderRadius: 'var(--r-2)', cursor: 'pointer',
          padding: 10, display: 'grid', placeItems: 'center', gap: 4, overflow: 'hidden',
        }}
      >
        <PackShot src={product.imageUrl} alt={product.name} category={product.category} height={128} />
        <span className="muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', textAlign: 'center' }}>
          {product.subcategory || product.category}
        </span>
      </button>

      <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
        <span className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {product.brand}
        </span>
        <button
          type="button"
          onClick={onOpen}
          style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', font: 'inherit', fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, cursor: 'pointer' }}
        >
          {shortName(product)}
        </button>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {product.packSizes[0] ?? 'Pack size not stated'}
          {product.lifeStage !== 'all' ? ` · ${product.lifeStage}` : ''}
        </span>
      </div>

      <PriceLine product={product} />

      {product.vetGuidance && (
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 'var(--r-1)', padding: '6px 9px' }}>
          Vet guidance required before use
        </p>
      )}

      {reason && (
        <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--accent-ink)' }}>Why this: </strong>{reason}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
        <button
          type="button"
          onClick={onAdd}
          className="btn btn-sm"
          style={{ flex: 1, background: inCart ? 'var(--ok-soft)' : 'var(--accent)', color: inCart ? 'var(--ok-ink)' : 'var(--on-accent)', border: 'none' }}
        >
          {inCart ? `In cart · ${inCart}` : 'Add to cart'}
        </button>
        <button
          type="button"
          onClick={onCompare}
          aria-pressed={comparing}
          className="btn btn-sm btn-line"
          style={{ paddingInline: 10, color: comparing ? 'var(--accent-ink)' : 'var(--ink-soft)' }}
        >
          {comparing ? '✓ Compare' : 'Compare'}
        </button>
      </div>
    </article>
  );
}
