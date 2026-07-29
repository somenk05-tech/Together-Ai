import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useDirectory, useSendMail, useMailAccount, type DirectoryEntry } from '../api';
import { payError } from '@/features/financial/api';
import { DrivePicker } from '../DrivePicker';
import { fmtBytes, fileIcon, type DriveFile } from '@/features/drive/api';

/** Compose — write to any @togethercity.app citizen (directory autocomplete)
 *  OR any external/global email address (delivered via the email provider). */
export function Compose() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const dir = useDirectory();
  const acct = useMailAccount();
  const send = useSendMail();

  const [to, setTo] = useState(params.get('to') ?? '');
  const [subject, setSubject] = useState(params.get('subject') ?? '');
  const [body, setBody] = useState('');
  const [showSug, setShowSug] = useState(false);
  const [attachments, setAttachments] = useState<DriveFile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const threadId = params.get('threadId') ?? undefined; // set when replying → append to trail

  const suggestions = useMemo(() => {
    const term = to.trim().toLowerCase().replace(/@.*/, '');
    if (!term) return (dir.data ?? []).slice(0, 6);
    return (dir.data ?? []).filter((d) => d.name.toLowerCase().includes(term) || d.handle.toLowerCase().includes(term)).slice(0, 6);
  }, [to, dir.data]);

  const pick = (d: DirectoryEntry) => { setTo(d.address); setShowSug(false); };
  const canSend = to.trim() && !send.isPending;

  const inp = { padding: '11px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, background: 'var(--card, #fff)' };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div><div className="eyebrow">Mail · Compose</div><h1 style={{ fontSize: 24, margin: 0 }}>✍️ New message</h1></div>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'monospace' }}>from {acct.data?.address ?? '…'}</span>
      </div>

      <div className="card" style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 12 }} className="muted">To</label>
          <input value={to} onChange={(e) => { setTo(e.target.value); setShowSug(true); }} onFocus={() => setShowSug(true)}
            placeholder="handle@togethercity.app · or any email address" style={inp} autoComplete="off" />
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

        {send.isError && <div style={{ fontSize: 13, color: '#c62828', background: '#fdecec', borderRadius: 8, padding: '8px 12px' }}>{payError(send.error)}</div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="accent" disabled={!canSend}
            onClick={() => send.mutate(
              { to, subject: subject || '(no subject)', body, threadId, attachmentFileIds: attachments.map((f) => f.id) },
              { onSuccess: () => { if (threadId) nav(-1); else nav('/mail/sent'); } },
            )}>
            {send.isPending ? 'Sending…' : threadId ? 'Send reply' : 'Send'}
          </Button>
          <Button variant="line" onClick={() => nav(-1)}>Cancel</Button>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Delivers to citizens and external emails</span>
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
