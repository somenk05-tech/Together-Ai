import { Button } from '@/components/ui';
import { Link } from 'react-router-dom';
import { GroceryPlanner } from '../components/GroceryPlanner';

/**
 * Grocery Planner — a supermarket-organised shopping list built straight from
 * your saved meal plan.
 *
 * The quick-commerce comparison panel was removed on 1 Aug. Every price,
 * delivery time and stock count it showed came from a deterministic SIMULATION
 * (see the header of nutrition/quick-commerce.ts) — invented numbers presented
 * as live quotes and attributed to Blinkit, Zepto, Swiggy Instamart, BigBasket
 * and JioMart by name, under a banner reading "live store connection active".
 * A citizen could have chosen a store, or not bought something, on the strength
 * of a number nobody had ever checked. That is the golden rule's plainest
 * possible violation, made worse by the real brand names on it.
 */
export function Grocery() {
  return (
    // Wider than the other nutrition pages on purpose: the list is a grid now,
    // and 760px could only ever show one column of it.
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 05</div>
      <h1 style={{ fontSize: 26 }}>Your grocery list 🛒</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Built from your saved meal plan and organised like a supermarket — real quantities, duplicates merged, tap to check items off as you shop.
      </p>

      <GroceryPlanner mode="individual" />

      {/* WHERE THE CART WENT. It was item 06 in this hub's sidebar and was
          removed from there on 4 Aug 2026. Removing a menu entry does not
          delete a feature, and nav-audit caught that nothing else linked to it
          — so checkout would have become reachable only by typing the URL. It
          belongs at the bottom of the list it is for. */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/nutrition/cart"><Button variant="line" size="sm">Review &amp; checkout →</Button></Link>
        <span className="muted" style={{ fontSize: 12.5 }}>Order what is on this list.</span>
      </div>
    </div>
  );
}
