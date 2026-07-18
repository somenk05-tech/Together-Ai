export interface EmptyStateProps { icon?: string; title: string; hint?: string; }

export function EmptyState({ icon = '◈', title, hint }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>{icon}</div>
      <p style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</p>
      {hint && <p style={{ fontSize: 13, marginTop: 4 }}>{hint}</p>}
    </div>
  );
}
