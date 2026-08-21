import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMyPostings, useApplicants, useUpdateApplicationStatus, useDeletePosting, type Posting } from '../api';

const APPLICANT_STATUS: Record<string, { label: string; color: string }> = {
  applied: { label: 'Applied', color: 'var(--warn-ink)' },
  shortlisted: { label: 'Shortlisted', color: 'var(--ok-ink)' },
  rejected: { label: 'Not selected', color: 'var(--danger-ink)' },
};

function Applicants({ posting }: { posting: Posting }) {
  const q = useApplicants(posting.id, true);
  const upd = useUpdateApplicationStatus(posting.id);
  if (q.isLoading) return <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>Loading applicants…</div>;
  const list = q.data?.applicants ?? [];
  if (list.length === 0) return <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>No applicants yet.</div>;
  return (
    <div style={{ marginTop: 8 }}>
      {list.map((a) => {
        const st = APPLICANT_STATUS[a.status] ?? APPLICANT_STATUS.applied;
        return (
        <div key={a.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 13.5 }}>{a.name}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{a.headline || `${a.experienceYears} yrs`}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: st.color, border: `1px solid ${st.color}`, borderRadius: 'var(--r-full)', padding: '1px 8px' }}>{st.label}</span>
            <span className="muted" style={{ fontSize: 11.5 }}>{a.appliedOn}</span>
          </div>
          {a.matchedSkills.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
              {a.matchedSkills.map((s) => <span key={s} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 'var(--r-full)', padding: '1px 8px' }}>✓ {s}</span>)}
            </div>
          )}
          {a.coverNote && <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '6px 0 0' }}>“{a.coverNote}”</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {a.status !== 'shortlisted' && <Button variant="accent" size="sm" disabled={upd.isPending} onClick={() => upd.mutate({ id: a.id, status: 'shortlisted' })}>Shortlist</Button>}
            {a.status !== 'rejected' && <Button variant="line" size="sm" disabled={upd.isPending} onClick={() => upd.mutate({ id: a.id, status: 'rejected' })}>Reject</Button>}
            {a.status !== 'applied' && <Button variant="line" size="sm" disabled={upd.isPending} onClick={() => upd.mutate({ id: a.id, status: 'applied' })}>Reset</Button>}
          </div>
        </div>
        );
      })}
    </div>
  );
}

/** My Postings — the employer dashboard: each posting + its applicants. */
export function Postings() {
  const q = useMyPostings();
  const del = useDeletePosting();
  const [openId, setOpenId] = useState<string | null>(null);

  if (q.isLoading) return <Spinner label="Loading your postings…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load your postings" hint="Please check your connection and try again." />;

  return (
    <div>
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
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 'var(--r-full)', padding: '3px 11px' }}>
                  {p.applicantCount} applicant{p.applicantCount === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {p.skills.map((s) => <span key={s.key} className="muted" style={{ fontSize: 11, border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '2px 9px' }}>{s.label}</span>)}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button variant="line" size="sm" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                  {openId === p.id ? 'Hide applicants' : 'View applicants'}
                </Button>
                <Link to={`/jobs/post?edit=${p.id}`}><Button variant="line" size="sm">Edit</Button></Link>
                <button type="button" disabled={del.isPending}
                  onClick={() => { if (window.confirm(`Delete "${p.title}"? This removes the posting and its ${p.applicantCount} application(s).`)) del.mutate(p.id); }}
                  style={{ background: 'none', border: 'none', color: 'var(--danger-ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto', padding: '2px 4px' }}>
                  Delete
                </button>
              </div>
              {openId === p.id && <Applicants posting={p} />}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
