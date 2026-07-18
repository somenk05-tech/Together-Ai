import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBodyProgram, useSyncNutrition, type Citation } from '../api';

function Chips({ citations }: { citations: Citation[] }) {
  return null; // guideline citations are backend-only, hidden from the user view
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {citations.map((c) => (
        <span key={c.id} title={c.ref} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 9px' }}>{c.label}</span>
      ))}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ minWidth: 96 }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

/** Body Goal — the integrated program tying target composition → diet → workout → health. */
export function BodyGoal() {
  const q = useBodyProgram();
  const sync = useSyncNutrition();
  const [synced, setSynced] = useState(false);

  if (q.isLoading) return <Spinner label="Building your program…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load your program" hint="Set your profile (with a body goal) first." />;
  const p = q.data;

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Fitness · Body Goal</div>
      <h1 style={{ fontSize: 26 }}>{p.goalLabel}</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 14px' }}>
        {p.tag} One systematic program across workout, nutrition and your health data.
      </p>

      {!p.hasMetrics && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid #e65100' }}>
          <p style={{ fontSize: 13, margin: 0 }}>
            Add your <strong>height and weight</strong> in your profile for personalised calorie and macro
            targets. Numbers below use population defaults for now.
          </p>
          <div style={{ marginTop: 10 }}><Link to="/fitness/profile"><Button variant="line" size="sm">Add measurements</Button></Link></div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Your daily diet targets</div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10 }}>
          <Stat label="Calories" value={`${p.calorieTarget}`} sub={`TDEE ${p.tdee} kcal`} />
          <Stat label="Protein" value={`${p.macros.proteinG} g`} sub={`${p.proteinPerKg} g/kg`} />
          <Stat label="Carbs" value={`${p.macros.carbG} g`} />
          <Stat label="Fat" value={`${p.macros.fatG} g`} />
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Safe rate: {p.rate}. Base metabolic rate ≈ {p.bmr} kcal.</p>
        <Chips citations={p.citations} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Training emphasis</div>
        <p style={{ fontSize: 13.5, margin: '6px 0 0' }}>{p.emphasis}</p>
        <div style={{ marginTop: 10 }}><Link to="/fitness/plan"><Button variant="line" size="sm">See my weekly plan →</Button></Link></div>
      </div>

      {p.healthImprovements.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid #2e7d32' }}>
          <div className="eyebrow">What this improves in your health <span className="muted" style={{ fontWeight: 400 }}>· from your Medical data</span></div>
          {p.healthImprovements.map((h) => (
            <div key={h.title} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#2e7d32' }}>✓ {h.title}</div>
              <p style={{ fontSize: 13, margin: '4px 0 0' }}>{h.detail}</p>
              <Chips citations={h.citations} />
            </div>
          ))}
        </div>
      )}
      {!p.consentGranted && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid #e65100' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: '#e65100' }}>🔒 Health tailoring is off</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
            Turn Fitness on in Medical → Privacy to let your program target your glucose, iron and lipids.
          </p>
          <Link to="/medical/consent"><Button variant="line" size="sm">Manage consent</Button></Link>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--accent)' }}>
        <div className="eyebrow">Connect to your diet</div>
        <p style={{ fontSize: 13.5, margin: '6px 0 10px' }}>{p.nutrition.note}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="accent" size="sm" disabled={sync.isPending}
            onClick={() => sync.mutate(undefined, { onSuccess: () => setSynced(true) })}>
            {sync.isPending ? 'Syncing…' : '🍽️ Sync my diet to Nutrition'}
          </Button>
          {synced && (
            <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
              ✓ Synced — <Link to="/nutrition/weekly" style={{ color: 'var(--accent)' }}>open your meal plan</Link>
            </span>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{p.disclaimer}</p>
    </div>
  );
}
