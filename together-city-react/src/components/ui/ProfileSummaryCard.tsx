import type { ReactNode } from 'react';
import { Button } from './Button';

export interface SummaryField { label: string; value: ReactNode }

export interface ProfileSummaryCardProps {
  title: ReactNode;
  fields: SummaryField[];
  onEdit: () => void;
  /** Briefly flashes a "Saved ✓" eyebrow right after a successful save. */
  justSaved?: boolean;
  editLabel?: string;
  children?: ReactNode;
  style?: React.CSSProperties;
}

/**
 * The standard collapsed profile summary (audit 9.2). After a profile saves,
 * every hub collapses into THIS card — same layout, same Edit control, same
 * "Saved ✓" flash — so the Collapse → Summary → Edit pattern a user learns in
 * one hub holds everywhere.
 */
export function ProfileSummaryCard({ title, fields, onEdit, justSaved, editLabel = 'Edit', children, style }: ProfileSummaryCardProps) {
  return (
    <div className="card rise" style={{ padding: '20px 22px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          {justSaved && <div className="eyebrow" style={{ color: 'var(--accent-ink)' }}>Saved ✓</div>}
          <h3 style={{ margin: justSaved ? '2px 0 0' : 0, fontSize: 18 }}>{title}</h3>
        </div>
        <Button variant="line" size="sm" onClick={onEdit}>{editLabel}</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px 18px' }}>
        {fields.map((f) => (
          <div key={f.label} style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{f.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, wordBreak: 'break-word' }}>{f.value}</div>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
