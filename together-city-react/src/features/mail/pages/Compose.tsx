import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useDirectory, useSendMail, useMailAccount, useSaveDraft, useMailMessage, type DirectoryEntry } from '../api';
import { payError } from '@/features/financial/api';
import { DrivePicker } from '../DrivePicker';
import { fmtBytes, fileIcon, type DriveFile } from '@/features/drive/api';

/** Compose — write to a connected citizen (directory autocomplete, which only
 *  lists your connections) OR any external/global email address (delivered via
 *  the email provider). City mail to a stranger is refused by the API. */
export function Compose() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const dir = useDirectory();
  const acct = useMailAccount();
  const send = useSendMail();
  const saveDraft = useSaveDraft();

  /**
   * Resuming a draft. `?draft=<id>` loads what was left; the fields are seeded
   * ONCE, when it arrives, and never again — re-seeding on every render would
   * overwrite what the citizen is typing with what they had typed.
   */
  const draftParam = params.get('draft') ?? undefined;
  const loaded = useMailMessage(draftParam ?? '');
  const [seeded, setSeeded] = useState(!draftParam);

  const [to, setTo] = useState(params.get('to') ?? '');
  const [subject, setSubject] = useState(params.get('subject') ?? '');
  /**
   * CC AND BCC, HIDDEN UNTIL ASKED FOR.
   *
   * Most messages go to one person. Two more always-visible fields make the
   * common case look like the uncommon one, so they arrive on a press — and
   * stay open once anything is in them, or a citizen who typed an address and
   * collapsed the row would send a message to somebody they could no longer
   * see.
   */
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCopies, setShowCopies] = useState(false);
  /** Commas or spaces, because both are what people type. */
  const addrs = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const [body, setBody] = useState('');
  const [showSug, setShowSug] = useState(false);
  const [attachments, setAttachments] = useState<DriveFile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /** The draft row these words live in. Set on resume, or on first autosave. */
  const draftId = useRef<string | undefined>(draftParam);
  const threadId = params.get('threadId') ?? (loaded.data?.threadId ?? undefined); // reply → append to trail

  useEffect(() => {
    if (seeded || !loaded.data) return;
    setTo(loaded.data.toAddr ?? '');
    setSubject(loaded.data.subject ?? '');
    setBody(loaded.data.body ?? '');
    setSeeded(true);
  }, [loaded.data, seeded]);

  /**
   * AUTOSAVE — the promise a draft folder makes.
   *
   * Debounced 1.2s after the last keystroke, and skipped entirely while the
   * message is empty: a citizen who opens Compose, reads it and leaves should
   * not find a blank draft waiting for them. It is also skipped while sending,
   * because a draft saved during a send is a draft that outlives it.
   */
  const sending = send.isPending;
  useEffect(() => {
    if (!seeded || sending) return;
    const hasSomething = Boolean(to.trim() || subject.trim() || body.trim());
    if (!hasSomething) return;
    const t = setTimeout(() => {
      saveDraft.mutate(
        { id: draftId.current, to, subject, body, threadId },
        {
          onSuccess: (d) => { draftId.current = d.id; setSavedAt(new Date()); },
          // A failed autosave is not worth a red box over somebody's writing —
          // the words are still in the box, and the next keystroke retries.
          onError: () => undefined,
        },
      );
    }, 1200);
    return () => clearTimeout(t);
    // saveDraft is a stable mutation object; including it would re-arm the
    // timer on every render and never save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, subject, body, threadId, seeded, sending]);

  const suggestions = useMemo(() => {
    const term = to.trim().toLowerCase().replace(/@.*/, '');
    if (!term) return (dir.data ?? []).slice(0, 6);
    return (dir.data ?? []).filter((d) => d.name.toLowerCase().includes(term) || d.handle.toLowerCase().includes(term)).slice(0, 6);
  }, [to, dir.data]);

  const pick = (d: DirectoryEntry) => { setTo(d.address); setShowSug(false); };
  const canSend = to.trim() && !send.isPending;

  const inp = { padding: '11px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, background: 'var(--card)' };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div className="eyebrow">Mail · Compose</div>
          <h1 style={{ fontSize: 24, margin: 0 }}>✍️ {draftParam ? 'Continue your draft' : threadId ? 'Reply' : 'New message'}</h1>
        </div>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'monospace' }}>from {acct.data?.address ?? '…'}</span>
      </div>

      <div className="card" style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 12 }} className="muted">To</label>
          <input value={to} onChange={(e) => { setTo(e.target.value); setShowSug(true); }} onFocus={() => setShowSug(true)}
            placeholder="a connection's @togethercity.app handle · or any email address" style={inp} autoComplete="off" />
          {dir.isSuccess && (dir.data?.length ?? 0) === 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              You're not connected to anyone yet — city mail goes to your connections.
              You can still write to any external email address.
            </div>
          )}
          {showSug && suggestions.length > 0 && (
            <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: 4, marginTop: 4, maxHeight: 240, overflow: 'auto' }}>
              {suggestions.map((d) => (
                <div key={d.handle} onClick={() => pick(d)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                  onMouseDown={(e) => e.preventDefault()}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}</div>
                  <div className="muted" style={{ fontSize: 12, fontFamily: 'monospace', marginLeft: 'auto' }}>{d.address}</div>
                </div>
              ))}
            </div>
          )}
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
              {/* Said at the field rather than in a help page, because the
                  difference between Cc and Bcc is the only thing about them
                  worth knowing and it is the thing people get wrong. */}
              <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
                People on Bcc get the message. Nobody else is told they did — including each other.
              </p>
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
          <label style={{ fontSize: 12 }} className="muted">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12 }} className="muted">Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder="Write your message…" style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
        </div>

        {/* Attachments from the citizen's Drive */}
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
                <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--line)', borderRadius: 999, padding: '6px 10px 6px 12px', fontSize: 12.5, background: 'var(--paper)' }}>
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

        {send.isError && <div style={{ fontSize: 13, color: 'var(--danger-ink)', background: 'var(--danger-soft)', borderRadius: 8, padding: '8px 12px' }}>{payError(send.error)}</div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="accent" disabled={!canSend}
            onClick={() => send.mutate(
              { to, cc: addrs(cc), bcc: addrs(bcc), subject: subject || '(no subject)', body, threadId, attachmentFileIds: attachments.map((f) => f.id), draftId: draftId.current },
              { onSuccess: () => { if (threadId) nav(-1); else nav('/mail/sent'); } },
            )}>
            {send.isPending ? 'Sending…' : threadId ? 'Send reply' : 'Send'}
          </Button>
          <Button variant="line" onClick={() => nav(-1)}>Cancel</Button>
          {/* Says what actually happened, and where to find it. */}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }} role="status" aria-live="polite">
            {savedAt
              ? `Draft saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · in Drafts & Failed`
              : 'Delivers to citizens and external emails · up to 1 GB of attachments'}
          </span>
        </div>
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
