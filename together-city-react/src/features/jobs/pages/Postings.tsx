import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMyPostings, useApplicants, type Posting } from '../api';

function Applicants({ posting }: { posting: Posting }) {
  const q = useApplicants(posting.id, true);
  if (q.isLoading) return <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>Loading applicants…</div>;
  const list = q.data?.applicants ?? [];
  if (list.length === 0) return <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>No applicants yet.</div>;
  return (
    <div style={{ marginTop: 8 }}>
      {list.map((a) => (
        <div key={a.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 13.5 }}>{a.name}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{a.headline || `${a.experienceYears} yrs`}</span>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>{a.appliedOn}</span>
          </div>
          {a.matchedSkills.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
              {a.matchedSkills.map((s) => <span key={s} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '1px 8px' }}>✓ {s}</span>)}
            </div>
          )}
          {a.coverNote && <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '6px 0 0' }}>“{a.coverNote}”</p>}
        </div>
      ))}
    </div>
  );
}

/** My Postings — the employer dashboard: each posting + its applicants. */
export function Postings() {
  const q = useMyPostings();
  const [openId, setOpenId] = useState<string | null>(null);

  if (q.isLoading) return <Spinner label="Loading your postings…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load your postings" hint="Please check your connection and try again." />;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Jobs · My Postings</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Your postings</h1>
        <Link to="/jobs/post" style={{ marginLeft: 'auto' }}><Button variant="accent" size="sm">＋ Post a job</Button></Link>
      </div>

      {q.data.length === 0 ? (
        <EmptyState icon="📋" title="No postings yet" hint="Publish a role and applicants will show up here." />
      ) : (
        <div style={{ marginTop: 16 }}>
          {q.data.map((p) => (
            <article key={p.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15 }}>{p.title}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>{p.company} · {p.location}{p.remote ? ' · Remote' : ''} · ₹{p.salaryLpa} LPA</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '3px 11px' }}>
                  {p.applicantCount} applicant{p.applicantCount === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {p.skills.map((s) => <span key={s.key} className="muted" style={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{s.label}</span>)}
              </div>
              <div style={{ marginTop: 10 }}>
                <Button variant="line" size="sm" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                  {openId === p.id ? 'Hide applicants' : 'View applicants'}
                </Button>
              </div>
              {openId === p.id && <Applicants posting={p} />}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
