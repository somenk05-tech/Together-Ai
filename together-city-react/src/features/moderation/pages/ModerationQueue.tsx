import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button, Spinner } from '@/components/ui';
import { useAppeals, useDatingDecision, useDecideAppeal, useDecideReport, useHeldPhotos, usePhotoBackfill, usePhotoDecision, useReportQueue, type Appeal, type HeldPhoto, type ReportGroup } from '../api';

/** The reported citizen's dating profile, set apart from the handle above it
 *  so a moderator can see at a glance where the allegation is pointing. */
const subjectBox: React.CSSProperties = {
  border: '1px solid var(--line)', borderRadius: 'var(--r-1)',
  padding: '8px 10px', margin: '6px 0 0', background: 'var(--paper)',
};
const subjectMeta: React.CSSProperties = { fontSize: 11.5 };
const subjectBio: React.CSSProperties = { margin: '5px 0 0', fontSize: 13, lineHeight: 1.5 };
const subjectNone: React.CSSProperties = { fontSize: 11.5, margin: '4px 0 0' };

/**
 * The moderation queue (FE-13.7).
 *
 * Reports had been accumulating since the hub shipped and nothing read them.
 * This is the reader. It is deliberately plain: a list, the thing reported, how
 * many distinct people reported it, and two buttons.
 *
 * Who reported something is not here, and cannot be — the API counts reporters
 * and does not return them. A moderator who can see the reporter is a moderator
 * who can be asked, and a citizen who suspects that stops reporting.
 */

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Subject({ group }: { group: ReportGroup }) {
  const s = group.subject;

  if (s.gone) {
    return (
      <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
        This {s.kind} has already been deleted. Dismissing closes the reports.
      </p>
    );
  }

  if (s.kind === 'post') {
    return (
      <>
        <div style={{ fontSize: 12.5, marginTop: 2 }} className="muted">
          <Link to={`/social/u/${s.author.handle}`} style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>@{s.author.handle}</Link>
          {' · '}{when(s.createdAt)}
          {s.moderation === 'removed' && <> · <strong style={{ color: 'var(--danger-ink)' }}>already removed</strong></>}
        </div>
        <p style={{ fontSize: 13.5, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
          {s.text?.trim() ? s.text : <span className="muted">No text — the report is about the media or the account.</span>}
        </p>
      </>
    );
  }

  if (s.kind === 'user') {
    const d = s.dating;
    return (
      <div style={{ fontSize: 13, marginTop: 4 }}>
        <Link to={`/social/u/${s.user.handle}`} style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>@{s.user.handle}</Link>
        <span className="muted"> · {s.user.name}</span>
        {/* A reported citizen used to arrive here as a handle and a name, which
            is not enough to judge a dating report: the allegation is usually
            about what is ON the profile. This is the same view any match gets —
            a faster route to it, not a deeper one. The conversation is
            deliberately not here. */}
        {d && (
          <div style={subjectBox}>
            <div className="muted" style={subjectMeta}>
              Dating profile
              {d.shownName ? ` · appears as ${d.shownName}` : ''}
              {d.age != null ? ` · ${d.age}` : ''}
              {d.city ? ` · ${d.city}` : ''}
              {` · ${d.photos} photo${d.photos === 1 ? '' : 's'}`}
              {d.moderation ? ` · ${d.moderation}` : ''}
              {d.visible === false ? ' · not in the pool' : ''}
            </div>
            {d.bio && <p style={subjectBio}>{d.bio}</p>}
          </div>
        )}
        {!d && <div className="muted" style={subjectNone}>No dating profile.</div>}
      </div>
    );
  }

  return (
    <>
      <div style={{ fontSize: 12.5, marginTop: 2 }} className="muted">
        <Link to={`/social/u/${s.comment.author.handle}`} style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>@{s.comment.author.handle}</Link>
        {' · '}{when(s.comment.createdAt)}
      </div>
      <p style={{ fontSize: 13.5, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{s.comment.text}</p>
    </>
  );
}

function Group({ group }: { group: ReportGroup }) {
  const decide = useDecideReport();
  const dating = useDatingDecision();
  const [note, setNote] = useState('');
  const [done, setDone] = useState<'remove' | 'dismiss' | 'dating' | null>(null);

  const canRemove = group.targetType === 'post' && !group.subject.gone;
  // A reported person can be taken out of Dating — their profile, not their
  // account — and the reports are then closed under the same note.
  const canUnlist = group.targetType === 'user' && !group.subject.gone;
  const unlist = () =>
    dating.mutate(
      { userId: group.targetId, decision: 'rejected', reason: note.trim() },
      {
        onSuccess: () => decide.mutate(
          { targetType: group.targetType, targetId: group.targetId, decision: 'dismiss', note: `Taken out of Dating. ${note.trim()}`.trim() },
          { onSuccess: () => setDone('dating') },
        ),
      },
    );
  const act = (decision: 'remove' | 'dismiss') =>
    decide.mutate(
      { targetType: group.targetType, targetId: group.targetId, decision, note: note.trim() || undefined },
      { onSuccess: () => setDone(decision) },
    );

  if (done) {
    return (
      <div className="card" style={{ marginTop: 12, padding: 14 }}>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {done === 'remove' ? 'Removed. ' : done === 'dating' ? 'Taken out of Dating. ' : 'Dismissed. '}
          {group.reportCount} {group.reportCount === 1 ? 'report' : 'reports'} closed.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 13.5, textTransform: 'capitalize' }}>{group.targetType}</strong>
        <span style={{
          fontSize: 11.5, fontWeight: 700, borderRadius: 'var(--r-full)', padding: '2px 9px',
          background: group.distinctReporters >= 3 ? 'var(--danger-soft)' : 'var(--accent-soft)',
          color: group.distinctReporters >= 3 ? 'var(--danger-ink)' : 'var(--accent)',
        }}>
          {group.distinctReporters} {group.distinctReporters === 1 ? 'person' : 'people'}
        </span>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          first reported {when(group.firstReportedAt)}
        </span>
      </div>

      <Subject group={group} />

      {group.reasons.length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5 }} className="muted">
          {group.reasons.map((r, i) => <li key={i} style={{ marginTop: 2 }}>{r}</li>)}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note for the next moderator (optional)"
          maxLength={500}
          style={{
            flex: 1, minWidth: 200, fontSize: 13, fontFamily: 'inherit', padding: '9px 11px',
            border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', color: 'inherit',
          }}
        />
        {canRemove && (
          <Button variant="line" size="sm" disabled={decide.isPending} onClick={() => act('remove')}>
            {decide.isPending ? 'Working…' : 'Remove post'}
          </Button>
        )}
        {canUnlist && (
          // Taking somebody out of Dating is recorded in the console's audit
          // with a reason, so the button waits for one. The note field above
          // is that reason.
          <Button variant="line" size="sm" disabled={dating.isPending || decide.isPending || note.trim().length < 3} onClick={unlist}
            title={note.trim().length < 3 ? 'Write the reason in the note first.' : undefined}>
            {dating.isPending ? 'Working…' : 'Take out of Dating'}
          </Button>
        )}
        <Button variant="line" size="sm" disabled={decide.isPending} onClick={() => act('dismiss')}>
          Dismiss
        </Button>
      </div>

      {canUnlist && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Taking someone out of Dating hides their dating profile from everyone. It does not touch their account. It needs a reason in the note — it is written to the audit.
        </p>
      )}
      {!canRemove && !canUnlist && group.targetType !== 'post' && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Only a post can be removed from here. An account action is not something this screen does.
        </p>
      )}
      {(decide.isError || dating.isError) && (
        <p className="muted" style={{ fontSize: 12, color: 'var(--danger-ink)', marginTop: 8 }}>
          That did not go through. Try again in a moment.
        </p>
      )}
    </div>
  );
}

