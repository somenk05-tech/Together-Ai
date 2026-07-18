import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hero, Button, Pill } from '@/components/ui';

/**
 * My Orders — Family (family-orders.html). Every grocery and meal order across
 * the family, filterable per member. There's no family-scoped orders endpoint,
 * so — as in the vanilla site — this is a faithful static ledger with a local
 * member filter.
 */
type Status = 'transit' | 'delivered' | 'prep' | 'logged';
interface FamilyOrder { who: string; initial: string; title: string; sub: string; status: Status; label: string; amount: string }

const ORDERS: FamilyOrder[] = [
  { who: 'Somen', initial: 'S', title: 'Family Grocery Basket — 27 items', sub: 'Ordered by Somen · Today, 8:10 AM', status: 'transit', label: 'On the way', amount: '₹1,842' },
  { who: 'Papa', initial: 'P', title: 'Chole with Quinoa Pulao — Green Bowl Kitchen', sub: 'Ordered by Papa · Yesterday, 1:15 PM', status: 'delivered', label: 'Delivered', amount: '₹320' },
  { who: 'Ananya', initial: 'A', title: 'Vegetable Poha with Peanuts — home-cooked', sub: 'Logged by Ananya · Yesterday, 8:05 AM', status: 'logged', label: 'Logged', amount: '₹35' },
  { who: 'Maa', initial: 'M', title: 'Weekly Grocery Basket — 24 items', sub: 'Ordered by Maa · 3 days ago', status: 'delivered', label: 'Delivered', amount: '₹1,610' },
  { who: 'Somen', initial: 'S', title: 'Grilled Chicken Quinoa Bowl — Green Bowl Kitchen', sub: 'Ordered by Somen · 4 days ago', status: 'prep', label: 'Preparing', amount: '₹390' },
];

const STATUS_STYLE: Record<Status, React.CSSProperties> = {
  transit: { background: 'rgba(176,141,62,.16)', color: '#b9770e' },
  delivered: { background: 'rgba(46,125,79,.16)', color: '#2e7d4f' },
  logged: { background: 'rgba(46,125,79,.16)', color: '#2e7d4f' },
  prep: { background: 'rgba(90,110,255,.12)', color: '#5a6eff' },
};

const FILTERS = ['all', 'Somen', 'Ananya', 'Papa', 'Maa'];
const SPEND = [
  { name: 'Somen', amount: '₹2,180 this month' },
  { name: 'Papa', amount: '₹1,540 this month' },
  { name: 'Maa', amount: '₹1,610 this month' },
  { name: 'Ananya', amount: '₹910 this month' },
];

export function FamilyOrders() {
  const [who, setWho] = useState('all');
  const visible = ORDERS.filter((o) => who === 'all' || o.who === who);

  return (
    <div>
      <Hero image="/assets/img/nutrition-hub--main-pages--individual--6.-my-orders.webp" eyebrow="Family Nutrition · 05"
        title="My Orders"
        sub="Every grocery and meal order across the family, in one place."
        objectPosition="center 42%" />

      <div className="pill-row" style={{ marginBottom: 24 }}>
        {FILTERS.map((f) => (
          <Pill key={f} active={who === f} onClick={() => setWho(f)}>{f === 'all' ? 'All' : f}</Pill>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div className="card">
          {visible.map((o, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 4px', borderBottom: i === visible.length - 1 ? 'none' : '1px solid var(--line)' }}>
              <div className="av">{o.initial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{o.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>{o.sub}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 11px', whiteSpace: 'nowrap', ...STATUS_STYLE[o.status] }}>{o.label}</span>
              <span style={{ fontWeight: 600 }}>{o.amount}</span>
            </div>
          ))}
          {visible.length === 0 && <p className="muted" style={{ padding: '16px 4px' }}>No orders for this member yet.</p>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="stat"><div className="lab">This Month</div><div className="val">₹6,240</div></div>
            <div className="stat"><div className="lab">Orders</div><div className="val">18</div></div>
            <div className="stat"><div className="lab">Groceries</div><div className="val">₹4,290</div></div>
            <div className="stat"><div className="lab">Meals Out</div><div className="val">₹1,950</div></div>
          </div>
          <div className="card">
            <h4>Per Member Spend</h4>
            <div className="rows" style={{ marginTop: 12 }}>
              {SPEND.map((s) => (
                <div key={s.name} className="row" style={{ boxShadow: 'none', padding: '10px 12px' }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{s.name}</div><div className="muted" style={{ fontSize: 12 }}>{s.amount}</div></div>
                </div>
              ))}
            </div>
          </div>
          <Link to="/family/grocery"><Button variant="gold" style={{ width: '100%', justifyContent: 'center' }}>Order Groceries Again →</Button></Link>
        </div>
      </div>
    </div>
  );
}
