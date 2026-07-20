import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { GroceryPlanner } from '../components/GroceryPlanner';

/** Grocery Planner — a supermarket-organised shopping list built straight from
 *  your saved meal plan: real units, no duplicates, aisle-by-aisle. */
export function Grocery() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 05</div>
      <h1 style={{ fontSize: 26 }}>Your grocery list 🛒</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Built from your saved meal plan and organised like a supermarket — real quantities, duplicates merged, tap to check items off as you shop.
      </p>

      {/* Store & delivery — not live yet */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper)' }}>
        <span style={{ fontSize: 18 }}>🏪</span>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13.5 }}>Grocery store &amp; 11-min delivery — coming soon</strong>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>For now you get the shopping list from your plan; in-app ordering &amp; delivery arrive soon.</p>
        </div>
        <Link to="/nutrition/weekly"><Button variant="line" size="sm">Open planner</Button></Link>
      </div>

      <GroceryPlanner mode="individual" />
    </div>
  );
}
