import type { ReactNode } from 'react';

export interface ActionBarProps {
  children: ReactNode;
  /** Sticks to the bottom of the viewport (for long forms / editors). */
  sticky?: boolean;
  /** Horizontal alignment of the actions. */
  align?: 'start' | 'center' | 'end' | 'between';
  style?: React.CSSProperties;
}

const JUSTIFY: Record<NonNullable<ActionBarProps['align']>, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between',
};

/**
 * Standard action bar (audit 9.1) — a consistent row for a page or modal's
 * primary/secondary actions. Optionally sticky at the bottom for long editors.
 */
export function ActionBar({ children, sticky, align = 'end', style }: ActionBarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, justifyContent: JUSTIFY[align], flexWrap: 'wrap',
      ...(sticky ? {
        position: 'sticky', bottom: 0, background: 'var(--card)', borderTop: '1px solid var(--line)',
        padding: '12px 0', marginTop: 8, zIndex: 5,
      } : {}),
      ...style,
    }}>
      {children}
    </div>
  );
}
