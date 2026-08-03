import type { ReactNode } from 'react';

type ChipTone = 'default' | 'accent' | 'green' | 'red' | 'amber';

const TONES: Record<ChipTone, { bg: string; fg: string; bd: string }> = {
  default: { bg: 'var(--card)', fg: 'var(--ink)', bd: 'var(--line)' },
  accent: { bg: 'var(--card)', fg: 'var(--accent-ink)', bd: 'var(--accent-line)' },
  green: { bg: 'var(--card)', fg: 'var(--ok-ink)', bd: 'var(--ok-line)' },
  red: { bg: 'var(--card)', fg: 'var(--danger-ink)', bd: 'var(--danger-line)' },
  amber: { bg: 'var(--card)', fg: 'var(--warn-ink)', bd: 'var(--warn-line)' },
};

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  icon?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  title?: string;
  style?: React.CSSProperties;
}

/**
 * Compact labelled token (audit 9.1) — for metadata, filters and attributes.
 * Static by default; pass onClick to make it a selectable filter chip. Distinct
 * from Tag (inline status word) and Pill (nav/segment toggle).
 */
export function Chip({ children, tone = 'default', icon, onClick, selected, title, style }: ChipProps) {
  const t = selected ? TONES.accent : TONES[tone];
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
    fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, background: t.bg, color: t.fg,
    border: `1px solid ${selected ? 'var(--accent)' : t.bd}`, whiteSpace: 'nowrap', ...style,
  };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} aria-pressed={selected}
        style={{ ...base, cursor: 'pointer', fontFamily: 'inherit' }}>
        {icon}{children}
      </button>
    );
  }
  return <span title={title} style={base}>{icon}{children}</span>;
}
