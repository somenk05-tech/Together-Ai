import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  title: ReactNode;
  sub?: ReactNode;
  /** Right-aligned slot — usually a "See all →" link or a small action. */
  action?: ReactNode;
  style?: React.CSSProperties;
}

/**
 * Standard section header used to open a block within a page (audit 9.1).
 * One consistent title/sub + optional right-aligned action across every hub, so
 * sections read the same everywhere instead of each page rolling its own.
 */
export function SectionHeader({ title, sub, action, style }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, margin: '0 0 14px', ...style }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: 'clamp(17px,2vw,21px)', margin: 0, lineHeight: 1.2 }}>{title}</h2>
        {sub && <p className="muted" style={{ fontSize: 13, margin: '4px 0 0', lineHeight: 1.5 }}>{sub}</p>}
      </div>
      {action && <div style={{ flexShrink: 0, fontSize: 13, fontWeight: 600 }}>{action}</div>}
    </div>
  );
}
