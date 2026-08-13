import { Link } from 'react-router-dom';
import { PageHeader, Button } from '@/components/ui';
import { GroceryPlanner } from '@/features/nutrition/components/GroceryPlanner';
import { useFamily, headcount } from '../members';

/**
 * Grocery Planner — Family. One combined, supermarket-organised shopping list
 * built from the shared family meal plan and portioned for the whole family:
 * real units, duplicates merged, aisle-by-aisle.
 */
export function FamilyGrocery() {
  const { state } = useFamily();
  const N = headcount(state);

  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 04"
        title="Your family grocery list 🛒"
        sub="One combined list, portioned for the whole family — no duplicates, no waste." />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Built from your family meal plan · portioned for {N} {N === 1 ? 'person' : 'people'} · organised like a supermarket
        </span>
        <Link to="/family/weekly" style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">Open planner</Button></Link>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper)' }}>
        <span style={{ fontSize: 18 }}>🏪</span>
        <div>
          <strong style={{ fontSize: 13.5 }}>Grocery store &amp; 11-min delivery — coming soon</strong>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>For now you get the shopping list from your family plan; in-app ordering &amp; delivery arrive soon.</p>
        </div>
      </div>

      <GroceryPlanner mode="family" />

      {/* Same reason as the individual list: the Cart left this hub's sidebar
          on 4 Aug 2026, and a removed menu entry must not orphan the page. */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/family/cart"><Button variant="line" size="sm">Review &amp; checkout →</Button></Link>
        <span className="muted" style={{ fontSize: 12.5 }}>Order what is on this list.</span>
        <Link to="/family/pantry"><Button variant="line" size="sm">Shared pantry →</Button></Link>
        <span className="muted" style={{ fontSize: 12.5 }}>What you already have — the list subtracts it.</span>
      </div>

      <div className="trust">
        <span>◈ Portioned for your family</span><span>◈ No duplicates, no waste</span><span>◈ Supermarket-organised</span><span>◈ Ordering coming soon</span>
      </div>
    </div>
  );
}
