import { Link } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useDatingAdminStats } from '../api';

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent-ink)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 6 }}>{label}</div>
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/** Admin-only Dating Hub stats (gated server-side to MODERATION_ADMINS). */
export function DatingAdminStats() {
  const q = useDatingAdminStats();

  if (q.isLoading) return <Spinner label="Loading Dating Hub stats…" />;

  if (q.isError || !q.data) {
    return (
      <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
        <EmptyState icon="🔒" title="Admin access required" hint="This page is limited to Dating Hub admins. Add your handle to the MODERATION_ADMINS environment variable on the API, then reload." />
        <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/dating"><Button variant="line">Back to Dating Hub</Button></Link></div>
      </div>
    );
  }

  const s = q.data;
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px 48px' }}>
      <div className="eyebrow">Dating Hub · Admin</div>
      <h1 style={{ fontSize: 26 }}>Dating Hub stats</h1>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 20px' }}>
        Live counts from the database. Updated {new Date(s.generatedAt).toLocaleString()}.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Stat label="Registered profiles" value={s.totalProfiles} hint="Everyone who created a dating profile" />
        <Stat label="Live in matching" value={s.approvedVisible} hint="Approved & visible" />
        <Stat label="Pending review" value={s.pendingReview} />
        <Stat label="Rejected" value={s.rejected} />
        <Stat label="Paused / hidden" value={s.pausedHidden} />
        <Stat label="Connected members" value={s.connectedMembers} hint="Opened ≥1 chat" />
        <Stat label="Active chats" value={s.activeChats} hint="Open anonymous conversations" />
        <Stat label="Total matches" value={s.totalMatches} hint="Mutual matches formed" />
      </div>

      <h2 style={{ fontSize: 16, margin: '26px 0 10px' }}>Gender split</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Stat label="Male" value={s.gender.male} />
        <Stat label="Female" value={s.gender.female} />
        <Stat label="Non-binary" value={s.gender.nonbinary} />
      </div>

      <div style={{ textAlign: 'center', marginTop: 26 }}>
        <Link to="/dating"><Button variant="line">Back to Dating Hub</Button></Link>
      </div>
    </div>
  );
}
