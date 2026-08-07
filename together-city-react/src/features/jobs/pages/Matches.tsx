import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useJobMatches, useApply, type JobMatch } from '../api';
import { ShareToChat } from '@/features/chat/share';
import type { ShareCard } from '@/types';

const scoreColor = (s: number) => (s >= 75 ? 'var(--ok-ink)' : s >= 50 ? 'var(--warn-ink)' : 'var(--muted)');
const FIT: Record<string, { label: string; color: string }> = {
  strong: { label: 'Strong fit', color: 'var(--ok-ink)' },
  good: { label: 'Good fit', color: 'var(--ok-ink)' },
  fair: { label: 'Fair fit', color: 'var(--warn-ink)' },
  weak: { label: 'Low fit', color: 'var(--muted)' },
};

/** Rich chat share-card for a job. */
function jobShareCard(job: JobMatch): ShareCard {
  return {
    kind: 'job', hub: 'Jobs', title: job.title,
    subtitle: [job.company, job.location, job.remote ? 'Remote' : ''].filter(Boolean).join(' • '),
    image: null,
    meta: [`₹${job.salaryLpa} LPA`, `${job.score}% match`],
    deepLink: '/jobs/matches',
  };
}

function JobCard({ job }: { job: JobMatch }) {
  const apply = useApply();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const applied = done || job.applied;

  return (
    <article className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div role="img" aria-label={`${job.score} percent match — ${FIT[job.fitLabel ?? 'fair']?.label ?? 'fit'}`}
          style={{ width: 54, height: 54, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--accent-soft)', color: scoreColor(job.score), fontWeight: 800, fontSize: 16 }}>
          {job.score}%
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15.5 }}>{job.title}</strong>
            {job.fitLabel && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: FIT[job.fitLabel]?.color, border: `1px solid ${FIT[job.fitLabel]?.color}`, borderRadius: 999, padding: '1px 7px' }}>{FIT[job.fitLabel]?.label}</span>}
            {job.postedByYou && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-ink)', border: '1px solid var(--accent)', borderRadius: 999, padding: '1px 7px' }}>Your posting</span>}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>{job.company} · {job.location}{job.remote ? ' · Remote' : ''} · ₹{job.salaryLpa} LPA</div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>{job.blurb}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {job.matchedSkills.map((s) => (
              <span key={s.key} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 9px' }}>✓ {s.label}</span>
            ))}
            {job.missingSkills.map((s) => (
              <span key={s.key} style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{s.label}</span>
            ))}
          </div>
          {job.reasons.length > 0 && <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Why: {job.reasons.join(' · ')}</p>}

          <div style={{ marginTop: 12 }}>
            {applied ? (
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)' }}>✓ Applied · <Link to="/jobs/applications" style={{ color: 'var(--accent-ink)' }}>Track it</Link></span>
            ) : open ? (
              <div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a short note to the recruiter (optional)"
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="accent" size="sm" disabled={apply.isPending}
                    onClick={() => apply.mutate({ jobId: job.id, coverNote: note || undefined }, { onSuccess: () => setDone(true) })}>
                    {apply.isPending ? 'Applying…' : 'Submit application'}
                  </Button>
                  <Button variant="line" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>🔒 Applying shares your headline & matched skills with <strong>{job.company}</strong> only.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button variant="accent" size="sm" onClick={() => setOpen(true)}>Apply</Button>
                <ShareToChat item={jobShareCard(job)} label="Send" />
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Matched Roles — every open posting, scored against your parsed profile. */
export function Matches() {
  const q = useJobMatches();
  if (q.isLoading) return <Spinner label="Matching you to roles…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load your matches" hint="Please check your connection and try again." />;

  if (!q.data.hasProfile) {
    return (
      <div>
        <div className="eyebrow">Jobs · Jobs for you</div>
        <h1 style={{ fontSize: 26 }}>Upload your resume first</h1>
        <div className="card" style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13.5, margin: 0 }}>We match roles to your parsed skills — add your resume to get started.</p>
          <div style={{ marginTop: 12 }}><Link to="/jobs/profile"><Button variant="accent" size="sm">Add my resume</Button></Link></div>
        </div>
      </div>
    );
  }

  // Don't show the user their own postings among their matches.
  const visible = q.data.matches.filter((m) => !m.postedByYou);
  const isWeak = (m: JobMatch) => (m.fitLabel ? m.fitLabel === 'weak' : m.score < 35);
  const good = visible.filter((m) => !isWeak(m));
  const weak = visible.filter(isWeak);

  return (
    <div>
      <div className="eyebrow">Jobs · Jobs for you</div>
      <h1 style={{ fontSize: 26 }}>Jobs for you</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        {good.length} strong{good.length === 1 ? ' match' : ' matches'}, ranked by fit. ✓ = a skill you have; plain = a skill the role wants.
      </p>

      {good.length === 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>No strong matches yet</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
            Add more skills or experience to your <Link to="/jobs/profile" style={{ color: 'var(--accent-ink)' }}>resume</Link>, or broaden your preferences — better roles will surface here.
          </p>
        </div>
      )}

      {good.map((j) => <JobCard key={j.id} job={j} />)}

      {weak.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: '20px 0 10px', fontWeight: 600 }}>Other open roles ({weak.length}) — a weaker fit for your profile</p>
          {weak.map((j) => <JobCard key={j.id} job={j} />)}
        </>
      )}
    </div>
  );
}
