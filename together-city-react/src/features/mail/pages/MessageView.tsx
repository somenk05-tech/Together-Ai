import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMailMessage, useFlagMail, useRemoveMail, humanBytes, initials, avatarHue } from '../api';

/** Read a single message. */
export function MessageView() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useMailMessage(id);
  const flag = useFlagMail();
  const remove = useRemoveMail();

  if (q.isLoading) return <Spinner label="Opening message…" />;
  if (q.isError || !q.data) return <div style={{ padding: 28 }}><EmptyState title="Couldn't open message" hint="It may have been deleted." /></div>;
  const m = q.data;
  const hue = avatarHue(m.fromAddr);
  const when = new Date(m.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="line" size="sm" onClick={() => nav(-1)}>← Back</Button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="line" size="sm" onClick={() => flag.mutate({ id: m.id, starred: !m.starred })}>{m.starred ? '★ Starred' : '☆ Star'}</Button>
          {!m.system && <Button variant="line" size="sm" onClick={() => nav(`/mail/compose?to=${encodeURIComponent(m.fromAddr)}&subject=${encodeURIComponent('Re: ' + m.subject)}`)}>↩ Reply</Button>}
          <Button variant="line" size="sm" onClick={() => remove.mutate(m.id, { onSuccess: () => nav('/mail/inbox') })}>🗑 Delete</Button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h1 style={{ fontSize: 22, margin: '0 0 14px' }}>{m.subject}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, color: '#fff', background: m.system ? 'var(--accent)' : `hsl(${hue},52%,45%)` }}>
            {m.system ? '🏙' : initials(m.fromName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{m.fromName} <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>&lt;{m.fromAddr}&gt;</span></div>
            <div className="muted" style={{ fontSize: 12.5 }}>to {m.toAddr}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }} className="muted">
            <div style={{ fontSize: 12.5 }}>{when}</div>
            <div style={{ fontSize: 11 }}>{humanBytes(m.sizeBytes)}</div>
          </div>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.6, marginTop: 16 }}>{m.body}</div>
      </div>
    </div>
  );
}
