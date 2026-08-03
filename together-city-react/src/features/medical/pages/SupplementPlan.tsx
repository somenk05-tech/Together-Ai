import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMedicalSupplementPlan, type Citation } from '../api';

function Cites({ citations }: { citations: Citation[] }) {
  return null; // guideline citations are backend-only, hidden from the user view
  if (!citations?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {citations.map((c) => (
        <span key={c.id} title={c.ref} style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 8px' }}>{c.label}</span>
      ))}
    </div>
  );
}

/**
 * Supplement Plan — how supplementation is suggested for a single user:
 * their latest panel + goal → the cited engine proposes each item with its exact
 * trigger, dose, food-first alternative and NIH-ODS reference (RDA / upper limit).
 */
export function SupplementPlan() {
  const plan = useMedicalSupplementPlan();

  if (plan.isLoading) return <Spinner label="Building your plan…" />;
  if (plan.isError || !plan.data) return <EmptyState title="Couldn't load your plan" hint="Your plan is still saved — this didn’t reach us. Nothing has been changed or removed." />;

  const { basis, items, totalInr, safety } = plan.data;
  const goalLabel = basis.goal === 'lose' ? 'weight loss' : basis.goal === 'gain' ? 'muscle gain' : 'maintenance';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Supplement Plan</div>
      <h1 style={{ fontSize: 26 }}>Your personal supplement plan</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Built for you alone — from your goal and your latest blood panel. Every item names the
        exact reason it's here, with its RDA and safe upper limit. Food-first, then supplements.
      </p>

      {/* The reasoning basis */}
      <div className="card" style={{ marginTop: 18, background: 'var(--accent-soft)', borderLeft: '4px solid var(--accent)' }}>
        <div className="eyebrow" style={{ margin: 0 }}>Why these — your basis</div>
        <p style={{ fontSize: 13.5, margin: '8px 0 0' }}>
          Goal: <strong>{goalLabel}</strong>.{' '}
          {basis.hasBloodTest
            ? <>From your blood panel{basis.takenOn ? ` (${basis.takenOn})` : ''}: </>
            : <>No blood panel yet — <Link to="/medical/blood" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>add one</Link> to tailor this further. </>}
          {basis.flags.length > 0 && (
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
              {basis.flags.map((f) => (
                <span key={f.key} style={{ fontSize: 11, fontWeight: 600, color: f.status === 'low' ? 'var(--danger-ink)' : 'var(--warn-ink)', background: 'var(--card)', borderRadius: 999, padding: '2px 10px' }}>
                  {f.label} {f.status} ({f.value})
                </span>
              ))}
            </span>
          )}
        </p>
      </div>

      {items.map((s) => (
        <article key={s.name} className="card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{s.name}</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 10px' }}>{s.trigger}</span>
            <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 15 }}>₹{s.priceInr}</div>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{s.purpose}</div>
          <div style={{ fontSize: 12.5, marginTop: 6 }}>
            <span className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '2px 10px', marginRight: 6 }}>{s.dose}</span>
            <span className="muted">{s.timing}</span>
          </div>
          {s.foodFirst && <p style={{ fontSize: 12.5, margin: '8px 0 0', color: 'var(--ink-soft)' }}>🥗 {s.foodFirst}</p>}
          {s.reference && <p style={{ fontSize: 12, margin: '6px 0 0', padding: '7px 10px', background: 'var(--paper)', borderRadius: 8, border: '1px solid var(--line)' }}>📖 {s.reference}</p>}
          <Cites citations={s.citations} />
        </article>
      ))}

      <div className="card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 600 }}>Monthly kit · ₹{totalInr}</span>
        <span style={{ marginLeft: 'auto' }}><Button variant="gold">Add kit to next order</Button></span>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>{safety}</p>
    </div>
  );
}
