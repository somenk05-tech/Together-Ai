import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useMailMessage, useMailThread, useMailAccount, useFlagMail, useRemoveMail,
  humanBytes, initials, avatarHue, type MailMessage,
} from '../api';

/** One message inside a trail. */
function TrailMessage({ m, mine }: { m: MailMessage; mine: boolean }) {
  const hue = avatarHue(m.fromAddr);
  const when = new Date(m.createdAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, color: '#fff', background: m.system ? 'var(--accent)' : `hsl(${hue},52%,45%)` }}>
          {m.system ? '🏙' : initials(m.fromName)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>
            {mine ? 'You' : m.fromName} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>&lt;{m.fromAddr}&gt;</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>to {m.toAddr}</div>
        </div>
        <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when}</div>
      </div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.6, marginTop: 10 }}>{m.body}</div>
    </div>
  );
}

/** Read a mail thread (trail) and reply into it. */
export function MessageView() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useMailMessage(id);
  const acct = useMailAccount();
  const thread = useMailThread(q.data?.threadId);
  const flag = useFlagMail();
  const remove = useRemoveMail();

  if (q.isLoading) return <Spinner label="Opening message…" />;
  if (q.isError || !q.data) return <div style={{ padding: 28 }}><EmptyState title="Couldn't open message" hint="It may have been deleted." /></div>;

  const m = q.data;
  const myAddr = acct.data?.address ?? '';
  // The whole trail if we have it; otherwise just this message.
  const trail = thread.data && thread.data.length > 0 ? thread.data : [m];
  const latest = trail[trail.length - 1];
  // Reply goes to the other party of the most recent message.
  const replyTo = latest.fromAddr === myAddr ? latest.toAddr : latest.fromAddr;
  const replySubject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
  const totalBytes = trail.reduce((s, x) => s + x.sizeBytes, 0);

  const openReply = () => {
    const p = new URLSearchParams({ to: replyTo, subject: replySubject });
    if (m.threadId) p.set('threadId', m.threadId);
    nav(`/mail/compose?${p.toString()}`);
  };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="line" size="sm" onClick={() => nav(-1)}>← Back</Button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="line" size="sm" onClick={() => flag.mutate({ id: m.id, starred: !m.starred })}>{m.starred ? '★ Starred' : '☆ Star'}</Button>
          {!m.system && <Button variant="accent" size="sm" onClick={openReply}>↩ Reply</Button>}
          <Button variant="line" size="sm" onClick={() => remove.mutate(m.id, { onSuccess: () => nav('/mail/inbox') })}>🗑 Delete</Button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>{m.subject.replace(/^(re:\s*)+/i, 'Re: ')}</h1>
          {trail.length > 1 && <span className="muted" style={{ fontSize: 12.5 }}>{trail.length} messages</span>}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{humanBytes(totalBytes)}</span>
        </div>
        {trail.map((x) => <TrailMessage key={x.id} m={x} mine={x.fromAddr === myAddr} />)}
      </div>

      {!m.system && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button variant="accent" size="sm" onClick={openReply}>↩ Reply to {latest.fromAddr === myAddr ? latest.toName : latest.fromName}</Button>
        </div>
      )}
    </div>
  );
}
