import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button, Spinner } from '@/components/ui';
import { useAppeals, useDatingDecision, useDecideAppeal, useDecideReport, useHeldPhotos, useHeldProfiles, usePhotoBackfill, useProfileDecision, usePhotoDecision, useReportQueue, type Appeal, type HeldPhoto, type ReportGroup } from '../api';
import { useAdminMe } from '@/features/admin/api';

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
              Matchmaking profile
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
        {!d && <div className="muted" style={subjectNone}>No matchmaking profile.</div>}
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

const suspendBtn: CSSProperties = { color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' };
function Group({ group }: { group: ReportGroup }) {
  const decide = useDecideReport();
  const dating = useDatingDecision();
  const [note, setNote] = useState('');
  const [done, setDone] = useState<'remove' | 'dismiss' | 'dating' | 'warn' | 'suspend' | null>(null);

  const canRemove = group.targetType === 'post' && !group.subject.gone;
  // A reported person can be taken out of Dating — their profile, not their
  // account — and the reports are then closed under the same note.
  const me = useAdminMe();
  const canUnlist = group.targetType === 'user' && !group.subject.gone;
  const unlist = () =>
    dating.mutate(
      { userId: group.targetId, decision: 'rejected', reason: note.trim() },
      {
        onSuccess: () => decide.mutate(
          { targetType: group.targetType, targetId: group.targetId, decision: 'dismiss', note: `Taken out of Matchmaking. ${note.trim()}`.trim() },
          { onSuccess: () => setDone('dating') },
        ),
      },
    );
  // A reported PERSON now has real outcomes from this queue (third audit, 04):
  // a warning they read, or a suspension that closes the account until an admin
  // restores it. Both go through the same moderation.act permission as dismiss.
  const canActOnUser = group.targetType === 'user' && !group.subject.gone;
  // SUSPENSION IS A SECOND PERMISSION (launch audit, 27 Aug). Closing an account
  // needs `users.suspend`, which the `moderator` role does not hold — and which
  // is also what RESTORING one needs, so a moderator offered the button could
  // shut a door they could not open. The server refuses it either way; this is
  // so the refusal is not delivered as a button.
  const canSuspend = canActOnUser && (me.data?.permissions ?? []).some((p) => p.key === 'users.suspend');
  const act = (decision: 'remove' | 'dismiss' | 'warn' | 'suspend') =>
    decide.mutate(
      { targetType: group.targetType, targetId: group.targetId, decision, note: note.trim() || undefined },
      { onSuccess: () => setDone(decision) },
    );

  if (done) {
    return (
      <div className="card" style={{ marginTop: 12, padding: 14 }}>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {done === 'remove' ? 'Removed. ' : done === 'dating' ? 'Taken out of Matchmaking. ' : done === 'suspend' ? 'Account suspended. ' : done === 'warn' ? 'Warning sent. ' : 'Dismissed. '}
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
            {dating.isPending ? 'Working…' : 'Take out of Matchmaking'}
          </Button>
        )}
        {canActOnUser && (
          <Button variant="line" size="sm" disabled={decide.isPending} onClick={() => act('warn')}>
            Warn
          </Button>
        )}
        {canSuspend && (
          <Button variant="line" size="sm" disabled={decide.isPending || note.trim().length < 3} onClick={() => act('suspend')}
            title={note.trim().length < 3 ? 'Write the reason in the note first.' : undefined}
            style={suspendBtn}>
            {decide.isPending ? 'Working…' : 'Suspend account'}
          </Button>
        )}
        <Button variant="line" size="sm" disabled={decide.isPending} onClick={() => act('dismiss')}>
          Dismiss
        </Button>
      </div>

      {canUnlist && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Taking someone out of Matchmaking hides their matchmaking profile from everyone. It does not touch their account. It needs a reason in the note — it is written to the audit.
        </p>
      )}
      {canActOnUser && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Warn sends the person a message{canSuspend ? '; Suspend closes their account until an admin restores it' : ''}. {canSuspend ? 'Both are' : 'It is'} written to the audit, and neither tells them who reported.{canSuspend ? ' Suspend needs a reason in the note.' : ''}
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
          <HeldProfiles />
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
 * PROFILES THE MACHINE COULD NOT CLEAR — a screen that has never existed.
 *
 * `moderation: 'review'` is what a soft failure in the bio checks writes: an AI
 * that returned nothing, a check that could not run. It takes the citizen out
 * of the pool immediately, because poolWhere demands `approved`. Nothing in the
 * product ever listed those rows: adminStats counted them, this console had
 * reports, photos and appeals, and the decision route needs a userId a
 * moderator could only get from a report. So somebody whose bio tripped a soft
 * check was invisible to the city and invisible to the people who could fix it,
 * and their only way out was to find the Safety Centre unprompted and appeal a
 * decision nobody had told them about. (Fourth audit, 28 Aug.)
 *
 * `pending` older than an hour is here for the same reason it is on the photo
 * queue: it is not a verdict, it is the absence of one, and a pile of them
 * means the pipeline itself has stopped.
 */
function HeldProfiles() {
  const q = useHeldProfiles();
  const decide = useProfileDecision();
  const [reason, setReason] = useState<Record<string, string>>({});
  if (!q.data) return null;
  const stuck = q.data.filter((p) => p.status === 'pending').length;
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, margin: 0 }}>Profiles held for a look</h2>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px', lineHeight: 1.6 }}>
        {q.data.length === 0
          ? 'Nothing waiting. A profile lands here when a check could not clear it — it is out of the pool until somebody decides.'
          : `${q.data.length} waiting, longest first. Each is out of the pool right now.${stuck ? ` ${stuck} of them are still \u2018pending\u2019 after an hour, which usually means the checks themselves have stopped.` : ''}`}
      </p>
      {q.data.map((p) => (
        <article key={p.userId} className="card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15 }}>{p.name}</strong>
            {/* No handle: a-name-of-your-own forbids the dating module from
                selecting it at all, and a decision here turns on the age, the
                bio and what the checks said — not on who they are in the rest
                of the city. */}
            {p.age != null && <span className="muted" style={{ fontSize: 12.5 }}>{p.age}</span>}
            <span className="tag">{p.status}</span>
            <span className="muted" style={{ fontSize: 12 }}>waiting since {new Date(p.waitingSince).toLocaleDateString()}</span>
          </div>
          {p.bio && <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 0' }}>{p.bio}</p>}
          {p.reasons.length > 0 && (
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0', lineHeight: 1.55 }}>
              What the checks said: {p.reasons.join(' \u00b7 ')}
            </p>
          )}
          {/* A written reason, like every other moderator action in this
              console. It goes to the audit log, not to the citizen — they get a
              plain sentence and the Safety Centre. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <input style={reasonInput} placeholder="Why (goes to the audit log)"
              value={reason[p.userId] ?? ''} onChange={(e) => setReason({ ...reason, [p.userId]: e.target.value })} />
            <Button variant="line" size="sm" disabled={decide.isPending || !(reason[p.userId] ?? '').trim()}
              onClick={() => decide.mutate({ userId: p.userId, decision: 'approved', reason: (reason[p.userId] ?? '').trim() })}>
              Let it through
            </Button>
            <Button variant="line" size="sm" disabled={decide.isPending || !(reason[p.userId] ?? '').trim()}
              onClick={() => decide.mutate({ userId: p.userId, decision: 'rejected', reason: (reason[p.userId] ?? '').trim() })}>
              Take it down
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}

/**
 * Photos the machine was not sure about. Every dating photo is reviewed
 * before another citizen sees it (26 Aug); the ones Rekognition held wait
 * here for a person, and stay unseen until one decides.
 */
function HeldPhotos() {
  const q = useHeldPhotos();
  const backfill = usePhotoBackfill();
  const stalled = (q.data ?? []).filter((p) => p.status === 'pending').length;
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
      {/* Two kinds of row since 28 Aug. `held` is a verdict asking for a person.
          `pending` is the absence of a verdict, and a pile of them means photo
          review itself has stopped — which is why they are here rather than
          only in a log line nobody reads. */}
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px', lineHeight: 1.6 }}>
        {q.data.length === 0
          ? 'None waiting. A held photo is one the machine could not clear on its own; nobody else sees it until you decide.'
          : `${q.data.length} waiting, oldest first. Nobody else sees any of these until you decide.`}
      </p>
      {stalled > 0 && (
        <p style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.6, color: 'var(--danger-ink)' }}>
          {stalled === 1 ? 'One photo has' : `${stalled} photos have`} been waiting without ever being looked at.
          That is what a stopped photo pipeline looks like — check that the review service is configured before deciding these by hand.
        </p>
      )}
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
        ? <img src={photo.url} alt="Held matchmaking photo" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }} />
        : <div className="muted" style={{ fontSize: 12 }}>Could not load the photo.</div>}
      <div>
        <div className="muted" style={{ fontSize: 12 }}>
          {photo.status === 'pending' ? 'Never looked at' : (photo.labels || 'No labels')} · {when(photo.createdAt)}
        </div>
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

const appealFacts: CSSProperties = { fontSize: 12, color: 'var(--muted)', marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' };
const appealFactUnder: CSSProperties = { color: 'var(--danger-ink)', fontWeight: 600 };
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
      {/* THE PHOTOGRAPH, OR WHY THERE ISN'T ONE. (Fourth audit, 28 Aug.)
          A photo appeal was decided on the appellant's sentence alone, which
          is worse than the profile case this row already fixed: the whole
          question is what is in the image. A `held` photo still exists and is
          signed like any other. A `rejected` one was deleted at refusal, so
          there is nothing to show — and saying so is the point, because an
          overturn is then a ruling on a description. It still means something:
          it clears the record and lets them upload it again. */}
      {appeal.kind === 'dating_photo' && (
        appeal.url
          ? <img src={appeal.url} alt="" style={{ display: 'block', maxWidth: 220, maxHeight: 220, objectFit: 'cover', borderRadius: 10, margin: '10px 0' }} />
          : <p className="muted" style={{ fontSize: 12.5, margin: '10px 0', lineHeight: 1.55 }}>
              {appeal.photoGone
                ? 'The photograph was deleted when it was refused — there is nothing left to look at. Overturning still clears the record and lets them upload it again.'
                : 'No image available for this appeal.'}
            </p>
      )}
      {appeal.kind === 'dating_profile' && (
        // Blocker 06: the facts an overturn turns on, in front of the moderator
        // rather than in a database they can't see. An under-18 reads loudest,
        // because an overturn on that profile is exactly the mistake this row
        // exists to stop — and the server refuses it regardless.
        <div style={appealFacts}>
          {typeof appeal.age === 'number' && (
            <span style={appeal.age < 18 ? appealFactUnder : undefined}>
              Age {appeal.age}{appeal.age < 18 ? ' — under 18, cannot be reinstated' : ''}
            </span>
          )}
          {appeal.profileModeration && <span>· {appeal.profileModeration}</span>}
          {(appeal.rejectionReasons ?? []).length > 0 && <span>· rejected: {(appeal.rejectionReasons ?? []).join('; ')}</span>}
        </div>
      )}
      <p style={{ fontSize: 13.5, margin: '8px 0 0', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{appeal.text}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Your reason — the person reads this" maxLength={500} style={reasonInput} />
        <Button variant="line" size="sm" disabled={!ok || decide.isPending} onClick={() => decide.mutate({ id: appeal.id, decision: 'overturned', reason: reason.trim() })}>Overturn</Button>
        <Button variant="line" size="sm" disabled={!ok || decide.isPending} onClick={() => decide.mutate({ id: appeal.id, decision: 'upheld', reason: reason.trim() })}>Uphold</Button>
      </div>
    </div>
  );
}
