import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useBagActions, useBeautyBag } from '../api';
import { ProductShot } from './ProductShot';

/**
 * The bag: one summary at the foot of every beauty surface that can add to
 * it, a small bag button that follows the page, and a drawer that slides in
 * from the right with the lines in it (owner, 3 Sep: "cart drawer + checkout,
 * like a Shopify site").
 *
 * ONE BAR, ONE BAG, ONE TOTAL. There were two before — the routine had its own
 * and the market had its own, each in a React state, each with its own checkout
 * button. A citizen could be looking at "3 items · ₹2,098" on one page and "10
 * items · ₹6,009" on the other and both were true, in the sense that neither
 * was. Following a link emptied whichever one they were not looking at.
 *
 * THE SUMMARY STILL SITS AT THE FOOT OF THE PAGE, NOT ON TOP OF IT. It was
 * `position: sticky` with a heavy drop shadow, so on the routine sheet it rode
 * up the screen covering the very steps somebody was reading. A running total
 * is worth showing; it is not worth a permanent strip of the viewport on a
 * page whose whole job is a list you scroll. What follows the page now is a
 * BUTTON the size of a chip, in the corner, which covers nothing — and the
 * drawer it opens is on demand and closes on Escape, on the scrim, or on
 * "Keep shopping".
 *
 * AND CHECKOUT IS A LINK, NOT A PAYMENT SHEET. It goes to My Orders — the bag
 * laid out properly, every line with its price, the total at the foot, and the
 * wallet there. Nothing is charged until that page.
 */
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function BeautyBagBar() {
  const bag = useBeautyBag();
  const bagged = useBagActions();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const data = bag.data;

  // Escape closes; the close button takes focus when the drawer opens, so a
  // keyboard reaches the drawer it just opened.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // An emptied bag closes its own drawer rather than showing a blank one.
  useEffect(() => { if (data && data.count === 0) setOpen(false); }, [data]);

  if (!data || data.count === 0) return null;

  return (
    <>
      <div className="beauty-sheet">
       <div className="bag-foot">
        <div className="bag-foot-sum">
          <div className="bag-foot-total">{data.count} item{data.count === 1 ? '' : 's'} · {rupees(data.totalInr)}</div>
          <div className="muted bag-foot-lines">
            {data.lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ')}
          </div>
          {/* A product that has left the catalogue is named as gone rather than
              quietly subtracted from a total somebody had already read. */}
          {data.removed > 0 && (
            <div className="muted bag-foot-removed">
              {data.removed} item{data.removed === 1 ? ' is' : 's are'} no longer sold and {data.removed === 1 ? 'has' : 'have'} left your bag.
            </div>
          )}
        </div>
        <div className="bag-foot-actions">
          <Button variant="line" size="sm" onClick={() => setOpen(true)}>View bag</Button>
          <Link to="/beauty/orders">
            <Button variant="accent">Checkout · {rupees(data.totalInr)}</Button>
          </Link>
        </div>
       </div>
      </div>

      <button type="button" className="bag-fab" onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-controls="beauty-bag-drawer">
        <span aria-hidden className="bag-fab-mark">◫</span>
        <span>Bag</span>
        <span className="bag-fab-count" aria-label={`${data.count} items`}>{data.count}</span>
        <span className="bag-fab-total">{rupees(data.totalInr)}</span>
      </button>

      <div className={`bag-scrim${open ? ' is-open' : ''}`} aria-hidden={!open} onClick={() => setOpen(false)} />
      <aside id="beauty-bag-drawer" className={`bag-drawer${open ? ' is-open' : ''}`}
        role="dialog" aria-modal="true" aria-labelledby="beauty-bag-title" aria-hidden={!open}>
        <div className="bag-head">
          <h2 id="beauty-bag-title" className="bag-title">Your bag <span className="muted">({data.count})</span></h2>
          <button ref={closeRef} type="button" className="bag-close" onClick={() => setOpen(false)} aria-label="Close the bag">×</button>
        </div>

        <ul className="bag-lines">
          {data.lines.map((l) => (
            <li key={l.id} className="bag-line">
              <div className="bag-line-shot">
                <ProductShot image={l.image} imageAlt={l.imageAlt} category={l.category} size={64} />
              </div>
              <div className="bag-line-body">
                <div className="bag-line-name">{l.name}</div>
                <div className="muted bag-line-each">{rupees(l.priceInr)} each</div>
                <div className="st-qty bag-line-qty">
                  <button type="button" disabled={bagged.isSaving} onClick={() => bagged.remove(l.id)} aria-label={`One fewer ${l.name}`}>–</button>
                  <span>{l.qty}</span>
                  <button type="button" disabled={bagged.isSaving} onClick={() => bagged.add(l.id)} aria-label={`One more ${l.name}`}>+</button>
                </div>
              </div>
              <div className="bag-line-total">{rupees(l.priceInr * l.qty)}</div>
            </li>
          ))}
        </ul>

        <div className="bag-drawer-foot">
          <div className="bag-subtotal">
            <span className="st-role">Subtotal</span>
            <strong>{rupees(data.totalInr)}</strong>
          </div>
          <p className="muted bag-subtotal-note">Nothing is charged until you pay on the next page.</p>
          <Link to="/beauty/orders" className="st-add bag-checkout" onClick={() => setOpen(false)}>Checkout · {rupees(data.totalInr)}</Link>
          <button type="button" className="bag-keep" onClick={() => setOpen(false)}>Keep shopping</button>
        </div>
      </aside>
    </>
  );
}
