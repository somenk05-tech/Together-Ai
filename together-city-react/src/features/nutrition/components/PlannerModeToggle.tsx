import type { PlannerMode } from '../plannerMode';

/**
 * Segmented Family / Individual switch that sits above the meal planner. Only
 * rendered when the household actually offers a shared plan (see usePlannerMode
 * → canUseFamily); otherwise the planner is simply the user's own plan and no
 * toggle is shown. Switching is instant — it just changes which plan is loaded.
 */
export function PlannerModeToggle({
  mode, onChange, ownerName, busy,
}: { mode: PlannerMode; onChange: (m: PlannerMode) => void; ownerName?: string | null; busy?: boolean }) {
  const opts: { key: PlannerMode; label: string }[] = [
    { key: 'family', label: 'Family Plan' },
    { key: 'individual', label: 'Individual Plan' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 18px' }}>
      <div role="tablist" aria-label="Meal planner mode"
        style={{ display: 'inline-flex', padding: 4, gap: 4, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999 }}>
        {opts.map((o) => {
          const active = mode === o.key;
          return (
            <button key={o.key} role="tab" aria-selected={active} type="button" disabled={busy}
              onClick={() => onChange(o.key)}
              style={{
                cursor: busy ? 'wait' : 'pointer', borderRadius: 999, padding: '8px 18px', fontSize: 13, fontFamily: 'inherit',
                fontWeight: active ? 800 : 600, border: 'none', transition: 'background .15s, color .15s',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--on-accent)' : 'var(--ink-soft)',
              }}>
              {o.label}
            </button>
          );
        })}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {mode === 'family'
          ? `Shared household meals${ownerName ? ` · ${ownerName}` : ''}, portioned for you.`
          : 'Your own independent AI meal plan.'}
      </span>
    </div>
  );
}
