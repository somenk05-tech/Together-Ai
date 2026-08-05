import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useMailAccount, useMailList, useFlagMail, useRemoveMail, useSetPrimary, useOutbox,
  humanBytes, mailTime, initials, avatarHue, useRetryMail, useDiscardDraft, type Folder,
} from '../api';
import { groupByThread, type Convo } from '../threading';

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
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', background: 'var(--line)', borderRadius: 999, padding: '1px 8px' }}>via {d.provider}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: d.status === 'sent' ? 'var(--ok-ink)' : d.status === 'failed' ? 'var(--danger-ink)' : 'var(--warn-ink)', background: d.status === 'sent' ? 'var(--ok-soft)' : d.status === 'failed' ? 'var(--danger-soft)' : 'var(--warn-soft)', borderRadius: 999, padding: '1px 8px', textTransform: 'uppercase' }}>{d.status}</span>
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
  /** Phone-only disclosure — CSS keeps the rest open on a desktop regardless. */
  const [detail, setDetail] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const pct = a ? Math.max(a.usedPct, a.usedBytes > 0 ? 0.5 : 0) : 0;
  const inp = { padding: '8px 10px', border: '1.5px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit' } as const;

  const openEdit = () => { setEmail(a?.primaryEmail ?? ''); setPhone(a?.phone ?? ''); setEditing(true); };

  /**
   * ON A PHONE THIS CARD IS NOT THE MAIL.
   *
   * At 390px the account card ran to roughly two hundred pixels — a 42px
   * envelope tile, the address, a storage meter, a Compose button and a
   * primary-email line — all of it above the first message. Every mail client
   * on a phone puts one thin bar at the top and then the mail, because the
   * mail is what you opened the app for; your own address is not news to you.
   *
   * Nothing is removed. Below 560 the meter, the primary-email row and the
   * delivery log fold behind "Details", and Compose becomes the floating
   * button the folder itself draws. On a desktop the card is exactly as it
   * was — there the space is free.
   */
  return (
    <div className="card mail-account">
      <div className="mail-account-top">
        <div className="mail-account-mark">✉️</div>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow mail-account-eyebrow" style={{ margin: 0 }}>Your city address</div>
          <div className="mail-account-addr">{a?.address ?? '…'}</div>
        </div>
        <div className="mail-account-meter">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }} className="muted">
            <span>Storage</span>
            <span>{a ? `${humanBytes(a.usedBytes)} of ${humanBytes(a.quotaBytes)}` : '…'}</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', marginTop: 4 }}>
            <div style={{ width: `${Math.min(100, Math.max(pct, a && a.usedBytes ? 2 : 0))}%`, height: '100%', background: pct > 90 ? 'var(--danger-ink)' : 'var(--accent)' }} />
          </div>
        </div>
        <Link to="/mail/compose" className="mail-account-compose"><Button variant="accent" size="sm">✍️ Compose</Button></Link>
        <button type="button" className="mail-account-toggle" aria-expanded={detail}
          onClick={() => setDetail((v) => !v)}>{detail ? 'Hide' : 'Details'}</button>
      </div>

      <div className={`mail-account-rest${detail ? ' open' : ''}`} style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
        {!editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
            {a?.primaryEmail ? (
              <span className="muted">📧 Bills & recovery also go to your primary email <strong style={{ color: 'var(--ink)' }}>{a.primaryEmail}</strong>{a.phone ? ` · 📱 ${a.phone}` : ''}</span>
            ) : (
              <span className="muted">No primary email set — add one so bills & recovery reach you outside the city.</span>
            )}
            {a && a.counts.emailed > 0 && (
              <button type="button" onClick={() => setShowLog((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}>{showLog ? 'Hide' : `${a.counts.emailed} sent`}</button>
            )}
            <button type="button" onClick={openEdit} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}>{a?.primaryEmail ? 'Edit' : 'Add primary email'}</button>
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
  draft: { title: 'Drafts', icon: '✏️', eyebrow: 'Mail · Drafts', empty: 'Nothing half-written' },
  failed: { title: 'Failed', icon: '⚠️', eyebrow: 'Mail · Failed', empty: 'Nothing has failed to send' },
  // Two states, one question: what is still waiting on me?
  unsent: { title: 'Drafts & Failed', icon: '✏️', eyebrow: 'Mail · Unsent', empty: 'Nothing waiting — no drafts, nothing rejected' },
  starred: { title: 'Starred', icon: '⭐', eyebrow: 'Mail · Starred', empty: 'No starred mail' },
  trash: { title: 'Trash', icon: '🗑', eyebrow: 'Mail · Trash', empty: 'Trash is empty' },
};

function Row({ convo, folder }: { convo: Convo; folder: Folder }) {
  const { head: m, count } = convo;
  const nav = useNavigate();
  const flag = useFlagMail();
  const remove = useRemoveMail();
  const retry = useRetryMail();
  const discard = useDiscardDraft();
  // A draft is not correspondence: it opens in the composer where it was left,
  // never in the reader, and it is thrown away rather than filed in Trash.
  const isDraft = m.folder === 'draft';
  const isSent = folder === 'sent' || folder === 'failed' || folder === 'unsent';
  const person = isSent ? { name: m.toName, addr: m.toAddr } : { name: m.fromName, addr: m.fromAddr };
  const hue = avatarHue(person.addr);
  const unread = convo.unread && folder === 'inbox';
  /**
   * THE ROW IS CLASSES NOW, NOT INLINE GEOMETRY, BECAUSE A PHONE NEEDS A
   * DIFFERENT SHAPE OF IT.
   *
   * On a desktop the subject and the snippet share one line and that reads
   * fine at 800px. On a 390px screen the same row spent about 150px on a star,
   * an avatar, a retry button and a bin before the words started — and then
   * capped the subject at 42% of what was left, which is roughly eighty
   * pixels. Nobody has ever read an email subject in eighty pixels.
   *
   * So below 560 the row takes the shape every mail client on a phone has
   * settled on: avatar, then sender / subject / snippet on three lines of
   * their own, each truncated once, with the star moved to the right edge
   * where a thumb reaches it without crossing the text.
   *
   * The bin leaves the row on a phone — but ONLY where there is another way to
   * do it. A message has Delete inside it; a draft has nothing yet, so the
   * draft keeps its bin. A control removed with no replacement is not a
   * simplification, it is a lost capability.
   */
  const binHasAnotherDoor = !isDraft; // MessageView carries Delete; the composer does not carry Discard
  return (
    <div className={`mail-row${unread ? ' unread' : ''}`}
      onClick={() => nav(isDraft ? `/mail/compose?draft=${m.id}` : `/mail/message/${m.id}`)}>
      <div className="mail-av" style={{ background: m.system ? 'var(--accent)' : `hsl(${hue},52%,45%)` }}>
        {m.system ? '🏙' : initials(person.name)}
      </div>
      <div className="mail-body">
        <div className="mail-l1">
          {isDraft && <span className="mail-draft">Draft</span>}
          <span className="mail-from">
            {isSent ? (person.name ? `To: ${person.name}` : 'No recipient yet') : person.name}
            {count > 1 && <span className="muted" style={{ fontWeight: 600, marginLeft: 6 }}>{count}</span>}
          </span>
          <span className="mail-time muted">{mailTime(m.createdAt)}</span>
        </div>
        <div className="mail-l2">
          <span className="mail-subj">{m.subject || (isDraft ? '(no subject)' : m.subject)}</span>
          <span className="mail-snip muted"><span className="mail-dash">— </span>{m.snippet}</span>
        </div>
        {/* The provider's own words. A failure the citizen cannot read the
            reason for is one they cannot do anything about. */}
        {m.failureReason && <div className="mail-fail">⚠ {m.failureReason}</div>}
      </div>
      {m.folder === 'failed' && (
        <button type="button" className="mail-retry" disabled={retry.isPending} title="Try sending this again"
          onClick={(e) => { e.stopPropagation(); retry.mutate(m.id); }}>
          {retry.isPending ? 'Sending…' : 'Try again'}
        </button>
      )}
      <button type="button" className="mail-star" title="Star" aria-label={m.starred ? 'Unstar' : 'Star'}
        style={{ color: m.starred ? 'var(--warn-ink)' : 'var(--line-2)' }}
        onClick={(e) => { e.stopPropagation(); flag.mutate({ id: m.id, starred: !m.starred }); }}>
        {m.starred ? '★' : '☆'}
      </button>
      <button type="button" className={`mail-bin${binHasAnotherDoor ? ' has-another-door' : ''}`}
        title={isDraft ? 'Discard this draft' : folder === 'trash' ? 'Delete forever' : 'Move to trash'}
        aria-label={isDraft ? 'Discard this draft' : folder === 'trash' ? 'Delete forever' : 'Move to trash'}
        disabled={discard.isPending}
        onClick={(e) => { e.stopPropagation(); if (isDraft) discard.mutate(m.id); else remove.mutate(m.id); }}>🗑</button>
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
        : q.isError ? <EmptyState title="Couldn't load mail" hint="Nothing has been deleted — we couldn’t reach your mailbox. Try again in a moment." />
        : (q.data ?? []).length === 0 ? <EmptyState icon={meta.icon} title={meta.empty} hint={folder === 'inbox' ? 'City mail will appear here.' : undefined} />
        : <div className="card mail-list" style={{ padding: 0, overflow: 'hidden' }}>
            {groupByThread(q.data ?? []).map((c) => <Row key={c.head.id} convo={c} folder={folder} />)}
          </div>}
      {/* The thing you came to do, under your thumb. Phone-only — on a desktop
          Compose is already in the account bar, and a button floating over a
          page with room to spare is just a button in the way. */}
      <Link to="/mail/compose" className="mail-fab" aria-label="Compose">
        <span aria-hidden>✍️</span><span>Compose</span>
      </Link>
    </div>
  );
}

export function Inbox() { return <FolderView folder="inbox" />; }
export function Sent() { return <FolderView folder="sent" />; }
export function Failed() { return <FolderView folder="failed" />; }
export function Unsent() { return <FolderView folder="unsent" />; }
export function Starred() { return <FolderView folder="starred" />; }
export function Trash() { return <FolderView folder="trash" />; }
