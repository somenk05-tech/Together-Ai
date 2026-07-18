import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useSupplements } from '../hooks';

/** Supplements — goal-matched kit, upgraded by blood-panel flags. */
export function Supplements() {
  const plan = useSupplements();

  if (plan.isLoading) return <Spinner label="Matching your kit…" />;
  if (plan.isError || !plan.data) return <EmptyState title="Couldn't load supplements" hint="Start the backend and reload." />;

  const goalLabel = plan.data.goal === 'lose' ? 'lose weight' : plan.data.goal === 'gain' ? 'gain muscle' : 'maintain';

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · Supplements</div>
      <h1 style={{ fontSize: 26 }}>Your goal-matched kit</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Matched to your <strong>{goalLabel}</strong> goal — and upgraded automatically when your{' '}
        <Link to="/nutrition/blood" style={{ color: 'var(--accent)', fontWeight: 600 }}>blood panel</Link> flags a gap.
      </p>

      {plan.data.kit.map((s) => (
        <article key={s.name} className="card" style={{ marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{s.purpose}</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>
              <span className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '2px 10px', marginRight: 6 }}>{s.dose}</span>
              <span className="muted">{s.timing}</span>
            </div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>₹{s.priceInr}</div>
        </article>
      ))}

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 600 }}>
          Monthly kit · ₹{plan.data.totalInr}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Button variant="gold">Add kit to next order</Button>
        </span>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        Nutrition guidance, not medical advice — confirm dosing with your doctor, especially alongside medication.
      </p>
    </div>
  );
}
