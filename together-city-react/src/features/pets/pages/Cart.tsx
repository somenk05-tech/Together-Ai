/**
 * ── THE BAG ─────────────────────────────────────────────────────────────────
 *
 * A cart that can hold a line it cannot price, because twelve catalogue rows
 * have no verified price. Those lines are counted, shown, and EXCLUDED from the
 * total, with the total labelled as partial. The alternative — quietly dropping
 * them, or pricing them at zero — is how a basket total becomes a lie.
 */

import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/States';
import { rupees } from '../engine/format';
import { SectionTitle } from './PetsHome';
import { useProductsByIds } from '../api';
import { usePets } from '../store';
import { shortName } from '../engine/naming';
import { PackShot } from '../components/PackShot';

export function Cart() {
  const nav = useNavigate();
  const cart = usePets((s) => s.cart);
  const setCartQty = usePets((s) => s.setCartQty);
  const clearCart = usePets((s) => s.clearCart);
  const { data: products } = useProductsByIds(cart.map((l) => l.productId));

  if (cart.length === 0) {
    return <Empty glyph="🛍️" title="Your bag is empty" line="The shopping list from your pet’s meal plan is the fastest way to fill it." action={<div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn" onClick={() => nav('/pets/shop')}>Browse the shop</button><button type="button" className="btn btn-line" onClick={() => nav('/pets/monthly')}>Open shopping list</button></div>} />;
  }

  const lines = cart.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    const variant = product?.variants[line.variantIndex] ?? product?.variants[0] ?? null;
    return { line, product, variant, priced: Boolean(variant?.priceInr) };
  }).filter((l) => l.product);

  const total = lines.reduce((sum, l) => sum + (l.variant?.priceInr ?? 0) * l.line.qty, 0);
  const unpriced = lines.filter((l) => !l.priced).length;

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 820 }}>
      <SectionTitle title="Your bag" line={`${lines.length} line${lines.length === 1 ? '' : 's'}`} action={<button type="button" className="btn btn-sm btn-line" onClick={clearCart}>Empty bag</button>} />

      <div style={{ display: 'grid', gap: 10 }}>
        {lines.map(({ line, product, variant, priced }) => (
          <article key={`${line.productId}-${line.variantIndex}`} className="card" style={{ display: 'flex', gap: 14, padding: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 56, flexShrink: 0 }}>
              <PackShot src={product!.imageUrl} alt={product!.name} category={product!.category} height={56} drawnSize={40} />
            </div>
            <div style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 2 }}>
              <span className="muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{product!.brand}</span>
              <button type="button" onClick={() => nav(`/pets/shop/${product!.id}`)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>
                {shortName(product!)}
              </button>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {variant?.pack ?? 'standard pack'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="btn btn-sm btn-line" onClick={() => setCartQty(line.productId, line.variantIndex, line.qty - 1)} aria-label="Reduce quantity">−</button>
              <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{line.qty}</span>
              <button type="button" className="btn btn-sm btn-line" onClick={() => setCartQty(line.productId, line.variantIndex, line.qty + 1)} aria-label="Increase quantity">+</button>
            </div>
            <strong style={{ minWidth: 92, textAlign: 'right', fontSize: 14, color: priced ? 'inherit' : 'var(--muted)' }}>
              {priced ? rupees((variant!.priceInr ?? 0) * line.qty) : 'price not verified'}
            </strong>
          </article>
        ))}
      </div>

      <div className="card" style={{ padding: 18, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{unpriced ? 'Partial total' : 'Total'}</span>
          <strong style={{ fontSize: 26, fontWeight: 700 }}>{rupees(total)}</strong>
        </div>
        {unpriced > 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
            {unpriced} line{unpriced === 1 ? '' : 's'} in this bag had no confirmed price on the source listing and
            {unpriced === 1 ? ' is' : ' are'} not included in that figure. They are still in the bag — we would rather
            show you an incomplete total than a confident wrong one.
          </p>
        )}
        <button type="button" className="btn" style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }} disabled>
          Checkout — connects to Together City Pay
        </button>
        <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
          Checkout is not wired in this build. Payments belong to the city’s existing Pay service rather than to a
          second implementation inside this hub.
        </p>
      </div>
    </div>
  );
}
