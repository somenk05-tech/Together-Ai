import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Fold, Spinner, useDisclosure } from '@/components/ui';
import {
  CATEGORY_LABEL, STATUS_LABEL, categoryLabel, fmtBytes, openAttachment, recordKindLabel,
  useAnalyzeAttachment, useFlagMedicalEmail, useMedicalEmail, useMoveToMail, useProvenance, useReclassify, useRemoveMedicalEmail, useRestoreMedicalEmail, useSaveAttachment,
  type MedicalAttachment,
} from './api';

const errText = (e: unknown): string =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'That didn’t work — try again.';

/** §49 — where a document came from, for one record: every email that
 *  carried it, and the audit trail of what was done to it. */
function Provenance({ recordId }: { recordId: string }) {
  const q = useProvenance(recordId);
  if (!q.data) return <p className="muted mm-fine">{q.isLoading ? 'Reading…' : 'The history could not be read.'}</p>;
  return (
    <ul className="mm-trail">
      {q.data.emails.map((e) => (
        <li key={e.attachmentId}><span className="mm-when">{new Date(e.receivedAt).toLocaleDateString()}</span><span>Arrived as {e.filename} on “{e.subject}” from {e.fromName}{e.duplicate ? ' (same file again)' : ''}</span></li>
      ))}
      {q.data.trail.map((t, i) => (
        <li key={i}><span className="mm-when">{new Date(t.at).toLocaleString()}</span><span>{t.action.replace(/_/g, ' ')} · {t.by === 'you' ? 'you' : 'the city'}</span></li>
      ))}
    </ul>
  );
}

/** One attachment row: its state, and what can be done with the document. */
function AttachmentRow({ emailId, a, busy, onSave, onAnalyze }: {
  emailId: string; a: MedicalAttachment; busy: boolean; onSave: () => void; onAnalyze: () => void;
}) {
  /* "Where it came from" is a disclosure of its own, through the shared hook
     — the contract (state, id, aria-expanded, aria-controls) lives in Fold.tsx. */
  const history = useDisclosure(false);
  const tone = a.status === 'failed' ? ' mm-failed' : a.status === 'needs_review' ? ' mm-review' : a.status === 'processing' ? ' mm-busy' : '';
  return (
    <div>
      <div className="mm-att">
        <span className="mm-glyph-sm">📄</span>
        <span className="mm-att-main">
          <span className="mm-att-name">{a.filename} <span className="mm-att-size">{a.sizeBytes ? fmtBytes(a.sizeBytes) : ''}</span></span>
          <span className={`mm-att-state${tone}`}>
            {STATUS_LABEL[a.status]}{a.recordId && a.documentType ? ` · ${recordKindLabel(a.documentType)}` : ''}{a.recordTitle ? ` · ${a.recordTitle}` : ''}
            {a.error && a.status !== 'stored' ? <span className="muted"> — {a.error}</span> : null}
          </span>
        </span>
        <span className="mm-att-acts">
          {a.stored && <button type="button" className="mm-linkbtn" onClick={() => void openAttachment(emailId, a.id)}>View</button>}
          {a.stored && <button type="button" className="mm-linkbtn" onClick={() => void openAttachment(emailId, a.id)}>Download</button>}
          {a.recordId && <Link to={`/medical/records?folder=${a.documentType ?? 'unsorted'}`} className="mm-link-plain">In Health Records</Link>}
          {a.recordId && <button type="button" className="mm-linkbtn mm-quiet" {...history.faceProps}>Where it came from</button>}
          {a.canSave && (
            <Button size="sm" variant="accent" state={busy ? 'loading' : undefined} loadingLabel="Filing…" onClick={onSave}>Save to Health Records</Button>
          )}
          {a.recordId && (a.analysisReady
            ? <Link to="/medical/blood" className="mm-link-ok">Analysis ready →</Link>
            : <Button size="sm" variant="line" state={busy ? 'loading' : undefined} loadingLabel="Reading…" onClick={onAnalyze}>Analyze</Button>)}
        </span>
      </div>
      {history.open && a.recordId && <div {...history.panelProps}><Provenance recordId={a.recordId} /></div>}
    </div>
  );
}

/**
 * One medical email, opened. Header, body, and the attachments — each with
 * the state the pipeline left it in and the things a citizen can do with a
 * document: view it, download it, save it to Health Records, analyse it, see
 * where it came from. Under the body, "Why is this here?" in the classifier's
 * own words, and the ways to correct it. Nothing here replies: the address
 * receives. Drawn by medical-mail.css.
 */
