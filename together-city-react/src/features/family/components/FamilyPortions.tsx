import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useFamilyPortions } from '@/features/nutrition/hooks';

/** Per-member portions for the day's shared family meals (Family Stage 2).
 *  One dish is cooked; each person's plate is scaled to their own calorie target. */
export function FamilyPortions({ dayIndex }: { dayIndex: number }) {
  const q = useFamilyPortions(dayIndex);
  if (q.isLoading) return <div className="card"><Spinner label="Portioning per member…" /></div>;
  const data = q.data;
  if (!data) return null;

  const soloOnly = data.members.length <= 1;

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ margin: '0 0 2px' }}>Personalised portions</h4>
      <p className="muted" style={{ fontSize: 11.5, margin: '0 0 12px' }}>
        Cook once — each plate scaled to that person's target.
      </p>

      {soloOnly && (
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          It's just you right now. <Link to="/family/connect" style={{ color: 'var(--accent)', fontWeight: 600 }}>Add family members</Link> and every shared dish will show a portion for each person.
        </p>
      )}

      {!soloOnly && data.meals.map((meal) => (
        <div key={meal.slot} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{meal.slotName}</span>
            <span className="muted" style={{ fontSize: 11 }}>{meal.name}</span>
          </div>
          {meal.sharedBase && (
            <p style={{ fontSize: 10.5, color: '#2e7d4f', background: '#e7f3ec', borderRadius: 8, padding: '4px 8px', margin: '0 0 6px', fontWeight: 600 }}>
              🍲 One base gravy — proteins added per person
            </p>
          )}
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
            {meal.perMember.map((p, i) => (
              <div key={p.memberId} style={{ padding: '7px 11px', fontSize: 12.5, borderTop: i ? '1px solid var(--line)' : 'none', background: i % 2 ? 'var(--paper)' : 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                    <b style={{ color: 'var(--ink)' }}>{p.grams} g</b> · {p.kcal.toLocaleString('en-IN')} kcal · {p.protein} g P
                  </span>
                </div>
                {(p.swap || p.note) && (
                  <div style={{ marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {p.swap && <span style={{ fontSize: 10.5, background: '#eef3f8', color: '#3f6b8f', borderRadius: 999, padding: '1px 8px', fontWeight: 600 }}>{p.swap.to} instead of {p.swap.from}</span>}
                    {p.note && <span style={{ fontSize: 10.5, background: '#f7efe1', color: '#b0803a', borderRadius: 999, padding: '1px 8px', fontWeight: 600 }}>{p.note}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!soloOnly && (
        <p className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
          One dish, cooked once: portions scale to each person's target, the protein swaps for veg members on the same gravy, and medical needs (low sodium, lighter protein) are noted per person.
        </p>
      )}
    </div>
  );
}
