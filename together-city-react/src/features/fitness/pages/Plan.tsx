import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { AiSuggestions } from '@/components/AiSuggestions';
import { useFitnessPlan, type Session, type ConditionAdjustment, type Citation } from '../api';

const intensityColor: Record<string, string> = { light: 'var(--ok-ink)', moderate: 'var(--warn-ink)', vigorous: 'var(--danger-ink)' };
const kindIcon: Record<string, string> = { aerobic: '🏃', strength: '🏋️', balance: '🧘', mobility: '🤸', recovery: '😌' };

function Chips({ citations }: { citations: Citation[] }) {
  return null; // guideline citations are backend-only, hidden from the user view
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {citations.map((c) => (
        <span key={c.id} title={c.ref} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 'var(--r-full)', padding: '2px 9px' }}>{c.label}</span>
      ))}
    </div>
  );
}

function AdjCard({ a }: { a: ConditionAdjustment }) {
  const srcLabel = a.source === 'labs' ? 'From your labs' : a.source === 'records' ? 'From your records' : 'You told us';
  return (
    <article className="card" style={{ marginBottom: 10, borderLeft: '4px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{a.title}</strong>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '1px 8px' }}>{srcLabel}</span>
        <span className="muted" style={{ fontSize: 12 }}>{a.detail}</span>
      </div>
      <p style={{ fontSize: 13, margin: '6px 0 0' }}>{a.effect}</p>
      <Chips citations={a.citations} />
    </article>
  );
}

function DayRow({ s }: { s: Session }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ width: 38, fontWeight: 700, fontSize: 12.5, color: 'var(--muted)' }}>{s.day}</div>
      <span style={{ fontSize: 20 }}>{kindIcon[s.kind]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.focus}</div>
        {/* WHAT THE DAY TRAINS, ON THE ROW ITSELF. A week of four lines reading
            "Full-body strength" is not a plan somebody can follow — it is the
            same sentence four times. The engine names the day now; this is the
            line that shows it. Rest days say "recovery" rather than nothing,
            because a blank Sunday reads as the plan running out. */}
        {s.trains?.length > 0 && (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)', letterSpacing: '.01em', margin: '2px 0 1px' }}>
            {s.kind === 'recovery' ? 'Recovery' : s.trains.join(' · ')}
          </div>
        )}
        <div className="muted" style={{ fontSize: 12.5 }}>{s.detail}</div>
      </div>
      {s.minutes > 0 && <span className="muted" style={{ fontSize: 12 }}>{s.minutes}m</span>}
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: intensityColor[s.intensity], border: `1px solid ${intensityColor[s.intensity]}`, borderRadius: 'var(--r-full)', padding: '1px 8px' }}>{s.intensity}</span>
    </div>
  );
}

/** My Plan — age + condition-differentiated weekly training, with a voice trainer. */
export function Plan() {
  const q = useFitnessPlan();

  if (q.isLoading) return <Spinner label="Building your plan…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load your plan" hint="Set your profile first, then reload." />;
  const p = q.data;

  return (
    <div>
      <div className="eyebrow">Fitness · My Plan</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Your week</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 14px' }}>
        {p.band.label} · {p.level} · {p.mode} · goal: {p.goal}. {p.band.summary}
      </p>

      <AiSuggestions kind="fitness" />

      {!p.consentGranted && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--warn-ink)' }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--warn-ink)' }}>🔒 Lab tailoring is off</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
            Fitness can't read your biomarkers (consent revoked in Medical). Your plan is built from age and
            declared conditions only — turn Fitness on to tailor by iron, glucose and inflammation.
          </p>
          <Link to="/medical/consent"><Button variant="line" size="sm">Manage consent</Button></Link>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div><div className="eyebrow">Aerobic / week</div><div style={{ fontWeight: 700, fontSize: 14 }}>{p.weeklyTargets.aerobicMinutes}</div></div>
          <div><div className="eyebrow">Strength days</div><div style={{ fontWeight: 700, fontSize: 14 }}>{p.weeklyTargets.resistanceDays}/week</div></div>
          {p.weeklyTargets.balanceDays > 0 && <div><div className="eyebrow">Balance days</div><div style={{ fontWeight: 700, fontSize: 14 }}>{p.weeklyTargets.balanceDays}/week</div></div>}
          <div><div className="eyebrow">Intensity ceiling</div><div style={{ fontWeight: 700, fontSize: 14, color: intensityColor[p.intensityCap], textTransform: 'capitalize' }}>{p.intensityCap}</div></div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{p.weeklyTargets.note}</p>
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          <strong>Heart-rate zones</strong> (max ~{p.heart.hrMax} bpm, {p.heart.formula}):
          <span className="muted"> moderate {p.heart.zones.moderate[0]}–{p.heart.zones.moderate[1]}, vigorous {p.heart.zones.vigorous[0]}–{p.heart.zones.vigorous[1]} bpm.</span>
        </div>
        <Chips citations={p.heart.citations} />
      </div>

      {p.adjustments.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>Why your plan looks like this</h2>
          {p.adjustments.map((a) => <AdjCard key={a.key + a.source} a={a} />)}
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="eyebrow">Your 7-day plan</div>
        {p.sessions.map((s) => <DayRow key={s.day} s={s} />)}
        {/* THE PROMISE, AND WHAT MAKES IT TRUE. A trainer's plan is not a
            document, it is the first version of one — and a page that says so
            has to be able to point at the thing that changes it. What changes
            it today is the profile and the log: ability sets the days, the log
            eases a heavy week, and Nutrition's target explains the session.
            The weekly check-in that reads a weigh-in and how the week actually
            FELT is the next piece of this and is not built yet, so this says
            what it does rather than what it will do. */}
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.65, margin: '14px 0 0', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          This is week one of your plan, not a fixed programme. Keep your{' '}
          <Link to="/fitness/log">workout log</Link> and your{' '}
          <Link to="/fitness/profile">training profile</Link> current — weight, ability, days you can
          train — and the week rebuilds around them: a heavy week is eased on purpose, and a ceiling
          from your labs is never raised by anything you tell it.
        </p>
      </div>

      {p.habits.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="eyebrow">Daily habits</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)' }}>
            {p.habits.map((h, i) => <li key={i} style={{ marginBottom: 4 }}>{h}</li>)}
          </ul>
        </div>
      )}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">Train safely</div>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)' }}>
          {p.safety.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
        </ul>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 16 }}>{p.disclaimer}</p>
    </div>
  );
}
