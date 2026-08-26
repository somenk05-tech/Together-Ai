import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button, Spinner } from '@/components/ui';
import { useDatingDecision, useDecideReport, useReportQueue, type ReportGroup } from '../api';

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
    return (
      <div style={{ fontSize: 13, marginTop: 4 }}>
        <Link to={`/social/u/${s.user.handle}`} style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>@{s.user.handle}</Link>
        <span className="muted"> · {s.user.name}</span>
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
      { userId: group.targetId, decision: 'rejected', reason: note.trim() || undefined },
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
          <Button variant="line" size="sm" disabled={dating.isPending || decide.isPending} onClick={unlist}>
            {dating.isPending ? 'Working…' : 'Take out of Dating'}
          </Button>
        )}
        <Button variant="line" size="sm" disabled={decide.isPending} onClick={() => act('dismiss')}>
          Dismiss
        </Button>
      </div>

      {canUnlist && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Taking someone out of Dating hides their dating profile from everyone. It does not touch their account.
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
        </>
      )}
    </div>
  );
}
