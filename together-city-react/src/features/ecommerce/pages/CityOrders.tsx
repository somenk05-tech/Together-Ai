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
 * Owner, 7 Sep: "create a page for all past orders."
 *
 * The fourth room of the district and, like the cart, a VIEW rather than a
 * fourth ledger: the Beauty market's orders and the Fitness store's orders,
 * each still kept by the hub that took the money, read here together and
 * sorted newest first. Nothing is stored on this page and nothing is summed
 * here — every number is the receipt's own, priced on the day it was paid.
 *
 * EACH ORDER SAYS WHICH SHOP, WHEN, WHAT, HOW MUCH, AND WHERE IT WENT. The
 * door is the snapshot the order kept at checkout (7 Sep), not the book as
 * it stands today — a receipt for a parcel already sent must still say where
 * it went. An order placed before the store asked for a door has none, and
 * says nothing rather than guessing.
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

function when(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CityOrders() {
  useHubTheme(null);
  const cart = useCityCart();
  const beauty = useBeautyOrders();
  const fitness = useOrders();
  const floor = { path: ROOM.path, tabs: null, cart };

  if (beauty.isLoading || fitness.isLoading) {
    return (
      <FloorPage floor={floor}>
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

  const failed = beauty.isError || fitness.isError;

  return (
    <FloorPage floor={floor}>
      <header className="st-head sf-head">
        <div className="st-eyebrow">{HUBS.ecommerce.name}</div>
        <h1 className="st-title">{ROOM.label}</h1>
        <p className="st-line">{ROOM.sub}</p>
      </header>
      <div className="st-bag">
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
          rows.map((o) => (
            <section key={o.key} className="st-section sf-order">
              <div className="st-section-head">
                <span className="st-sum-label">{o.shop}</span>
                <span className="st-brand">{o.hubName} · {when(o.createdAt)} · {o.status}</span>
                <span className="st-row-sum">{rupees(o.totalInr)}</span>
              </div>
              <div className="st-lines">
                {o.items.map((l) => (
                  <div key={`${o.key}-${l.id}`} className="st-row">
                    <span className="st-row-name">
                      <span className="st-name">{l.name}</span>
                      <span className="st-brand">{l.qty} × {rupees(l.priceInr)}</span>
                    </span>
                    <span className="st-row-sum">{rupees(l.priceInr * l.qty)}</span>
                  </div>
                ))}
              </div>
              {o.address && (
                <p className="st-section-foot sf-order-door">
                  To <b>{o.address.name ?? o.address.label}</b> — {o.address.addressText}
                  {o.address.phone ? ` · ${o.address.phone}` : ''}
                </p>
              )}
            </section>
          ))
        )}
      </div>
    </FloorPage>
  );
}