export function MedicalMailMessage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useMedicalEmail(id);
  const flag = useFlagMedicalEmail();
  const remove = useRemoveMedicalEmail();
  const restore = useRestoreMedicalEmail();
  const reclassify = useReclassify();
  const toMail = useMoveToMail();
  const save = useSaveAttachment();
  const analyze = useAnalyzeAttachment();
  const [note, setNote] = useState<string | null>(null);
  const [confirmGone, setConfirmGone] = useState(false);

  if (q.isLoading) return <Spinner label="Opening…" />;
  if (q.isError || !q.data) {
    return (
      <div>
        <div className="eyebrow">Medical Hub · Medical Mail</div>
        <h1 className="mm-h1">We couldn’t open this message</h1>
        <p className="muted mm-lead">It is exactly as it was. <Link to="/medical/mail" className="mm-link">Back to Medical Mail</Link></p>
      </div>
    );
  }
  const m = q.data;
  const isMedical = m.classification === 'medical' || m.classification === 'likely-medical';
  const when = new Date(m.receivedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const toPersonal = (rememberSender?: 'personal') => toMail.mutate({ id: m.id, rememberSender }, { onSuccess: (r) => nav(`/mail/message/${r.mailMessageId}`) });

  return (
    <div>
      <div className="eyebrow">Medical Hub · Medical Mail</div>
      <p className="mm-back"><Link to="/medical/mail" className="mm-link">← Medical Mail</Link></p>

      <div className="card mm-msg">
        <div className="mm-head">
          <h1 className="mm-h1">{m.subject}</h1>
          <span className={`mm-tag${isMedical ? '' : ' mm-unsure'}`}>{isMedical ? categoryLabel(m.category) : m.classification === 'personal' ? 'Looks personal' : 'Not sure'}</span>
        </div>
        <div className="mm-meta">
          <div className="mm-line"><span className="muted">From</span><span>{m.fromName} <span className="muted">&lt;{m.fromAddr}&gt;</span>{m.authenticated === false && <span className="mm-warn"> · sender not verified</span>}</span></div>
          <div className="mm-line"><span className="muted">To</span><span>Your medical address</span></div>
          <div className="mm-line"><span className="muted">Date</span><span>{when}</span></div>
        </div>
        <div className="mm-body">{m.body}</div>

        {m.attachments.length > 0 && (
          <div className="mm-atts">
            <div className="mm-eyebrow">Attachments</div>
            {m.attachments.map((a) => (
              <AttachmentRow key={a.id} emailId={m.id} a={a}
                busy={(save.isPending && save.variables?.attachmentId === a.id) || (analyze.isPending && analyze.variables?.attachmentId === a.id)}
                onSave={() => save.mutate({ id: m.id, attachmentId: a.id }, { onError: (e) => setNote(errText(e)) })}
                onAnalyze={() => analyze.mutate({ id: m.id, attachmentId: a.id }, { onSuccess: (r) => setNote(`${r.note} ${r.label}`), onError: (e) => setNote(errText(e)) })} />
            ))}
            <p className="mm-fine">Original files are kept exactly as they arrived. Anything read off a document is marked “extracted from document”; analysis is AI-generated and not a diagnosis.</p>
          </div>
        )}
        {note && <p role="status" className="mm-note">{note}</p>}
      </div>

      <div className="card mm-msg">
        <Fold title="Why is this here?" meta={m.confidence ? `${Math.round(m.confidence * 100)}% sure` : undefined}>
          <p className="mm-why">{m.why}</p>
          <div className="mm-acts">
            {!isMedical && (
              <Button size="sm" variant="accent" state={reclassify.isPending ? 'loading' : undefined} loadingLabel="Moving…"
                onClick={() => reclassify.mutate({ id: m.id, classification: 'medical' })}>Keep in Medical</Button>
            )}
            <Button size="sm" variant="line" state={toMail.isPending ? 'loading' : undefined} loadingLabel="Moving…" onClick={() => toPersonal()}>Move to Together City Mail</Button>
            <label className="mm-cat">
              Category
              <select className="mm-select" value={m.category ?? ''} onChange={(e) => reclassify.mutate({ id: m.id, classification: 'medical', category: e.target.value || null })}>
                <option value="">—</option>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="mm-acts-links">
            <button type="button" className="mm-linkbtn" onClick={() => reclassify.mutate({ id: m.id, rememberSender: 'medical', scope: 'address' })}>Always medical: this sender</button>
            <button type="button" className="mm-linkbtn" onClick={() => reclassify.mutate({ id: m.id, rememberSender: 'medical', scope: 'domain' })}>Always medical: {m.fromAddr.split('@')[1]}</button>
            <button type="button" className="mm-linkbtn mm-quiet" onClick={() => toPersonal('personal')}>Never medical: this sender</button>
          </div>
        </Fold>
      </div>

      <div className="mm-acts">
        <Button size="sm" variant="line" onClick={() => flag.mutate({ id: m.id, starred: !m.starred })}>{m.starred ? '★ Starred' : '☆ Star'}</Button>
        <Button size="sm" variant="line" onClick={() => flag.mutate({ id: m.id, read: false }, { onSuccess: () => nav('/medical/mail') })}>Mark unread</Button>
        {!m.deleted && <Button size="sm" variant="line" onClick={() => flag.mutate({ id: m.id, archived: !m.archived }, { onSuccess: () => nav('/medical/mail') })}>{m.archived ? 'Unarchive' : 'Archive'}</Button>}
        {m.deleted
          ? <Button size="sm" variant="line" onClick={() => restore.mutate(m.id)}>Restore</Button>
          : <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: m.id }, { onSuccess: () => nav('/medical/mail') })} state={remove.isPending ? 'loading' : undefined} loadingLabel="Deleting…">Delete</Button>}
        {m.deleted && !confirmGone && <Button size="sm" variant="ghost" onClick={() => setConfirmGone(true)}>Delete forever</Button>}
        {m.deleted && confirmGone && (
          <span className="mm-confirm">
            Gone for good — documents already in Health Records stay there.
            <Button size="sm" variant="line" onClick={() => remove.mutate({ id: m.id, forever: true }, { onSuccess: () => nav('/medical/mail?folder=trash') })}>Yes, delete forever</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmGone(false)}>Keep it</Button>
          </span>
        )}
      </div>
    </div>
  );
}
