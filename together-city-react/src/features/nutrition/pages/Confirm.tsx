import { Link, useLocation } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';

interface ConfirmLine { name: string; qty: number; price: number }
interface ConfirmState {
  type?: 'order' | 'consultation';
  id?: string;
  items?: ConfirmLine[];
  total?: number;
}

/**
 * This page used to contradict the checkout that leads to it.
 *
 * Three separate inventions lived here. A DEMO basket — spinach and toor dal,
 * ₹1,746 — rendered whenever the page was opened without state, so anyone who
 * typed the URL or reloaded after paying saw a receipt for an order nobody had
 * placed. (The demo did not even add up: two at ₹25 and one at ₹120 is ₹170,
 * shown beside a total of ₹1,746.) An order number, #TC-GRO-88412, that the
 * checkout never passed and every real order therefore displayed. And a
 * delivery tracker frozen at "On the way", with clock times — Packed 5:45 PM,
 * Delivered 6:30–7:00 PM — that were the same for every citizen on every day.
 *
 * The tracker is the one that mattered. BE-11.2 had just made the checkout say
 * plainly that Together City does not deliver yet. A citizen read that, paid,
 * and landed on a screen telling them their groceries were packed at 5:45 and
 * are on their way. The ETA card under it went further: it asked for their
 * location and reported the distance to "your nearest store", measured from a
 * hardcoded point in Mumbai. There is no store.
 *
 * What is left is the order they actually placed, and the same sentence the
 * checkout told them.
 */

/** Order Confirmed — what was ordered, and what happens to it next. */
export function Confirm() {
  const { state } = useLocation() as { state: ConfirmState | null };
  const items = state?.items;
  const total = state?.total;

  if (!items || items.length === 0 || total == null) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
        <EmptyState
          title="There's no order to show here"
          hint="This page shows an order the moment you place it. If you've just paid and landed here after a reload, the order is safe — it's recorded against your account and charged once."
        />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 24, justifyContent: 'center' }}>
          <Link to="/nutrition/grocery"><Button variant="line">Back to Grocery Lists</Button></Link>
          <Link to="/nutrition/weekly"><Button variant="accent">Continue to Meal Planner →</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="card center" style={{ padding: '44px 30px' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, margin: '0 auto 18px',
        }}>✓</div>
        <h1 style={{ marginBottom: 8 }}>Order confirmed</h1>
        <p className="muted">
          {state?.id ? <>Order <b>{state.id}</b> · </> : null}
          {items.length} item{items.length === 1 ? '' : 's'} · ₹{total.toLocaleString('en-IN')}
        </p>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--line)', textTransform: 'capitalize' }}>
            <span>{it.name} × {it.qty}</span><b>₹{it.price * it.qty}</b>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', fontWeight: 700 }}>
          <span>Total</span><span>₹{total.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24, border: '1px solid var(--accent)' }}>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>What happens next</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, marginTop: 6 }}>
          <b>We are not delivering yet</b> — no van is on its way, and we would rather say so than
          show you a tracker that means nothing. Your address is saved, and you will be told the day
          delivery starts in your area. There is nothing to sign up for.
        </p>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.65, marginTop: 8 }}>
          Your list is above with the quantities already worked out, so you can order it from
          whichever service already delivers to you — or take it to the shop as it is.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 28, justifyContent: 'center' }}>
        <Link to="/nutrition/grocery"><Button variant="line">Back to Grocery Lists</Button></Link>
        <Link to="/nutrition/weekly"><Button variant="accent">Continue to Meal Planner →</Button></Link>
      </div>
    </div>
  );
}
