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
      <div className="eyebrow">Nutrition Hub · 08</div>
      <h1 style={{ fontSize: 26 }}>Supplements</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 12px' }}>
        AI gap analysis, built from your nutrient audit and blood work — matched to your <strong>{goalLabel}</strong> goal.
      </p>

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong style={{ fontSize: 14 }}>🩸 Personalise with your blood test</strong>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>Connect an existing blood report to tailor dosage to your actual markers.</p>
        </div>
        <Link to="/nutrition/blood"><Button variant="line" size="sm">Connect blood report →</Button></Link>
      </div>

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
      <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
        ≈ ₹{(plan.data.totalInr / 30).toFixed(1)}/day across the kit.
      </p>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10, padding: '10px 12px', background: '#fff8e1', borderLeft: '3px solid #f9a825', borderRadius: 6 }}>
        These are AI-generated wellness suggestions, not medical prescriptions. Always consult your doctor or registered
        dietitian before starting any supplement.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
        {['100% Authentic', 'Secure Payment', 'Easy Returns'].map((t) => (
          <span key={t} className="muted" style={{ fontSize: 12 }}>◈ {t}</span>
        ))}
      </div>
    </div>
  );
}