export function ModerationQueue() {
  const queue = useReportQueue();

  return (
    <div className="page">
      <Breadcrumbs />
      <div className="eyebrow" style={{ marginTop: 10 }}>Moderation</div>
      <h1 style={{ fontSize: 26 }}>Reported</h1>

      {queue.isLoading && <Spinner />}

      {queue.isError && (
        <p className="muted" style={{ fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>
          This queue is for moderators. If you should have access, your handle needs to be in the
          deployment&rsquo;s moderator list — the role is granted from it when the server starts.
        </p>
      )}

      {queue.data && (
        <>
          <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', lineHeight: 1.6 }}>
            {queue.data.openTotal === 0
              ? 'Nothing is waiting. Reports appear here grouped by what they are about, with the most-reported first.'
              : `${queue.data.openTotal} open ${queue.data.openTotal === 1 ? 'report' : 'reports'} across ${queue.data.items.length} ${queue.data.items.length === 1 ? 'thing' : 'things'}, most-reported first. Who reported something is deliberately not shown.`}
          </p>
          {queue.data.items.map((g) => <Group key={`${g.targetType}:${g.targetId}`} group={g} />)}
          <HeldPhotos />
          <Appeals />
        </>
      )}
    </div>
  );
}

const reasonInput: CSSProperties = {
  flex: 1, minWidth: 200, fontSize: 13, fontFamily: 'inherit', padding: '9px 11px',
  border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', color: 'inherit',
};

/**
 * Photos the machine was not sure about. Every dating photo is reviewed
 * before another citizen sees it (26 Aug); the ones Rekognition held wait
 * here for a person, and stay unseen until one decides.
 */
function HeldPhotos() {
  const q = useHeldPhotos();
  const backfill = usePhotoBackfill();
  if (!q.data) return null;
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, margin: 0, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        Photos held for a look
        {/* The pool that existed before photos were reviewed has no verdicts,
            so those photos show to nobody. This queues every one of them.
            Idempotent; safe to press twice. */}
        <Button variant="line" size="sm" disabled={backfill.isPending} onClick={() => backfill.mutate()} title="Queue a review for every photo that predates photo review">
          {backfill.isPending ? 'Queuing…' : backfill.isSuccess ? `Queued ${backfill.data.queued} profiles` : 'Review older photos'}
        </Button>
      </h2>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px', lineHeight: 1.6 }}>
        {q.data.length === 0
          ? 'None waiting. A held photo is one the machine could not clear on its own; nobody else sees it until you decide.'
          : `${q.data.length} waiting, oldest first. Nobody else sees a held photo until you decide.`}
      </p>
      {q.data.map((p) => <HeldPhotoCard key={p.key} photo={p} />)}
    </section>
  );
}

function HeldPhotoCard({ photo }: { photo: HeldPhoto }) {
  const decide = usePhotoDecision();
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 3;
  const act = (decision: 'approved' | 'rejected') => decide.mutate({ key: photo.key, decision, reason: reason.trim() });
  if (decide.isSuccess) return null;
  return (
    <div className="card" style={{ marginTop: 12, padding: 14, display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: 14 }}>
      {photo.url
        ? <img src={photo.url} alt="Held dating photo" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }} />
        : <div className="muted" style={{ fontSize: 12 }}>Could not load the photo.</div>}
      <div>
        <div className="muted" style={{ fontSize: 12 }}>{photo.labels || 'No labels'} · {when(photo.createdAt)}</div>
        {photo.reason && <div style={{ fontSize: 12.5, marginTop: 4 }}>{photo.reason}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (written to the audit)" maxLength={500} style={reasonInput} />
          <Button variant="line" size="sm" disabled={!ok || decide.isPending} onClick={() => act('approved')}>Show it</Button>
          <Button variant="line" size="sm" disabled={!ok || decide.isPending} onClick={() => act('rejected')}>Remove it</Button>
        </div>
      </div>
    </div>
  );
}

