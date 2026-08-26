import { Link } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useState } from 'react';
import { useDatingAdminStats, useDatingFunnel } from '../api';

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
      <div className="page-note">
        <EmptyState icon="🔒" title="Admin access required" hint="This page is limited to Dating Hub admins. Add your handle to the MODERATION_ADMINS environment variable on the API, then reload." />
        <div style={{ textAlign: 'center', marginTop: 14 }}><Link to="/dating"><Button variant="line">Back to Dating Hub</Button></Link></div>
      </div>
    );
  }

  const s = q.data;
  return (
    <div>
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
        <Stat label="Paused" value={s.paused ?? s.pausedHidden} hint="Out of matching; their matches keep working" />
        <Stat label="Hidden" value={s.hidden ?? 0} hint="Gone from everyone" />
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

      <Funnel />

      <div style={{ textAlign: 'center', marginTop: 26 }}>
        <Link to="/dating"><Button variant="line">Back to Dating Hub</Button></Link>
      </div>
    </div>
  );
}

const STEP_LABEL: Record<string, string> = {
  'dating.profile.started': 'Started a profile',
  'dating.profile.approved': 'Profile went live',
  'dating.matches.viewed': 'Opened their matches',
  'dating.like': 'Liked somebody',
  'dating.match': 'Matched',
  'dating.connect': 'Opened a chat',
};

/**
 * Where people stop. Distinct people per step over the window, each as a
 * share of the step before — the number that says whether the thesis is
 * landing, which the counts above cannot. First-party (AppEvent), no SDK.
 */
function Funnel() {
  const [days, setDays] = useState(7);
  const q = useDatingFunnel(days);
  const max = Math.max(1, ...(q.data?.distribution.map((d) => d.count) ?? [1]));
  return (
    <>
      <h2 style={{ fontSize: 16, margin: '26px 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        Where people stop
        <span style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
          {[1, 7, 30].map((d) => (
            <Button key={d} size="sm" variant={d === days ? 'accent' : 'line'} onClick={() => setDays(d)}>{d}d</Button>
          ))}
        </span>
      </h2>
      {q.isLoading && <Spinner />}
      {q.isError && <p className="muted" style={{ fontSize: 13 }}>The funnel needs the console&rsquo;s moderation.read permission.</p>}
      {q.data && (
        <>
          <div className="card" style={{ padding: '6px 18px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr className="muted" style={{ fontSize: 12, textAlign: 'left' }}>
                  <th style={{ padding: '8px 0', fontWeight: 600 }}>Step</th>
                  <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>People</th>
                  <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Of previous</th>
                </tr>
              </thead>
              <tbody>
                {q.data.steps.map((st) => (
                  <tr key={st.name} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 0' }}>{STEP_LABEL[st.name] ?? st.name}</td>
                    <td style={{ padding: '9px 0', textAlign: 'right', fontWeight: 700 }}>{st.users}</td>
                    <td style={{ padding: '9px 0', textAlign: 'right' }} className="muted">{st.ofPrevious == null ? '—' : `${st.ofPrevious}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
            {q.data.counts['dating.report'] ?? 0} reports · {q.data.photosHeld} photos held · {q.data.appealsOpen} appeals open · {q.data.counts['dating.pass'] ?? 0} passes
          </p>

          <h2 style={{ fontSize: 16, margin: '22px 0 10px' }}>Where the numbers sit</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
            The percentage on every pair somebody acted on — {q.data.scoredPairs} pairs, most recent first.
          </p>
          <div className="card" style={{ padding: 16, display: 'grid', gap: 6 }}>
            {q.data.distribution.map((d) => (
              <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 48px', alignItems: 'center', gap: 10, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                <span className="muted">{d.label}%</span>
                <span style={{ height: 8, borderRadius: 4, background: 'var(--accent)', width: `${Math.round((d.count / max) * 100)}%`, minWidth: d.count ? 4 : 0 }} />
                <span style={{ textAlign: 'right', fontWeight: 600 }}>{d.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
