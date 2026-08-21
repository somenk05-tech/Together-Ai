import { useEffect, useMemo, useRef, useState } from 'react';
import { useScaleLock } from '@/hooks/useScaleLock';
import { useNavigate, useParams } from 'react-router-dom';
import { useRecentStore } from '@/store/recent.store';
import { useAuthStore } from '@/store/auth.store';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { mailApi } from '../api';
import { useMailProjects } from '../api';
import { fmtBytes, fileIcon, type DriveFile } from '@/features/drive/api';
import { splitQuoted, stripCityFooter } from '../quoted';
import { expandedByDefault, previewOf } from '../collapse';
import { quoteBlock, withQuote } from '../replyQuote';
import { MoveToProject } from '../MoveToProject';
import { DrivePicker } from '../DrivePicker';
import {
  useMailMessage, useMailThread, useMailAccount, useFlagMail, useRemoveMail, useSendMail,
  humanBytes, initials, avatarHue, mailError, type MailMessage,
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--line)', borderRadius: 'var(--r-1)', padding: '8px 12px', background: 'var(--paper)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
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
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.6 }}>{latest}</div>
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
function TrailMessage({ m, mine, open, onToggle, onRemove, removing }: {
  m: MailMessage; mine: boolean; open: boolean; onToggle: () => void;
  /** Move THIS message to Trash, leaving the rest of the conversation where
   *  it is. Absent when the trail is a single message (the page's own Delete
   *  already does that job) and on anything already in Trash, where the same
   *  press would mean destroy. */
  onRemove?: () => void; removing?: boolean;
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
      {/* The toggle and the bin are SIBLINGS, not nested — a button inside a
          role="button" is markup the browser repairs by pulling one out of the
          other, and a press meant for the bin must never fold the message. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div onClick={onToggle} role="button" tabIndex={0} aria-expanded
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', minWidth: 0, flex: 1 }}>
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
        {onRemove && (
          <button type="button" onClick={onRemove} disabled={removing}
            aria-label="Move this message to Trash" title="Move this message to Trash"
            style={{ minWidth: 44, minHeight: 44, flexShrink: 0, border: 'none', background: 'none',
              cursor: 'pointer', fontSize: 15, color: 'var(--muted)', opacity: removing ? 0.5 : 1 }}>
            🗑
          </button>
        )}
      </div>
      <MailBody body={m.body} />
    </div>
  );
}

/**
 * THE REPLY BOX LIVES AT THE FOOT OF THE THREAD, which is where every mail
 * client puts it. Reply used to navigate to the Compose page — a different
 * screen, with the conversation gone from behind it, for what is nearly always
 * a few sentences. Gmail answers in place; now this does too.
 *
 * IT CARRIES THE WHOLE DESK. The first cut of this box held a textarea and
 * nothing else, with Cc, Bcc and files a navigation away — and the owner's
 * verdict was immediate: "the reply needs to be the full stack instead of
 * half." Gmail's inline reply is a full composer wearing a small collar, and
 * so is this one now: the recipient is editable, Cc and Bcc unfold on a
 * press, files come from Drive without leaving the thread. The one thing that
 * stays behind the full-composer door is the subject — a reply's subject is
 * the thread's subject, and changing it is the moment you are writing a new
 * message.
 *
 * THE QUOTED TRAIL GOES OUT UNDER THE REPLY, same as Compose: built from the
 * newest message, shown behind the ··· control, joined at send. And the same
 * two rules Compose earned the hard way apply — a reply with nothing in it
 * does not send (a file counts, a blank box does not), and the key is not
 * live until the trail it quotes has arrived.
 */
function InlineReply({ to, name, subject, threadId, latest, trailPending, open, onOpenChange, onOpenFull }: {
  to: string; name: string; subject: string; threadId?: string | null;
  latest: MailMessage; trailPending: boolean;
  open: boolean; onOpenChange: (v: boolean) => void; onOpenFull: () => void;
}) {
  const send = useSendMail();
  const [toAddr, setToAddr] = useState(to);
  // The thread's other party changes when a new message lands (your own reply
  // included); the field follows until somebody has edited it — reseeding on
  // every render would overwrite what the citizen is typing.
  useEffect(() => { setToAddr(to); }, [to]);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCopies, setShowCopies] = useState(false);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<DriveFile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refused, setRefused] = useState<Array<{ to: string; reason: string }>>([]);
  const [qOpen, setQOpen] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // Focus lands in the box when it opens — including from the header's Reply
  // key — and focusing also scrolls it into view, so no motion is needed.
  useEffect(() => { if (open) boxRef.current?.focus(); }, [open]);

  /** Commas or spaces, because both are what people type. Same as Compose. */
  const addrs = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const quote = useMemo(() => quoteBlock(latest), [latest]);
  const hasSomething = Boolean(body.trim()) || attachments.length > 0;
  const canSend = Boolean(toAddr.trim()) && hasSomething && !trailPending && !send.isPending;
  const inp = { padding: '11px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, background: 'var(--card)' };

  if (!open) {
    /* Gmail's reply row: the full width of the thread, not a chip in a
       corner. The whole row is the button, because the whole row is what the
       eye lands on when the last message ends. */
    return (
      <div className="card" style={{ marginTop: 12, padding: 0 }}>
        <button type="button" onClick={() => onOpenChange(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 54,
            padding: '0 18px', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 15, fontWeight: 600, color: 'var(--ink)', textAlign: 'left' }}>
          <span>↩ Reply to {name}</span>
          <span className="muted" style={{ fontWeight: 400, fontSize: 12.5, marginLeft: 'auto' }}>
            Cc, Bcc and files, right here
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>↩ Reply</span>
        <span className="muted" style={{ fontSize: 12.5 }}>{subject}</span>
        {/* The one thing not on this desk. Changing the subject is starting a
            new message, and that is the full composer's job. */}
        <button type="button" onClick={onOpenFull}
          style={{ marginLeft: 'auto', minHeight: 44, padding: '0 2px', background: 'none', border: 0, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
          Change the subject → full composer
        </button>
      </div>
      <div>
        <label style={{ fontSize: 12 }} className="muted">To</label>
        <input value={toAddr} onChange={(e) => setToAddr(e.target.value)} style={inp}
          placeholder="a citizen's @togethercity.app handle · or any email address" autoComplete="off" />
      </div>
      {(showCopies || cc || bcc) ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12 }} className="muted">Cc</label>
            <input value={cc} onChange={(e) => setCc(e.target.value)}
              placeholder="Everyone here can see each other" style={inp} autoComplete="off" />
          </div>
          <div>
            <label style={{ fontSize: 12 }} className="muted">Bcc</label>
            <input value={bcc} onChange={(e) => setBcc(e.target.value)}
              placeholder="Nobody else sees these addresses" style={inp} autoComplete="off" />
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowCopies(true)}
          style={{ justifySelf: 'start', minHeight: 44, padding: '0 2px', background: 'none', border: 0,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
          Add Cc or Bcc
        </button>
      )}
      <div>
        <textarea ref={boxRef} value={body} onChange={(e) => setBody(e.target.value)} rows={6}
          aria-label={`Reply to ${toAddr}`} placeholder="Write your reply…"
          style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
        {refused.length > 0 && (
          <div className="mrefused" role="alert">
            <b>
              {refused.length === 1 ? 'One address did not get it' : `${refused.length} addresses did not get it`}
              {' — the rest did.'}
            </b>
            <ul>
              {refused.map((f) => <li key={f.to}><span className="mrefused-to">{f.to}</span> {f.reason}</li>)}
            </ul>
            <span className="muted">
              Your reply is in Sent. Fix or remove those addresses and send again — the people who received it
              will get a second copy.
            </span>
          </div>
        )}
        {/* Same control, same words, same shape as Compose — it IS the same fact. */}
        <div className="mq">
          <button type="button" className="mq-key" aria-expanded={qOpen}
            aria-label={qOpen ? 'Hide the quoted conversation' : 'Show the quoted conversation'}
            onClick={() => setQOpen((v) => !v)}>···</button>
          <span className="mq-said muted">
            {qOpen ? 'The conversation you are replying to — it goes out under your message.' : 'Quoting the conversation below your message.'}
          </span>
          {qOpen && <pre className="mq-body">{quote}</pre>}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="line" size="sm" onClick={() => setPickerOpen(true)}>📎 Attach from Drive</Button>
          {attachments.length > 0 && (
            <span className="muted" style={{ fontSize: 12 }}>
              {attachments.length} file{attachments.length === 1 ? '' : 's'} · {fmtBytes(attachments.reduce((s2, f) => s2 + f.sizeBytes, 0))}
            </span>
          )}
        </div>
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {attachments.map((f) => (
              <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '6px 10px 6px 12px', fontSize: 12.5, background: 'var(--paper)' }}>
                <span>{fileIcon(f)}</span>
                <span style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span className="muted" style={{ fontSize: 11 }}>{fmtBytes(f.sizeBytes)}</span>
                <button type="button" aria-label={`Remove ${f.name}`}
                  onClick={() => setAttachments((cur) => cur.filter((x) => x.id !== f.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, color: 'var(--muted)' }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {send.isError && (
        <div className="mail-mishap" role="alert">
          <span>⚠ {mailError(send.error, 'That reply did not send.')}</span>
          <span className="muted">Your words are still in the box.</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button variant="accent" disabled={!canSend}
          onClick={() => {
            setRefused([]);
            send.mutate(
              { to: toAddr, cc: addrs(cc), bcc: addrs(bcc), subject, body: withQuote(body, quote),
                threadId: threadId ?? undefined, attachmentFileIds: attachments.map((f) => f.id) },
              {
                onSuccess: (res) => {
                  if (res.failed.length > 0) {
                    /* Some refused, some accepted: the reply IS in Sent, and
                       the citizen is still here fixing addresses. */
                    setRefused(res.failed);
                    return;
                  }
                  // The reply appears in the trail above — the invalidation
                  // refetches it — so the box has done its job and closes.
                  setBody(''); setCc(''); setBcc(''); setShowCopies(false);
                  setAttachments([]); setQOpen(false); onOpenChange(false);
                },
              },
            );
          }}>
          {send.isPending ? 'Sending…' : trailPending ? 'Loading the thread…' : 'Send reply'}
        </Button>
        <Button variant="line" onClick={() => onOpenChange(false)}>Cancel</Button>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
          Delivers to citizens and external emails
        </span>
      </div>

      {pickerOpen && (
        <DrivePicker
          alreadyPicked={attachments.map((f) => f.id)}
          onClose={() => setPickerOpen(false)}
          onPick={(files) => setAttachments((cur) => [...cur, ...files.filter((f) => !cur.some((c) => c.id === f.id))])}
        />
      )}
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
  // Above the early returns with the rest of them: a hook that runs on some
  // renders and not others is not a hook. Used far below, for the reply link.
  const projects = useMailProjects();

  /* THE SUBJECT IS THE NAME OF THIS PAGE, and only this page knows it.
     useTrackRecent files every visit the moment the URL changes, before any
     mail has arrived, so the best it can say is "Message". Once the message is
     here, the same entry is filed again under its own subject — the store
     de-dupes by path, so this replaces rather than repeats — and "Continue
     where you left off" offers a line the citizen wrote or read instead of a
     key from a database.

     AND IT FILES NOTHING FOR A STRANGER. The trail is one citizen's private
     movements and it renders on a public homepage; recent-privacy.test.ts
     makes every READER of it consult the auth store, and a writer that runs
     while nobody is signed in is the same leak arriving one step earlier —
     a subject line from the last session, waiting on a shared machine. */
  const recordRecent = useRecentStore((s) => s.record);
  const authedForTrail = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const subject = q.data?.subject;
  useEffect(() => {
    if (!authedForTrail || !id || !subject) return;
    recordRecent({ path: `/mail/message/${id}`, label: subject, hub: 'mail' });
  }, [authedForTrail, id, subject, recordRecent]);
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
  /** Asked only where deleting is final — see the key itself. */
  const [confirmGone, setConfirmGone] = useState(false);
  /** The reply box at the foot of the trail. Opened by either Reply key;
   *  starts closed, and starts over on a different thread. */
  const [replying, setReplying] = useState(false);
  useEffect(() => { setReplying(false); }, [id]);

  if (q.isLoading) return <Spinner label="Opening message…" />;
  if (q.isError || !q.data) return <div style={{ padding: 28 }}><EmptyState title="Couldn't open message" hint="It may have been deleted." /></div>;

  const m = q.data;
  const myAddr = acct.data?.address ?? '';
  // The whole trail if we have it; otherwise just this message.
  const raw = thread.data && thread.data.length > 0 ? thread.data : [m];
  /**
   * A BLANK MESSAGE IS NOT PART OF A CONVERSATION. The dozen empty rows the
   * old composer let through rendered as a wall of "You · (no text)" between
   * the words that were actually exchanged, and the owner's verdict was the
   * right one: they should not be shown at all. Hidden, not destroyed — the
   * rows still exist in Sent, where each has its own bin, and the server now
   * refuses to create new ones. The one exception is the message the citizen
   * OPENED: deep-link into a blank message from a folder and hiding it here
   * would render a page that appears to be about something else.
   */
  const visible = raw.filter((x) => x.id === id || stripCityFooter(x.body).trim() !== '');
  const trail = visible.length > 0 ? visible : [m];
  const latest = trail[trail.length - 1];
  // Reply goes to the other party of the most recent message.
  const replyTo = latest.fromAddr === myAddr ? latest.toAddr : latest.fromAddr;
  const replySubject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`;
  const totalBytes = trail.reduce((s, x) => s + x.sizeBytes, 0);
  // The rule until somebody overrides it — `id` is the message they clicked in
  // the folder, which collapse.ts keeps open for exactly that reason.
  const shown = openIds ?? expandedByDefault(trail, id);

  // The room this conversation is filed in, by key, for the reply link.
  const projectKey = m.projectId
    ? (projects.data ?? []).find((p) => p.id === m.projectId)?.key
    : undefined;

  /**
   * ON A PHONE THIS IS THE ONLY BIN. The row hides its own on a narrow screen
   * precisely because this key exists, so everything the row now says about
   * deleting has to be true here first.
   *
   * IT SAID "DELETE" IN TRASH AND MEANT "DESTROY". `remove()` moves a message
   * to Trash — except in Trash, where the same call deletes the row outright.
   * One word, two behaviours, no confirmation, and then it navigated to the
   * INBOX, which is not the folder the citizen was standing in and not where
   * they could have checked.
   */
  const permanent = m.folder === 'trash';
  const backTo = projectKey
    ? `/mail/p/${projectKey}${m.folder === 'inbox' ? '' : `/${m.folder}`}`
    : `/mail/${m.folder === 'draft' || m.folder === 'failed' ? 'unsent' : m.folder}`;
  const mishap =
    remove.isError ? mailError(remove.error, permanent ? 'That message could not be deleted.' : 'That message could not be moved to Trash.')
    : flag.isError ? mailError(flag.error, 'That star did not stick.')
    : null;

  /** The FULL composer — Cc, Bcc, attachments, drafts. The reply itself
   *  happens in the thread now; this is the bigger desk for when the small
   *  one is not enough. */
  const openFullComposer = () => {
    const p = new URLSearchParams({ to: replyTo, subject: replySubject });
    if (m.threadId) p.set('threadId', m.threadId);
    // A reply read inside a project is written inside it: the send would
    // inherit the room either way (the thread is already filed), but the RAIL
    // would not, and a composer whose sidebar says All Emails while it writes
    // into ABG is the same lie the rail commit went to remove.
    if (projectKey) p.set('project', projectKey);
    nav(`/mail/compose?${p.toString()}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="line" size="sm" onClick={() => nav(-1)}>← Back</Button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="line" size="sm" onClick={() => flag.mutate({ id: m.id, starred: !m.starred })}>{m.starred ? '★ Starred' : '☆ Star'}</Button>
          {/* FILING HAPPENS WHERE THE MESSAGE CAN BE READ. A row in a list is
              a subject and a snippet; deciding which room a conversation
              belongs in is a decision about what it SAYS, so the control is
              here rather than on the row. */}
          {m.threadId && <MoveToProject threadId={m.threadId} projectId={m.projectId ?? null} count={trail.length} />}
          {!m.system && <Button variant="accent" size="sm" onClick={() => setReplying(true)}>↩ Reply</Button>}
          <Button variant="line" size="sm" disabled={remove.isPending}
            aria-expanded={permanent ? confirmGone : undefined}
            onClick={() => {
              if (permanent) { setConfirmGone((v) => !v); return; }
              remove.mutate(m.id, { onSuccess: () => nav(backTo) });
            }}>
            {permanent ? '🗑 Delete forever' : '🗑 Delete'}
          </Button>
        </div>
      </div>

      {confirmGone && (
        <div className="mail-mishap" role="alert" style={{ marginTop: 12 }}>
          <span>Delete this forever? Trash is the last stop — there is nowhere to take it back from.</span>
          <span className="mail-mishap-keys">
            <Button variant="line" size="sm" disabled={remove.isPending}
              onClick={() => remove.mutate(m.id, { onSuccess: () => nav(backTo) })}>
              {remove.isPending ? 'Deleting…' : 'Delete forever'}
            </Button>
            <Button variant="line" size="sm" onClick={() => setConfirmGone(false)}>Keep it</Button>
          </span>
        </div>
      )}
      {mishap && (
        <div className="mail-mishap" role="alert" style={{ marginTop: 12 }}>
          <span>⚠ {mishap}</span> <span className="muted">This message is exactly as it was.</span>
        </div>
      )}

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
            })}
            /* One message can leave the conversation — the blank ones a finger
               sent before the composer refused them have to be removable
               without taking the thread with them. Only where the trail HAS
               other messages (alone, the page's Delete is the same act), and
               never in Trash, where this press would mean destroy. */
            onRemove={trail.length > 1 && x.folder !== 'trash'
              ? () => remove.mutate(x.id)
              : undefined}
            removing={remove.isPending && remove.variables === x.id} />
        ))}
        <ThreadAttachments threadId={m.threadId} />
      </div>

      {!m.system && (
        <InlineReply to={replyTo} name={latest.fromAddr === myAddr ? latest.toName : latest.fromName}
          subject={replySubject} threadId={m.threadId} latest={latest}
          trailPending={Boolean(m.threadId) && thread.isLoading}
          open={replying} onOpenChange={setReplying} onOpenFull={openFullComposer} />
      )}
    </div>
  );
}