/** Citizens arguing with a decision on their own profile or photo. */
function Appeals() {
  const q = useAppeals();
  if (!q.data) return null;
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, margin: 0 }}>Appeals</h2>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px', lineHeight: 1.6 }}>
        {q.data.length === 0 ? 'None open.' : `${q.data.length} open, oldest first. Overturning puts the profile or photo back; either way the person is told.`}
      </p>
      {q.data.map((a) => <AppealCard key={a.id} appeal={a} />)}
    </section>
  );
}

function AppealCard({ appeal }: { appeal: Appeal }) {
  const decide = useDecideAppeal();
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 3;
  if (decide.isSuccess) return null;
  return (
    <div className="card" style={{ marginTop: 12, padding: 14 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {appeal.kind === 'dating_profile' ? 'Profile' : 'Photo'} · {when(appeal.createdAt)}
      </div>
      <p style={{ fontSize: 13.5, margin: '8px 0 0', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{appeal.text}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Your reason — the person reads this" maxLength={500} style={reasonInput} />
        <Button variant="line" size="sm" disabled={!ok || decide.isPending} onClick={() => decide.mutate({ id: appeal.id, decision: 'overturned', reason: reason.trim() })}>Overturn</Button>
        <Button variant="line" size="sm" disabled={!ok || decide.isPending} onClick={() => decide.mutate({ id: appeal.id, decision: 'upheld', reason: reason.trim() })}>Uphold</Button>
      </div>
    </div>
  );
}
