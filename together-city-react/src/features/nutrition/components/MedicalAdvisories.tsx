import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MedicalAdvisory, HealthScore } from '../types';

const LEVEL: Record<number, { label: string; color: string; soft: string }> = {
  1: { label: 'Good to know', color: 'var(--ok-ink)', soft: 'var(--ok-soft)' },
  2: { label: 'Recommended', color: 'var(--warn-ink)', soft: 'var(--warn-soft)' },
  3: { label: 'Safety alert', color: 'var(--danger-ink)', soft: 'var(--danger-soft)' },
};

/** §21 — medical recommendations shown as advice. The plan already follows the
 *  user's saved preference; these cards suggest optional improvements and leave
 *  the decision (Update vs Keep) entirely to the user. */
export function MedicalAdvisories({ advisories, healthScore }: { advisories?: MedicalAdvisory[]; healthScore?: HealthScore }) {
  // Record the user's choice per advisory WITHOUT collapsing the card — the
  // recommendation stays visible so they can revisit or change it any time.
  const [kept, setKept] = useState<Set<string>>(new Set());
  const shown = advisories ?? [];
  if (!shown.length && !healthScore) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
      {healthScore && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* A score is shown only when the plan could actually be measured —
                an unscorable plan says so rather than showing a filler number. */}
            {typeof healthScore.nutritionalHealth === 'number' && (
              <ScorePill label="Nutrition vs targets" value={healthScore.nutritionalHealth} />
            )}
            {typeof healthScore.preferenceMatch === 'number' && (
              <ScorePill label="Preference match" value={healthScore.preferenceMatch} />
            )}
            <ScorePill label="Medical optimisation" value={healthScore.medicalOptimisation} />
            {typeof healthScore.overall === 'number'
              ? <ScorePill label="Overall nutrition" value={healthScore.overall} strong />
              : <span className="muted" style={{ fontSize: 12 }}>Overall score available once a plan is generated.</span>}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '10px 0 0', lineHeight: 1.5 }}>{healthScore.note}</p>
        </div>
      )}

      {shown.map((a) => {
        const lv = LEVEL[a.level] ?? LEVEL[1];
        return (
          <div key={a.key} className="card" style={{ padding: '14px 16px', borderLeft: `4px solid ${lv.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: lv.color, background: lv.soft, borderRadius: 999, padding: '3px 9px' }}>{lv.label}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{a.condition}</span>
            </div>
            <h4 style={{ fontSize: 14.5, margin: '2px 0 5px' }}>{a.title}</h4>
            <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>{a.message}</p>
            {a.actionable && (
              kept.has(a.key) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: lv.color, background: lv.soft, borderRadius: 999, padding: '7px 14px' }}>
                    ✓ Keeping your current preferences
                  </span>
                  <button type="button" onClick={() => setKept((s) => { const n = new Set(s); n.delete(a.key); return n; })}
                    style={{ fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--muted)', background: 'transparent', border: 'none', textDecoration: 'underline', padding: '7px 4px', fontFamily: 'inherit' }}>
                    Change
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                  <Link to="/nutrition/preferences"
                    style={{ fontSize: 12.5, fontWeight: 700, textDecoration: 'none', color: 'var(--on-accent)', background: 'var(--accent)', borderRadius: 999, padding: '7px 14px' }}>
                    Update food preferences
                  </Link>
                  <button type="button" onClick={() => setKept((s) => new Set(s).add(a.key))}
                    style={{ fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)', background: 'transparent', border: '1.5px solid var(--line)', borderRadius: 999, padding: '7px 14px', fontFamily: 'inherit' }}>
                    Keep current preferences
                  </button>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScorePill({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  const col = value >= 85 ? 'var(--accent)' : value >= 70 ? 'var(--warn-ink)' : 'var(--danger-ink)';
  return (
    <div style={{ minWidth: 96 }}>
      <div style={{ fontSize: strong ? 22 : 18, fontWeight: 800, color: strong ? 'var(--ink)' : col, fontFamily: 'var(--serif)' }}>{value}%</div>
      <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
}
