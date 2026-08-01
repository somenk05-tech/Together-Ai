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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 05</div>
      <h1 style={{ fontSize: 26 }}>Your grocery list 🛒</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Built from your saved meal plan and organised like a supermarket — real quantities, duplicates merged, tap to check items off as you shop.
      </p>

      <GroceryPlanner mode="individual" />
    </div>
  );
}
