import { GroceryPlanner } from '../components/GroceryPlanner';
import { QuickCommercePanel } from '../components/QuickCommerce';

/** Grocery Planner — a supermarket-organised shopping list built straight from
 *  your saved meal plan, then found across every quick-commerce store so you
 *  can order the whole list through whichever app wins on price and speed. */
export function Grocery() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 05</div>
      <h1 style={{ fontSize: 26 }}>Your grocery list 🛒</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Built from your saved meal plan and organised like a supermarket — real quantities, duplicates merged, tap to check items off as you shop.
      </p>

      {/* Quick Commerce — the list priced across every store */}
      <QuickCommercePanel mode="individual" />

      <GroceryPlanner mode="individual" />
    </div>
  );
}
