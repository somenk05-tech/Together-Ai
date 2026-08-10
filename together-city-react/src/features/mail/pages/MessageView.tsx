import { useEffect, useMemo, useState } from 'react';
import { useScaleLock } from '@/hooks/useScaleLock';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { mailApi } from '../api';
import { fmtBytes, fileIcon } from '@/features/drive/api';
import { splitQuoted, stripCityFooter } from '../quoted';
import { expandedByDefault, previewOf } from '../collapse';
import {
  useMailMessage, useMailThread, useMailAccount, useFlagMail, useRemoveMail,
  humanBytes, initials, avatarHue, type MailMessage,
} from '../api';

/** Files attached to this trail, pulled from the sender's Drive. Any participant
 *  may download them via a short-lived signed URL. */
function ThreadAttachments({ threadId }: { threadId?: string | null }) {
  const q = useQuery({
    queryKey: ['mail', 'attachments', threadId],
    queryFn: () => mailApi.threadAttachments(threadId as string),
    enabled: Boolean(threadId),
  });
  const items = q.data?.items ?? [];
  if (!threadId || items.length === 0) return null;
  const open = async (fileId: string) => {
    try {
      const { url } = await mailApi.attachmentUrl(threadId, fileId);
      window.open(url, '_blank', 'noopener');
    } catch { /* surfaced by the empty state below */ }
  };
  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        📎 {items.length} attachment{items.length === 1 ? '' : 's'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map((f) => (
          <button key={f.id} type="button" onClick={() => void open(f.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', background: 'var(--paper)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
            <span style={{ fontSize: 17 }}>{fileIcon(f)}</span>
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span className="muted" style={{ fontSize: 11 }}>{fmtBytes(f.sizeBytes)} · Download</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A message body, with the conversation it quotes folded away.
 *
 * The reply is what somebody wrote; everything under it is what they were
 * replying to, which is already on this page, above, in full. Showing both
 * meant a four-word reply rendered as fifty lines and each exchange buried the
 * one before it. The history is one click away and never thrown out — it is
 * what actually arrived, and a thread that quietly discards part of a message
 * is not a mail client.
 */
function MailBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const { latest, quoted } = useMemo(() => splitQuoted(stripCityFooter(body)), [body]);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.6 }}>{latest}</div>
      {quoted && (
        <>
          {/* The control is Gmail's small pill; the TARGET is 44px. Drawing the
              pill on the button itself made a 22px tap target and the a11y
              ceiling caught it — correctly, this is exactly the control a thumb
              reaches for. The button is transparent and full height, the pill
              is a span inside it, and the two are the same click. */}
          <button type="button" onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide quoted messages' : 'Show quoted messages'}
            title={open ? 'Hide quoted messages' : 'Show quoted messages'}
            style={{
              display: 'flex', alignItems: 'center', minHeight: 44, minWidth: 44,
              padding: 0, marginTop: 2, border: 'none', background: 'none', cursor: 'pointer',
            }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', lineHeight: 1,
              borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--well)',
              color: 'var(--muted)', fontFamily: 'inherit', fontSize: 13, letterSpacing: '.08em',
            }}>•••</span>
          </button>
          {open && (
            <div style={{
              whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, marginTop: 10,
              paddingLeft: 12, borderLeft: '2px solid var(--line-2)', color: 'var(--muted)',
            }}>
              {quoted}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One message inside a trail. */
function TrailMessage({ m, mine, open, onToggle }: {
  m: MailMessage; mine: boolean; open: boolean; onToggle: () => void;
}) {
  const hue = avatarHue(m.fromAddr);
  const when = new Date(m.createdAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const shortWhen = new Date(m.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short' });

  /**
   * FOLDED: ONE LINE YOU CAN TAP.
   *
   * collapse.ts has held this rule — and its tests — since the day trails
   * existed, and nothing ever called it: every message in a trail rendered in
   * full, oldest first, so the reply that arrived this morning sat under four
   * screens of yesterday. The rule is unchanged; this is the row it always
   * described.
   *
   * The preview comes from the SAME text the open message renders — quoted
   * history and the city footer already stripped — so the line and the body
   * can never say two different things. The server's own snippet is the raw
   * body's first characters, which on a reply is usually the signature of the
   * message being answered.
   *
   * The whole row is the button, because on a phone the whole row is what a
   * thumb aims at.
   */
  if (!open) {
    const { latest } = splitQuoted(stripCityFooter(m.body));
    return (
      <button type="button" onClick={onToggle} aria-expanded={false}
        aria-label={`Show message from ${mine ? 'you' : m.fromName}, ${when}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          minHeight: 44, padding: '10px 0', borderTop: '1px solid var(--line)',
          borderLeft: 0, borderRight: 0, borderBottom: 0,
          background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          color: 'var(--ink)',
        }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: 'var(--on-accent)', background: m.system ? 'var(--accent)' : `hsl(${hue},52%,45%)` }}>
          {m.system ? '🏙' : initials(m.fromName)}
        </span>
        <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{mine ? 'You' : m.fromName}</span>
        <span className="muted" style={{ fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {previewOf(latest)}
        </span>
        <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto', flexShrink: 0 }}>{shortWhen}</span>
      </button>
    );
  }

  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <div onClick={onToggle} role="button" tabIndex={0} aria-expanded
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, color: 'var(--on-accent)', background: m.system ? 'var(--accent)' : `hsl(${hue},52%,45%)` }}>
          {m.system ? '🏙' : initials(m.fromName)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>
            {mine ? 'You' : m.fromName} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>&lt;{m.fromAddr}&gt;</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            to {m.toAddr}
            {/* Cc is shown to everyone, because that is what Cc means. Bcc is
                only ever present on your own Sent copy — the server never
                writes it to a recipient row, so there is nothing here to hide.
                It is labelled as yours so you can see what you sent. */}
            {m.ccAddrs && <> · cc {m.ccAddrs}</>}
            {m.bccAddrs && <> · <span title="Only you can see this">bcc {m.bccAddrs}</span></>}
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when}</div>
      </div>
      <MailBody body={m.body} />
    </div>
  );
}

/** Read a mail thread (trail) and reply into it. */
export function MessageView() {
  // Before the early returns below — a hook that runs some renders and not
  // others is not a hook.
  useScaleLock();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useMailMessage(id);
  const acct = useMailAccount();
  const thread = useMailThread(q.data?.threadId);
  const flag = useFlagMail();
  const remove = useRemoveMail();
  /**
   * WHICH MESSAGES ARE OPEN, AND WHO DECIDES.
   *
   * `null` means "nobody has touched this yet, use the rule" — collapse.ts
   * decides from the trail itself: the newest, the one they clicked, and
   * anything unread. The moment a citizen taps a row the set becomes theirs and
   * the rule stops having an opinion, which is the only behaviour that does not
   * fight somebody who is reading.
   *
   * Keyed on the message id so opening a different thread starts over rather
   * than inheriting the last one's folds.
   */
  const [openIds, setOpenIds] = useState<Set<string> | null>(null);
  useEffect(() => { setOpenIds(null); }, [id]);

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
  // The rule until somebody overrides it — `id` is the message they clicked in
  // the folder, which collapse.ts keeps open for exactly that reason.
  const shown = openIds ?? expandedByDefault(trail, id);

  const openReply = () => {
    const p = new URLSearchParams({ to: replyTo, subject: replySubject });
    if (m.threadId) p.set('threadId', m.threadId);
    nav(`/mail/compose?${p.toString()}`);
  };

  return (
    <div>
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
        {trail.map((x) => (
          <TrailMessage key={x.id} m={x} mine={x.fromAddr === myAddr}
            open={shown.has(x.id)}
            onToggle={() => setOpenIds((prev) => {
              const next = new Set(prev ?? shown);
              if (next.has(x.id)) next.delete(x.id); else next.add(x.id);
              return next;
            })} />
        ))}
        <ThreadAttachments threadId={m.threadId} />
      </div>

      {!m.system && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button variant="accent" size="sm" onClick={openReply}>↩ Reply to {latest.fromAddr === myAddr ? latest.toName : latest.fromName}</Button>
        </div>
      )}
    </div>
  );
}
