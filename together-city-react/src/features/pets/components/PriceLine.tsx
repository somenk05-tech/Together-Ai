/**
 * A PRICE, OR THE TRUTH ABOUT WHY THERE ISN'T ONE.
 *
 * Twelve of the 184 catalogue rows have no confirmed selling price — the
 * retailer showed a per-100 g unit rate, or a range across variants, or nothing
 * at all. Those twelve print this component's second branch. They do not print
 * a plausible number, and they do not silently disappear from the shelf, which
 * would be the other way to hide the gap.
 */

import type { Product } from '../types';
import { rupees } from '../engine/format';

export function PriceLine({ product, size = 'md' }: { product: Product; size?: 'sm' | 'md' | 'lg' }) {
  const font = size === 'lg' ? 22 : size === 'sm' ? 12.5 : 15;
  if (!product.verified.price || product.priceFrom === null) {
    return (
      <span style={{ fontSize: font * 0.72, color: 'var(--muted)', fontWeight: 600 }}>
        Price not verified at source
      </span>
    );
  }
  const off = product.mrpFrom && product.mrpFrom > product.priceFrom
    ? Math.round(((product.mrpFrom - product.priceFrom) / product.mrpFrom) * 100)
    : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <strong style={{ fontSize: font, fontWeight: 700 }}>{rupees(product.priceFrom)}</strong>
      {product.mrpFrom && product.mrpFrom > product.priceFrom && (
        <span className="muted" style={{ fontSize: font * 0.72, textDecoration: 'line-through' }}>
          {rupees(product.mrpFrom)}
        </span>
      )}
      {off !== null && off > 0 && (
        <span style={{ fontSize: font * 0.62, fontWeight: 800, color: 'var(--ok-ink)', letterSpacing: '.04em' }}>
          {off}% OFF
        </span>
      )}
    </span>
  );
}
