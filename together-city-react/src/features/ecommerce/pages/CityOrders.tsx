import { EmptyState, Spinner } from '@/components/ui';
import { HUBS } from '@/config/hubs';
import { useHubTheme } from '@/hooks/useHubTheme';
import { useBeautyOrders, type OrderAddress } from '@/features/beauty/api';
import { useOrders } from '@/api/store.api';
import { FloorPage } from '../store/Floor';
import { useCityCart } from '../store/useCityCart';

/**
 * ── YOUR ORDERS — EVERYTHING BOUGHT, ONE LIST ───────────────────────────────
 *
 * Owner, 7 Sep: "create a page for all past orders", then: "make the orders
 * collapsible and expandable based on the date, and fix the page
 * aesthetically as a UI/UX designer."
 *
 * The fourth room of the district and, like the cart, a VIEW rather than a
 * fourth ledger: the Beauty market's orders and the Fitness store's orders,
 * each still kept by the hub that took the money, read here together.
 * Nothing is stored on this page; every number on a receipt is the
 * receipt's own, priced on the day it was paid. The three figures in the
 * strip under the masthead — how many orders, across how many shops, and
 * what they came to — are those receipts added up and nothing more.
 *
 * ── A DAY IS THE UNIT ───────────────────────────────────────────────────────
 *
 * Orders are grouped by the day they were placed, newest day first, and each
 * day folds. A native <details> rather than state: the browser remembers
 * nothing, needs no script to open and close, reads correctly to a screen
 * reader, and prints expanded. Only the latest day is open on arrival — the
 * question somebody comes here with is "what did I just buy", and the older
 * days are one press away without scrolling past them.
 *
 * Under a day, each order is a card: which shop and which hub, a status
 * pill, the total, the lines, and — when the order kept one — the door it
 * went to, from the snapshot taken at checkout (7 Sep). An order placed
 * before the store asked for a door has none, and says nothing rather than
 * guessing.
 *
 * GEM COMMISSIONS ARE NOT HERE, on purpose: they are quoted, not charged
 * (owner, 5 Sep), and a quote is not an order until somebody has priced it
 * and the citizen has said yes. When that exists it joins this list.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const ROOM = HUBS.ecommerce.items[3];

interface Row {
  key: string;
  shop: string;
  hubName: string;
  createdAt: string;
  status: string;
  totalInr: number;
  items: { id: string; name: string; priceInr: number; qty: number }[];
  address: OrderAddress | null;
}

interface Day { key: string; date: Date; orders: Row[]; totalInr: number }

/** The city's calendar day for an instant — the day the citizen saw it placed. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayWord(d: Date): { head: string; sub: string } {
  const today = dayKey(new Date().toISOString());
  const yest = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const key = dayKey(d.toISOString());
  const long = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (key === today) return { head: 'Today', sub: long };
  if (key === yest) return { head: 'Yesterday', sub: long };
  return { head: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }), sub: d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric' }) };
}

function timeWord(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

const STATUS: Record<string, string> = { placed: 'Placed', cancelled: 'Cancelled' };

function groupByDay(rows: Row[]): Day[] {
  const days = new Map<string, Day>();
  for (const o of rows) {
    const key = dayKey(o.createdAt);
    const day = days.get(key) ?? { key, date: new Date(o.createdAt), orders: [], totalInr: 0 };
    day.orders.push(o);
    day.totalInr += o.totalInr;
    days.set(key, day);
  }
  return [...days.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function CityOrders() {
  useHubTheme(null);
  const cart = useCityCart();
  const beauty = useBeautyOrders();
  const fitness = useOrders();
  const floor = { path: ROOM.path, tabs: null, cart };

  if (beauty.isLoading || fitness.isLoading) {
    return (
      <FloorPage floor={floor} baglet={false}>
        <div className="st-wait"><Spinner label="Reading your orders…" /></div>
      </FloorPage>
    );
  }

  const rows: Row[] = [
    ...(beauty.data ?? []).map((o): Row => ({
      key: `beauty-${o.id}`, shop: HUBS.beauty.items.find((i) => i.path === '/beauty/market')?.label ?? HUBS.beauty.name,
      hubName: HUBS.beauty.name, createdAt: o.createdAt, status: o.status, totalInr: o.totalInr, items: o.items, address: o.address ?? null,
    })),
    ...(fitness.data ?? []).map((o): Row => ({
      key: `fitness-${o.id}`, shop: HUBS.fitness.items.find((i) => i.path === '/fitness/store')?.label ?? HUBS.fitness.name,
      hubName: HUBS.fitness.name, createdAt: o.createdAt, status: o.status, totalInr: o.totalInr, items: o.items, address: o.address ?? null,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const days = groupByDay(rows);
  const shops = new Set(rows.map((o) => o.shop)).size;
  const spent = rows.reduce((n, o) => n + o.totalInr, 0);
  const failed = beauty.isError || fitness.isError;

  return (
    <FloorPage floor={floor} baglet={false}>
      <header className="st-head sf-head sf-orders-head">
        <div>
          <div className="st-eyebrow">{HUBS.ecommerce.name}</div>
          <h1 className="st-title">{ROOM.label}</h1>
          <p className="st-line">{ROOM.sub}</p>
        </div>
        {rows.length > 0 && (
          <dl className="sf-stats" aria-label="In all">
            <div className="sf-stat"><dt>Orders</dt><dd>{rows.length}</dd></div>
            <div className="sf-stat"><dt>{shops === 1 ? 'Shop' : 'Shops'}</dt><dd>{shops}</dd></div>
            <div className="sf-stat"><dt>Spent</dt><dd>{rupees(spent)}</dd></div>
          </dl>
        )}
      </header>

      <div className="sf-orders">
        {failed && (
          <p className="st-blocked">
            One of the shops could not be read just now — what is shown is only what answered. Try again in a moment.
          </p>
        )}

        {rows.length === 0 && !failed ? (
          <EmptyState
            title="Nothing bought yet"
            hint="Every order from any shop in the city will be listed here, with what it cost and where it went."
          />
        ) : (
          days.map((day, i) => {
            const w = dayWord(day.date);
            return (
              <details key={day.key} className="sf-day" open={i === 0}>
                <summary className="sf-day-head">
                  <span className="sf-day-when">
                    <span className="sf-day-date">{w.head}</span>
                    <span className="sf-day-sub">{w.sub}</span>
                  </span>
                  <span className="sf-day-sum">
                    <span className="sf-day-n">{day.orders.length} order{day.orders.length === 1 ? '' : 's'}</span>
                    <span className="sf-day-total">{rupees(day.totalInr)}</span>
                  </span>
                  <span className="fold-state" aria-hidden />
                </summary>

                <div className="sf-day-body">
                  {day.orders.map((o) => (
                    <article key={o.key} className="sf-order">
                      <div className="sf-order-head">
                        <div className="sf-order-who">
                          <span className="sf-order-shop">{o.shop}</span>
                          <span className="sf-order-meta">{o.hubName} · {timeWord(o.createdAt)}</span>
                        </div>
                        <span className={`sf-pill${o.status === 'cancelled' ? ' is-off' : ''}`}>{STATUS[o.status] ?? o.status}</span>
                        <span className="sf-order-total">{rupees(o.totalInr)}</span>
                      </div>
                      <ul className="sf-order-lines">
                        {o.items.map((l) => (
                          <li key={`${o.key}-${l.id}`} className="sf-order-line">
                            <span className="sf-order-qty">{l.qty}×</span>
                            <span className="sf-order-name">{l.name}</span>
                            <span className="sf-order-price">{rupees(l.priceInr * l.qty)}</span>
                          </li>
                        ))}
                      </ul>
                      {o.address && (
                        <p className="sf-order-door">
                          <span className="sf-order-door-k">To</span>
                          <span className="sf-order-door-v">
                            <b>{o.address.name ?? o.address.label}</b> — {o.address.addressText}
                            {o.address.phone ? ` · ${o.address.phone}` : ''}
                          </span>
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </details>
            );
          })
        )}
      </div>
    </FloorPage>
  );
}
