import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useMailAccount, useMailList, useFlagMail, useRemoveMail, useSetPrimary, useOutbox,
  humanBytes, mailTime, initials, avatarHue, type Folder, type MailItem,
} from '../api';

/** Outbound delivery log — every email/SMS sent through the messaging provider. */
function DeliveryLog() {
  const q = useOutbox();
  const rows = q.data ?? [];
  if (!rows.length) return <div className="muted" style={{ fontSize: 12.5, padding: '4px 0' }}>Nothing dispatched yet — bills and recovery codes will show here.</div>;
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
      {rows.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 9 }}>
          <span style={{ fontSize: 14 }}>{d.channel === 'sms' ? '📱' : '📧'}</span>
          <span style={{ fontWeight: 600 }}>{d.subject}</span>
          <span className="muted">→ {d.to}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#555', background: 'var(--line)', borderRadius: 999, padding: '1px 8px' }}>via {d.provider}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: d.status === 'sent' ? '#2e7d32' : d.status === 'failed' ? '#c62828' : '#8a6d00', background: d.status === 'sent' ? '#e8f5e9' : d.status === 'failed' ? '#fdecec' : '#fff7e0', borderRadius: 999, padding: '1px 8px', textTransform: 'uppercase' }}>{d.status}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Address, primary-email row, and the 10 GB storage meter, shown atop every folder. */
export function AccountBar() {
  const q = useMailAccount();
  const setPrimary = useSetPrimary();
  const a = q.data;
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const pct = a ? Math.max(a.usedPct, a.usedBytes > 0 ? 0.5 : 0) : 0;
  const inp = { padding: '8px 10px', border: '1.5px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit' } as const;

  const openEdit = () => { setEmail(a?.primaryEmail ?? ''); setPhone(a?.phone ?? ''); setEditing(true); };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20 }}>✉️</div>
        <div>
          <div className="eyebrow" style={{ margin: 0 }}>Your city address</div>
          <div style={{ fontWeight: 800, fontSize: 16, fontFamily: 'monospace' }}>{a?.address ?? '…'}</div>
        </div>
        <div style={{ marginLeft: 'auto', minWidth: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }} className="muted">
            <span>Storage</span>
            <span>{a ? `${humanBytes(a.usedBytes)} of ${humanBytes(a.quotaBytes)}` : '…'}</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', marginTop: 4 }}>
            <div style={{ width: `${Math.min(100, Math.max(pct, a && a.usedBytes ? 2 : 0))}%`, height: '100%', background: pct > 90 ? '#c62828' : 'var(--accent)' }} />
          </div>
        </div>
        <Link to="/mail/compose"><Button variant="accent" size="sm">✍️ Compose</Button></Link>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
        {!editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
            {a?.primaryEmail ? (
              <span className="muted">📧 Bills & recovery also go to your primary email <strong style={{ color: 'var(--ink)' }}>{a.primaryEmail}</strong>{a.phone ? ` · 📱 ${a.phone}` : ''}</span>
            ) : (
              <span className="muted">No primary email set — add one so bills & recovery reach you outside the city.</span>
            )}
            {a && a.counts.emailed > 0 && (
              <button type="button" onClick={() => setShowLog((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}>{showLog ? 'Hide' : `${a.counts.emailed} sent`}</button>
            )}
            <button type="button" onClick={openEdit} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}>{a?.primaryEmail ? 'Edit' : 'Add primary email'}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" style={{ ...inp, flex: 1, minWidth: 180 }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" style={{ ...inp, width: 160 }} />
            <Button variant="accent" size="sm" disabled={setPrimary.isPending} onClick={() => setPrimary.mutate({ email, phone }, { onSuccess: () => setEditing(false) })}>Save</Button>
            <Button variant="line" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        )}
        {showLog && !editing && <DeliveryLog />}
      </div>
    </div>
  );
}

const FOLDER_META: Record<Folder, { title: string; icon: string; eyebrow: string; empty: string }> = {
  inbox: { title: 'Inbox', icon: '📥', eyebrow: 'Mail · Inbox', empty: 'Your inbox is empty' },
  sent: { title: 'Sent', icon: '📤', eyebrow: 'Mail · Sent', empty: 'Nothing sent yet' },
  starred: { title: 'Starred', icon: '⭐', eyebrow: 'Mail · Starred', empty: 'No starred mail' },
  trash: { title: 'Trash', icon: '🗑', eyebrow: 'Mail · Trash', empty: 'Trash is empty' },
};

function Row({ m, folder }: { m: MailItem; folder: Folder }) {
  const nav = useNavigate();
  const flag = useFlagMail();
  const remove = useRemoveMail();
  const isSent = folder === 'sent';
  const person = isSent ? { name: m.toName, addr: m.toAddr } : { name: m.fromName, addr: m.fromAddr };
  const hue = avatarHue(person.addr);
  return (
    <div
      onClick={() => nav(`/mail/message/${m.id}`)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: '1px solid var(--line)', cursor: 'pointer', background: !m.read && folder === 'inbox' ? 'rgba(179,138,44,.06)' : 'transparent' }}
    >
      <button type="button" title="Star" onClick={(e) => { e.stopPropagation(); flag.mutate({ id: m.id, starred: !m.starred }); }}
        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: m.starred ? '#e6a817' : 'var(--line)', flexShrink: 0 }}>
        {m.starred ? '★' : '☆'}
      </button>
      <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: m.system ? 'var(--accent)' : `hsl(${hue},52%,45%)` }}>
        {m.system ? '🏙' : initials(person.name)}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: !m.read && folder === 'inbox' ? 800 : 600, fontSize: 13.5, whiteSpace: 'nowrap' }}>{isSent ? `To: ${person.name}` : person.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, whiteSpace: 'nowrap' }} className="muted">{mailTime(m.createdAt)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: !m.read && folder === 'inbox' ? 700 : 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '42%' }}>{m.subject}</span>
          <span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>— {m.snippet}</span>
        </div>
      </div>
      <button type="button" title={folder === 'trash' ? 'Delete forever' : 'Move to trash'} onClick={(e) => { e.stopPropagation(); remove.mutate(m.id); }}
        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, opacity: .6, flexShrink: 0 }}>🗑</button>
    </div>
  );
}

function FolderView({ folder }: { folder: Folder }) {
  const meta = FOLDER_META[folder];
  const q = useMailList(folder);
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <AccountBar />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 10px' }}>
        <div><div className="eyebrow">{meta.eyebrow}</div><h1 style={{ fontSize: 24, margin: 0 }}>{meta.icon} {meta.title}</h1></div>
      </div>
      {q.isLoading ? <Spinner label="Loading mail…" />
        : q.isError ? <EmptyState title="Couldn't load mail" hint="Start the backend and reload." />
        : (q.data ?? []).length === 0 ? <EmptyState icon={meta.icon} title={meta.empty} hint={folder === 'inbox' ? 'City mail will appear here.' : undefined} />
        : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>{q.data?.map((m) => <Row key={m.id} m={m} folder={folder} />)}</div>}
    </div>
  );
}

export function Inbox() { return <FolderView folder="inbox" />; }
export function Sent() { return <FolderView folder="sent" />; }
export function Starred() { return <FolderView folder="starred" />; }
export function Trash() { return <FolderView folder="trash" />; }
