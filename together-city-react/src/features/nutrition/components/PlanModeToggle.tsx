import { Chip } from '@/components/ui';
import type { PlanMode } from '../composed.api';

/**
 * My Preferences vs Optimal Health.
 *
 * Both are real compositions of the same engine — "preferred" lets the saved
 * profile drive the plan, "optimal" enforces the clinical targets — so this is
 * a switch that genuinely changes the food, not a display filter. Shared so the
 * individual and family planners offer the identical control.
 */
export function PlanModeToggle({ mode, onChange, busy }: {
  mode: PlanMode;
  onChange: (m: PlanMode) => void;
  busy?: boolean;
}) {
  const OPTIONS: { key: PlanMode; label: string }[] = [
    { key: 'preferred', label: 'My Preferences' },
    { key: 'optimal', label: 'Optimal Health' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '14px 0 0' }}>
      {OPTIONS.map((o) => (
        <Chip key={o.key} selected={mode === o.key} onClick={() => onChange(o.key)}>{o.label}</Chip>
      ))}
      {busy && <span className="muted" style={{ fontSize: 12 }}>updating…</span>}
    </div>
  );
}
