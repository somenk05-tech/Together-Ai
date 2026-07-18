import type { PlanGuidance } from '../types';

/** Condition-aware banner — explains why the plan leaned the way it did, with sources. */
export function PlanGuidanceBanner({ guidance }: { guidance?: PlanGuidance | null }) {
  if (!guidance || guidance.modes.length === 0) return null;
  return (
    <div
      className="card"
      style={{ marginBottom: 20, borderLeft: '4px solid var(--accent)', background: 'var(--accent-soft)' }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <span className="eyebrow" style={{ margin: 0 }}>Personalised this week</span>
        {guidance.modes.map((m) => (
          <span
            key={m.key}
            style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'var(--accent)', background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 999, padding: '2px 12px' }}
          >
            {m.label}
          </span>
        ))}
      </div>
      <ul style={{ margin: '0 0 6px', paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
        {guidance.modes.map((m) => <li key={m.key} style={{ marginBottom: 3 }}>{m.reason}</li>)}
      </ul>
    </div>
  );
}
