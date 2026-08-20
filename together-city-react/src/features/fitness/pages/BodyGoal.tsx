import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBodyProgram, type Citation } from '../api';

function Chips({ citations }: { citations: Citation[] }) {
  return null; // guideline citations are backend-only, hidden from the user view
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {citations.map((c) => (
        <span key={c.id} title={c.ref} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 9px' }}>{c.label}</span>
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

  if (q.isLoading) return <Spinner label="Building your program…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load your program" hint="Set your profile (with a body goal) first." />;
  const p = q.data;

  return (
    <div>
      <div className="eyebrow">Fitness · Body Goal</div>
      <h1 style={{ fontSize: 26 }}>{p.goalLabel}</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 14px' }}>
        {p.tag} One systematic program across workout, nutrition and your health data.
      </p>

      {/* "Numbers below use population defaults for now" is the sentence this
          replaces. It was true, and it sat above four figures printed under the
          heading "Your daily diet targets" — a 70 kg, 172 cm body that was not
          theirs, with the male sex constant if they had not said. The server
          returns nulls now, so there is nothing to caption. */}
      {p.missing.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--warn-ink)' }}>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            We can't work out your calories and macros without your{' '}
            <strong>{p.missing.join(', ')}</strong>. We'd rather leave this blank than show you
            numbers worked out from somebody else's body.
          </p>
          <div style={{ marginTop: 10 }}><Link to="/fitness/profile"><Button variant="line" size="sm">Add your details</Button></Link></div>
        </div>
      )}

      {p.calorieTarget != null && p.macros && (
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Your daily diet targets</div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10 }}>
          {/* TDEE is what the body BURNS and is a fact about it; the figure
              above is what to EAT and belongs to Nutrition. Two numbers on one
              tile only reads as two targets if the sub-label does not say
              which is which. */}
          <Stat label="Calories" value={`${p.calorieTarget}`} sub={p.calorieNote ? `your nutrition target · TDEE ${p.tdee}` : `TDEE ${p.tdee} kcal`} />
          {/* The sub-label follows the number. Showing "1.8 g/kg" under a
              figure dosed against reference weight is a unit that does not
              divide into the gram count, and somebody will check. */}
          <Stat label="Protein" value={`${p.macros.proteinG} g`}
            sub={p.proteinNote ? 'clinical dose' : `${p.proteinPerKg} g/kg`} />
          <Stat label="Carbs" value={`${p.macros.carbG} g`} />
          <Stat label="Fat" value={`${p.macros.fatG} g`} />
        </div>
        {/* Training explains; clinical wins. The number this hub would have
            asked for is not hidden — it is named, with the reason it was not
            the one chosen, so the citizen has one target and knows why. */}
        {/* THE GOAL THAT DISAGREES, NAMED. A body goal called "Athletic" whose
            calories are actually on a deficit is the exact defect this change
            was for; showing one number and saying nothing would have swapped a
            visible contradiction for an invisible one. */}
        {p.calorieNote && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {p.calorieNote}{' '}
            <Link to="/nutrition/preferences" style={{ fontWeight: 700 }}>Your nutrition goal →</Link>
          </p>
        )}
        {p.proteinNote && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{p.proteinNote}</p>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Safe rate: {p.rate}. Base metabolic rate ≈ {p.bmr} kcal.</p>
        <Chips citations={p.citations} />
      </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Training emphasis</div>
        <p style={{ fontSize: 13.5, margin: '6px 0 0' }}>{p.emphasis}</p>
        {/* "See my weekly plan →" pointed at My Plan, which came off the menu
            on 16 Aug. A door to a room that is no longer on the map is how a
            hidden surface comes back by accident — and it is also the one thing
            that would make nav-audit and the next reader disagree about whether
            the page exists. The room still stands; nothing here advertises it. */}
      </div>

      {p.healthImprovements.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--ok-ink)' }}>
          <div className="eyebrow">What this improves in your health <span className="muted" style={{ fontWeight: 400 }}>· from your Medical data</span></div>
          {p.healthImprovements.map((h) => (
            <div key={h.title} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ok-ink)' }}>✓ {h.title}</div>
              <p style={{ fontSize: 13, margin: '4px 0 0' }}>{h.detail}</p>
              <Chips citations={h.citations} />
            </div>
          ))}
        </div>
      )}
      {!p.consentGranted && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--warn-ink)' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--warn-ink)' }}>🔒 Health tailoring is off</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
            Turn Fitness on in Medical → Privacy to let your program target your glucose, iron and lipids.
          </p>
          <Link to="/medical/consent"><Button variant="line" size="sm">Manage consent</Button></Link>
        </div>
      )}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{p.disclaimer}</p>
    </div>
  );
}
