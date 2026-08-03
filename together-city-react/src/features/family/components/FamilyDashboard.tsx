import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useFamilyDashboard } from '@/features/nutrition/hooks';
import type { FamilyMemberStatus } from '@/features/nutrition/api';

const STATUS_COL: Record<string, string> = { on: 'var(--accent)', met: 'var(--accent)', over: 'var(--danger-ink)', under: 'var(--warn-ink)', low: 'var(--warn-ink)', none: 'var(--muted)' };
const STATUS_TXT: Record<string, string> = { on: 'On target', met: 'Met', over: 'Over', under: 'Under', low: 'Low', none: '—' };

function Bar({ pct, col }: { pct: number; col: string }) {
  return (
    <span style={{ display: 'block', height: 6, background: 'var(--line)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: col }} />
    </span>
  );
}

function MemberStatusCard({ m }: { m: FamilyMemberStatus }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="av" style={{ width: 40, height: 40, fontSize: 16 }}>{(m.name[0] ?? '?').toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: 15 }}>{m.name}{m.isSelf && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · You</span>}</h4>
          <p className="muted" style={{ fontSize: 11.5, margin: '1px 0 0', textTransform: 'capitalize' }}>{m.role}</p>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: m.medicalOk ? 'var(--accent)' : 'var(--warn-ink)', background: m.medicalOk ? 'var(--ok-soft)' : 'var(--warn-soft)', borderRadius: 999, padding: '3px 9px' }}>
          {m.medicalOk ? '✓ On track' : '⚠ Check'}
        </span>
      </div>

      <div style={{ marginTop: 12, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="muted">Calories</span>
          <span><b>{m.consumed.kcal.toLocaleString('en-IN')}</b> / {m.target.kcal.toLocaleString('en-IN')} <span style={{ color: STATUS_COL[m.calorieStatus] }}>· {STATUS_TXT[m.calorieStatus]}</span></span>
        </div>
        <Bar pct={m.kcalPct} col={STATUS_COL[m.calorieStatus]} />
      </div>
      <div style={{ marginTop: 9, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="muted">Protein</span>
          <span><b>{m.consumed.protein}</b> / {m.target.protein} g <span style={{ color: STATUS_COL[m.proteinStatus] }}>· {STATUS_TXT[m.proteinStatus]}</span></span>
        </div>
        <Bar pct={m.proteinPct} col={STATUS_COL[m.proteinStatus]} />
      </div>

      {m.flags.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {m.flags.map((fl, i) => <p key={i} style={{ fontSize: 11, color: 'var(--danger-ink)', margin: '2px 0', lineHeight: 1.4 }}>• {fl}</p>)}
        </div>
      )}
      {m.adjustments.length > 0 && (
        <p className="muted" style={{ fontSize: 10.5, marginTop: 8, lineHeight: 1.4 }}>{m.adjustments[0]}</p>
      )}
    </div>
  );
}

/** Family dashboard — per-member nutrition validation (Family Stage 5). Each
 *  person is checked against their own targets even though the family shares meals. */
export function FamilyDashboard() {
  const q = useFamilyDashboard();
  if (q.isLoading) return <Spinner label="Checking each member's nutrition…" />;
  const d = q.data;
  if (q.isError || !d) {
    // Silence here read as "no family". A failed read must never look like
    // members or their targets disappearing.
    return (
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        We couldn’t check the family’s nutrition just now. Nobody’s plan or
        targets have changed — try again in a moment.
      </p>
    );
  }

  return (
    <div>
      {d.hasPlan && (
        <div className="card" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, background: d.familyStatus === 'all-on-track' ? 'var(--ok-soft)' : 'var(--warn-soft)' }}>
          <span style={{ fontSize: 18 }}>{d.familyStatus === 'all-on-track' ? '✅' : '⚠️'}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {d.familyStatus === 'all-on-track'
              ? `Everyone's on track — all ${d.memberCount} members hit their targets on today's shared plan.`
              : 'Some members need a portion tweak — see the flags below.'}
          </span>
        </div>
      )}
      {!d.hasPlan && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          No family plan yet. <Link to="/family/weekly" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Generate the week</Link> and each member's nutrition will be validated here.
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
        {d.members.map((m) => <MemberStatusCard key={m.id} m={m} />)}
      </div>
    </div>
  );
}
