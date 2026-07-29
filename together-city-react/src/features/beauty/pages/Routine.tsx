import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBeautyRoutine, type ProductRoutine, type ProductRoutineStep } from '../api';

const ICON: Record<ProductRoutine['timeOfDay'], string> = { morning: '☀️', evening: '🌙', weekly: '📅' };

function Step({ s }: { s: ProductRoutineStep }) {
  return (
    <li style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <span
        aria-hidden
        style={{
          flex: 'none', width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 12, fontWeight: 800,
        }}
      >
        {s.order}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.step}</span>
          <strong style={{ fontSize: 14 }}>{s.name}</strong>
          <span className="muted" style={{ fontSize: 11.5 }}>{s.brand}</span>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink)', fontWeight: 700 }}>₹{s.priceInr}</span>
        </div>
        {s.keyIngredient && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{s.keyIngredient}</div>}
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.55 }}>{s.instructions}</p>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{s.frequency}</div>
        {s.warnings.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {s.warnings.map((w) => (
              <li key={w} style={{ fontSize: 12, lineHeight: 1.5, color: '#8a6d1f', background: '#fff8e1', border: '1px solid #f0d68a', borderRadius: 8, padding: '6px 10px' }}>
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function RoutineCard({ r }: { r: ProductRoutine }) {
  return (
    <section className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 17 }}>{ICON[r.timeOfDay]}</span>
        <h2 style={{ fontSize: 17, margin: 0 }}>{r.title}</h2>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
          {r.steps.length === 0 ? 'nothing yet' : `${r.steps.length} step${r.steps.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {r.notes.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {r.notes.map((n) => (
            <p key={n} style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, background: 'var(--paper)', borderRadius: 10, padding: '9px 12px' }}>{n}</p>
          ))}
        </div>
      )}

      {r.steps.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
          Nothing for the {r.title.toLowerCase()} yet — as your profile fills in, steps appear here.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
          {r.steps.map((s) => <Step key={`${r.timeOfDay}-${s.productId}`} s={s} />)}
        </ul>
      )}
    </section>
  );
}

/** The whole routine: what to use, in what order, morning / evening / weekly. */
export function Routine() {
  const routine = useBeautyRoutine();

  if (routine.isLoading) return <Spinner label="Building your routine…" />;

  const data = routine.data;
  const empty = !data || data.routines.every((r) => r.steps.length === 0);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Beauty Hub · Routine</div>
      <h1 style={{ fontSize: 26 }}>Your routine</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Built from your saved skin and hair profile — what to use, in what order, and when.
        Anything you’ve told us you react to is left out.
      </p>

      {data && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {data.personalisedBy.assessment && <span className="tag" style={{ fontSize: 11 }}>from your assessment</span>}
          {data.personalisedBy.labs && <span className="tag" style={{ fontSize: 11 }}>🩸 using your biomarkers</span>}
          {data.personalisedBy.concerns.map((c) => <span key={c} className="tag" style={{ fontSize: 11 }}>{c}</span>)}
        </div>
      )}

      {empty ? (
        <>
          <EmptyState
            icon="🧴"
            title="No routine yet"
            hint="Tell us about your skin and hair — or run a photo assessment — and your routine builds itself."
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <Link to="/beauty/profile"><Button variant="accent">Complete your profile</Button></Link>
            <Link to="/beauty/market"><Button variant="line">Browse products</Button></Link>
          </div>
        </>
      ) : (
        <>
          {data.routines.map((r) => <RoutineCard key={r.timeOfDay} r={r} />)}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            <Link to="/beauty/market"><Button variant="accent" size="sm">Shop these {data.productCount} products</Button></Link>
            <Link to="/beauty/profile"><Button variant="line" size="sm">Update my profile</Button></Link>
          </div>

          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 18 }}>{data.disclaimer}</p>
        </>
      )}
    </div>
  );
}
