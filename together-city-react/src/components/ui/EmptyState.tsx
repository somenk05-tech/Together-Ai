import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  hint?: string;
  /**
   * The one thing to do from here.
   *
   * FE-3.2 asks for a "nothing here yet + add" card, and the add half was
   * missing — so every empty state told somebody a list was empty and left them
   * to find the way out of it. Deliberately singular: two equal buttons on an
   * empty screen is a decision nobody has the context to make yet.
   */
  action?: ReactNode;
}

export function EmptyState({ icon = '◈', title, hint, action }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>{icon}</div>
      <p style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</p>
      {hint && <p style={{ fontSize: 13, marginTop: 4 }}>{hint}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
      {icon === '⚠️' && (
        <p style={{ fontSize: 12.5, marginTop: 14 }}>
          Keeps happening? <Link to="/help" style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>Help</Link> has a way to reach us.
        </p>
      )}
    </div>
  );
}
