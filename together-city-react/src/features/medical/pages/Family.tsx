import { Link } from 'react-router-dom';
import { Spinner, EmptyState } from '@/components/ui';
import { useFamilyHealth } from '@/features/nutrition/hooks';
import type { FamilyHealthMember, HealthStatus, AlertLevel } from '@/features/nutrition/api';

const STATUS: Record<HealthStatus, { label: string; color: string; soft: string }> = {
  excellent: { label: 'Excellent', color: 'var(--ok-ink)', soft: 'var(--ok-soft)' },
  good: { label: 'Good', color: 'var(--info-ink)', soft: 'var(--info-soft)' },
  attention: { label: 'Needs Attention', color: 'var(--warn-ink)', soft: 'var(--warn-soft)' },
  'follow-up': { label: 'Requires Follow-up', color: 'var(--danger-ink)', soft: 'var(--danger-soft)' },
};
const ALERT: Record<AlertLevel, { bg: string; fg: string }> = {
  green: { bg: 'var(--ok-soft)', fg: 'var(--ok-ink)' },
  yellow: { bg: 'var(--warn-soft)', fg: 'var(--warn-ink)' },
  orange: { bg: 'var(--warn-soft)', fg: 'var(--warn-ink)' },
  red: { bg: 'var(--danger-soft)', fg: 'var(--danger-ink)' },
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function Score({ label, value }: { label: string; value: number | null }) {
  const col = value == null ? 'var(--muted)' : value >= 85 ? 'var(--ok-ink)' : value >= 70 ? 'var(--warn-ink)' : 'var(--danger-ink)';
  return (
    <div style={{ minWidth: 84 }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: col }}>{value == null ? '🔒' : `${value}`}</div>
      <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function MemberCard({ m }: { m: FamilyHealthMember }) {
  const st = STATUS[m.status];
  return (
    <div className="card" style={{ padding: 18, borderTop: `4px solid ${st.color}` }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="av" style={{ width: 48, height: 48, fontSize: 17, overflow: 'hidden', backgroundImage: m.image ? `url(${m.image})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          {!m.image && initials(m.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: 0 }}>{m.name}{m.isSelf && <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · You</span>}</h4>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0', textTransform: 'capitalize' }}>{m.relationship} · {m.age}y · {m.sex}</p>
        </div>
        <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: st.color, background: st.soft, borderRadius: 999, padding: '4px 11px' }}>{st.label}</span>
      </div>

      {/* scores */}
      <div style={{ display: 'flex', gap: 22, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <Score label="Health" value={m.healthScore} />
        <Score label="Nutrition" value={m.nutritionScore} />
      </div>

      {/* health snapshot */}
      <div style={{ marginTop: 14 }}>
        <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Health snapshot</div>
        {m.privacy.summary ? (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>🔒 Private</p>
        ) : m.snapshot.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>No findings yet — add a blood test or report.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {m.snapshot.map((s, i) => <li key={i} style={{ fontSize: 12.5 }}>{s}</li>)}
          </ul>
        )}
      </div>

      {/* alerts */}
      {!m.privacy.bloodTests && m.alerts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {m.alerts.map((a, i) => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '3px 10px', background: ALERT[a.level].bg, color: ALERT[a.level].fg }}>{a.label}</span>
          ))}
        </div>
      )}

      {/* medical history */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <Field label="Last blood test" value={m.privacy.bloodTests ? 'Private' : fmt(m.lastBloodTest)} />
        <Field label="Last doctor visit" value={m.privacy.bloodTests ? 'Private' : fmt(m.lastVisit)} />
        <Field label="Latest diagnosis" value={m.privacy.diagnoses ? 'Private' : (m.latestDiagnosis ?? '—')} />
        <Field label="Next test" value={m.privacy.bloodTests ? 'Private' : (m.nextTest ?? '—')} />
      </div>
      {m.reminder && <p style={{ fontSize: 11.5, color: 'var(--danger-ink)', fontWeight: 600, margin: '10px 0 0' }}>⏰ {m.reminder}</p>}

      {/* actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {m.isSelf ? (
          <>
            <Link to="/medical/records" className="btn btn-line btn-sm">View Medical Hub →</Link>
            <Link to="/medical/tests" className="btn btn-line btn-sm">Upload blood test</Link>
            <Link to="/medical/records" className="btn btn-line btn-sm">Upload report</Link>
          </>
        ) : (
          <span className="muted" style={{ fontSize: 11.5 }}>
            🔒 Records live in {m.name.split(' ')[0]}'s own Medical Hub — only they can upload or open them.
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Family Profiles — Health Command Centre. A permission-gated overview of every
 * household member's health, read from each person's OWN Medical Hub (never
 * duplicated here). Members are the same household you manage in Family Nutrition.
 */
export function Family() {
  const fh = useFamilyHealth();

  if (fh.isLoading) return <Spinner label="Reading your family's health…" />;
  if (fh.isError || !fh.data) return <EmptyState title="Couldn't load family health" hint="Nothing has been lost — every record is still in your vault. We couldn’t read them just now." />;
  const { summary, members } = fh.data;

  const Stat = ({ n, l }: { n: number | string; l: string }) => (
    <div><div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div><div className="muted" style={{ fontSize: 11 }}>{l}</div></div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Family Profiles</div>
      <h1 style={{ fontSize: 26 }}>Family Health Command Centre</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        A high-level view of every household member's health. Detailed records stay private in each person's own Medical Hub — this page only shows summaries they've chosen to share.
      </p>

      {/* Family summary */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <Stat n={summary.members} l="members" />
          <Stat n={summary.chronicConditions} l="with conditions" />
          <Stat n={summary.bloodTestsDue} l="tests due" />
          <Stat n={summary.reportsUploaded} l="reports on file" />
          <Stat n={summary.avgHealthScore ?? '—'} l="avg health score" />
          <Stat n={summary.nutritionScore ?? '—'} l="nutrition score" />
        </div>
        {summary.reminders.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Upcoming reminders</div>
            {summary.reminders.map((r, i) => <p key={i} style={{ fontSize: 12.5, margin: '2px 0', color: 'var(--danger-ink)', fontWeight: 600 }}>⏰ {r}</p>)}
          </div>
        )}
      </div>

      {members.length <= 1 ? (
        <EmptyState icon="👪" title="Just you so far"
          hint="Invite household members in Family Nutrition — one connection powers meal plans and these health summaries together." />
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
        {members.map((m) => <MemberCard key={m.id} m={m} />)}
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 18, lineHeight: 1.5 }}>
        ◈ Household members are managed in <Link to="/family/connect" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Family Nutrition → Connect</Link>, where each person also controls what they share. The Family Dashboard reads summaries from each individual's Medical Hub but never stores the underlying records.
      </p>
    </div>
  );
}
