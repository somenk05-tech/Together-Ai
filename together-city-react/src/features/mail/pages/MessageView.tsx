import { useMemo, useState } from 'react';
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

/** The round sender mark. Same colours open or folded, so a face stays a face. */
function Mark({ m, size }: { m: MailMessage; size: number }) {
  const hue = avatarHue(m.fromAddr);
  return (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
      fontSize: size < 32 ? 11 : 13, fontWeight: 800, color: 'var(--on-accent)',
      background: m.system ? 'var(--accent)' : `hsl(${hue},52%,45%)`,
    }}>
      {m.system ? '🏙' : initials(m.fromName)}
    </div>
  );
}

/**
 * One message inside a trail — open, or folded to a line.
 *
 * Folded is a real button rather than a div with a click handler: it carries
 * aria-expanded, it is 44px tall, and a keyboard reaches it. The date sits at
 * the same right edge in both states so the eye can run down the column
 * without the folded rows jumping.
 */
function TrailMessage({ m, mine, expanded, onToggle }: {
  m: MailMessage; mine: boolean; expanded: boolean; onToggle: () => void;
}) {
  const when = new Date(m.createdAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const shortWhen = new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const who = mine ? 'You' : m.fromName;

  if (!expanded) {
    const preview = previewOf(splitQuoted(stripCityFooter(m.body)).latest);
    return (
      <button type="button" onClick={onToggle} aria-expanded={false}
        aria-label={`Open message from ${who}, ${when}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 44,
          padding: '10px 0', borderTop: '1px solid var(--line)', borderLeft: 0, borderRight: 0, borderBottom: 0,
          background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'inherit',
        }}>
        <Mark m={m} size={28} />
        <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{who}</span>
        {/* The preview is what THIS message says, quoted history already
            removed — the same text the open state renders. */}
        <span className="muted" style={{ fontSize: 12.5, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}
        </span>
        {!m.read && <span aria-hidden title="Unread" style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
        <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>{shortWhen}</span>
      </button>
    );
  }

  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Mark m={m} size={38} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>
            {who} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>&lt;{m.fromAddr}&gt;</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>to {m.toAddr}</div>
        </div>
        <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when}</div>
        {/* Fold this one away again. Hidden on a single-message trail, where
            there is nothing to fold it against — see expandedByDefault. */}
        <button type="button" onClick={onToggle} aria-expanded
          aria-label={`Collapse message from ${who}, ${when}`}
          style={{
            display: 'grid', placeItems: 'center', minWidth: 44, minHeight: 44,
            border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15,
          }}>⌃</button>
      </div>
      <MailBody body={m.body} />
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
  /**
   * What the citizen has opened or folded by hand, over the top of the default.
   *
   * An override map rather than a set of open ids, because the trail arrives
   * asynchronously: seeding state from data that is not there yet needs an
   * effect, and an effect that re-seeds would fight every tap. `undefined`
   * here means "no opinion — use the rule".
   */
  const [override, setOverride] = useState<Record<string, boolean>>({});

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

  // The rule (collapse.ts), with the citizen's own taps on top of it.
  const byDefault = expandedByDefault(trail, id);
  const isOpen = (mid: string) => override[mid] ?? byDefault.has(mid);
  const foldedCount = trail.filter((x) => !isOpen(x.id)).length;
  const expandAll = () => setOverride(Object.fromEntries(trail.map((x) => [x.id, true])));
  // Back to the rule rather than to "all closed": the newest message and
  // anything unread stay open, because a trail with nothing open is a page
  // showing none of its own content.
  const collapseOlder = () => setOverride({});

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

        {/* One control for the whole trail, next to the count it changes. */}
        {trail.length > 1 && (
          <div style={{ marginTop: 6 }}>
            <button type="button"
              onClick={foldedCount > 0 ? expandAll : collapseOlder}
              style={{
                display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0,
                border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: 700, color: 'var(--accent-ink)',
              }}>
              {foldedCount > 0
                ? `Show ${foldedCount} earlier message${foldedCount === 1 ? '' : 's'}`
                : 'Collapse older messages'}
            </button>
          </div>
        )}

        {trail.map((x) => (
          <TrailMessage key={x.id} m={x} mine={x.fromAddr === myAddr}
            expanded={trail.length === 1 || isOpen(x.id)}
            onToggle={() => setOverride((o) => ({ ...o, [x.id]: !isOpen(x.id) }))} />
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
