import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useGroceryCart } from '../hooks';

interface Line { name: string; qty: number; price: number }
interface CheckoutState { items?: Line[]; subtotal?: number }

/**
 * B.18 — THIS PAGE STOPS AT THE LIST NOW.
 *
 * It used to charge the city wallet. Every order wrote seven FreshDelivery rows
 * scheduled across the following week, and `cancelDelivery` existed to refund a
 * day of it. No screen in the app rendered an order, a delivery or that refund —
 * so a citizen paid, and then had nowhere to see, track or cancel what they had
 * bought.
 *
 * Three paragraphs above the Pay button, this same screen said: "We are not
 * delivering yet." It was telling the truth while the button beside it did
 * something else. The screen was right.
 *
 * WHAT IS LEFT IS WHAT THE OLD COPY ALREADY PROMISED — the list, with the
 * quantities worked out from the plan, to use on whichever service already
 * delivers to them. No payment, no address, no delivery.
 *
 * THE ADDRESS WENT WITH IT, and that is deliberate rather than incidental. It
 * was collected here and nowhere else, for a delivery that does not happen.
 * Asking a citizen where they live in order to store it against a van that is
 * not coming is the shape of dishonesty this hub has spent a fortnight
 * removing. `MasterProfile.address` therefore has no writer today; the schema
 * says so, and the hub that starts delivering is the one that earns the right
 * to ask.
 *
 * NO PRICES ARE DECIDED HERE EITHER. The line prices come from the cart the
 * planner built; the old summary's "Savings −5%" and "Delivery FREE" were
 * neither — a discount nobody offered and a delivery nobody makes.
 */

/** Your shopping list — what the plan needs, and how much of it. */
export function Checkout() {
  const { state } = useLocation() as { state: CheckoutState | null };
  const cart = useGroceryCart();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  const lines: Line[] = useMemo(() => {
    if (state?.items?.length) return state.items;
    const items = cart.data?.items;
    if (items?.length) return items.map((it) => ({ name: it.name, qty: it.qty, price: it.priceInr }));
    return [];
  }, [state, cart.data]);

  if (cart.isLoading && !state?.items?.length) return <Spinner label="Loading your list…" />;

  // The request can be refused, and an empty list is not the same claim as a
  // list we could not read. Without this branch the `!lines.length` below tells
  // a citizen whose cart failed to load that they have added nothing — which is
  // a statement about their own records that nobody checked. The navigation
  // state wins when it has the lines, because then the answer does not depend
  // on the request at all.
  if (cart.isError && !state?.items?.length) {
    return (
      <div>
        <div className="eyebrow">Shopping list</div>
        <h1 style={{ marginBottom: 10 }}>We could not load your list</h1>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          Something went wrong reading it — this is not a message that your list is empty. Try again
          in a moment, or open the grocery list to see what is on it.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button type="button" className="btn btn-accent" onClick={() => void cart.refetch()}>Try again</button>
          <Link className="btn btn-line" to="/nutrition/grocery">Open the grocery list</Link>
        </div>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div>
        <div className="eyebrow">Shopping list</div>
        <h1 style={{ marginBottom: 10 }}>Your list is empty</h1>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          Nothing has been added yet. Your grocery list is built from the meals in your plan — open
          it and add what you need.
        </p>
        <Link className="btn btn-accent" to="/nutrition/grocery" style={{ marginTop: 18 }}>Open the grocery list</Link>
      </div>
    );
  }

  const isOn = (i: number) => checked[i] ?? true;
  const kept = lines.filter((_, i) => isOn(i));
  const subtotal = kept.reduce((a, l) => a + l.price * l.qty, 0);

  const asText = kept.map((l) => `${l.name} × ${l.qty}`).join('\n');
  const copy = () => {
    void navigator.clipboard.writeText(asText).then(
      () => setCopied(true),
      // A clipboard that refuses is not an error worth a red banner — the list
      // is on screen either way. Say what happened and let them select it.
      () => setCopied(false),
    );
  };

  return (
    <div>
      <div className="eyebrow">Shopping list</div>
      <h1 style={{ marginBottom: 6 }}>What your plan needs</h1>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 22px' }}>
        Quantities are worked out from the meals in your plan. Untick anything you already have.
      </p>

      <div className="card" style={{ marginBottom: 18 }}>
        {lines.map((it, i) => (
          <label key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13, textTransform: 'capitalize' }}>
            <span>
              <input type="checkbox" checked={isOn(i)} onChange={(e) => setChecked((p) => ({ ...p, [i]: e.target.checked }))} style={{ marginRight: 10 }} />
              {it.name} × {it.qty}
            </span>
            <b>₹{it.price * it.qty}</b>
          </label>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, padding: '10px 0 0' }}>
          <span>{kept.length} item{kept.length === 1 ? '' : 's'}</span>
          <span>about ₹{subtotal.toLocaleString('en-IN')}</span>
        </div>
        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '6px 0 0' }}>
          An estimate from the planner&rsquo;s own prices, so you know roughly what the week costs.
          Nothing is charged here.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-accent btn-sm" onClick={copy}>Copy the list</button>
        <Link className="btn btn-line btn-sm" to="/nutrition/grocery">Back to the grocery list</Link>
        {copied && <span className="muted" style={{ fontSize: 12 }}>Copied.</span>}
      </div>

      {/* The sentence the old page told the truth with, now with nothing
          contradicting it on the same screen. */}
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '20px 0 0' }}>
        <b>Together City does not deliver, and does not take payment for groceries.</b> This list is
        yours to use anywhere — take it to a shop, or order it from whichever service already
        delivers to you.
      </p>
    </div>
  );
}
