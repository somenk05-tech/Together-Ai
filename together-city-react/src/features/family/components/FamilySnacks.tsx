import { Link } from 'react-router-dom';
import type { Recipe } from '@/features/nutrition/types';
import { activeMembers, memSeed, NEED_LABEL, type FamilyState, type Member } from '../members';

/**
 * Personal snacks card — one snack per active member, tuned to their health need.
 * The vanilla site ranks a snack pool by the member's target nutrient; the React
 * recipe list only exposes macros, so protein/fibre rank on real data and the
 * remaining needs fall back to a deterministic per-member pick. Layout is 1:1.
 */
function needScore(need: Member['need'], r: Recipe): number {
  switch (need) {
    case 'protein': return r.protein;
    case 'fibre': return r.fiber;
    default: return r.protein; // calcium / iron not in the macro list — deterministic pick handles variety
  }
}

function snackPool(recipes: Recipe[], need: Member['need'], veg: boolean): Recipe[] {
  const base = recipes.filter((r) => (!veg || r.diet === 'veg' || r.diet === 'vegan' || r.diet === 'jain'));
  const lean = (base.length ? base : recipes).filter((r) => r.kcal <= 400);
  const pool = (lean.length ? lean : base.length ? base : recipes).slice();
  pool.sort((a, b) => needScore(need, b) - needScore(need, a));
  return pool.slice(0, 40);
}

export function FamilySnacks({ recipes, family, dayIndex }: { recipes: Recipe[]; family: FamilyState; dayIndex: number }) {
  const members = activeMembers(family);
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 999 }}>Personal snacks</span>
      <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 2px' }}>One per member, tuned to their health need</p>
      {members.map((m) => {
        const pool = snackPool(recipes, m.need, m.veg);
        const sr = pool.length ? pool[Math.abs(memSeed(m.id) + dayIndex * 7) % pool.length] : null;
        return (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 12.5 }}>{m.name}</b>{' '}
              <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-soft)', padding: '1px 6px', borderRadius: 999 }}>{NEED_LABEL[m.need]}</span>
              <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sr ? `${sr.name} · ${sr.kcal} kcal` : '—'}
              </div>
            </div>
            {sr && <Link to={`/nutrition/recipes/${sr.id}`} className="btn btn-line btn-sm" style={{ flex: '0 0 auto' }}>Recipe</Link>}
          </div>
        );
      })}
    </div>
  );
}
