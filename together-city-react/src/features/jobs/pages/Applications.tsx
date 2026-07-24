import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useApplications } from '../api';

const statusStyle: Record<string, { color: string; label: string }> = {
  applied: { color: '#e65100', label: 'Applied' },
  shortlisted: { color: '#2e7d32', label: 'Shortlisted' },
  rejected: { color: '#c62828', label: 'Not selected' },
};

/** My Applications — track everything you've applied to. */
export function Applications() {
  const q = useApplications();
  if (q.isLoading) return <Spinner label="Loading your applications…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load your applications" hint="Please check your connection and try again." />;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Jobs · Applications</div>
      <h1 style={{ fontSize: 26 }}>Your applications</h1>

      {q.data.length === 0 ? (
        <div>
          <EmptyState icon="📮" title="No applications yet" hint="Apply to your matched roles in one tap." />
          <div style={{ textAlign: 'center' }}><Link to="/jobs/matches"><Button variant="accent" size="sm">See matched roles</Button></Link></div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 8 }}>
          {q.data.map((a) => {
            const s = statusStyle[a.status] ?? statusStyle.applied;
            return (
              <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{a.company} · applied {a.appliedOn}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: s.color, border: `1px solid ${s.color}`, borderRadius: 999, padding: '2px 10px' }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
