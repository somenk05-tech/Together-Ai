import { useState } from 'react';
import { Button } from '@/components/ui';
import { useDeleteCvEntry, useEditCvEntry, type CvEntry, type CvEntryInput } from '../api';
import { EntryEditor } from './EntryEditor';
import { KIND_ONE } from '../cv-labels';

/**
 * NOTHING BELOW HIGH CONFIDENCE IS A CLAIM UNTIL SOMEBODY CONFIRMS IT.
 *
 * A model reading a two-column PDF gets some of it right and some of it nearly
 * right, and the difference matters because everything on this page goes out in
 * the citizen's name. So the reader's uncertainty is carried all the way to the
 * screen: `needsConfirming` is the server saying "this row is a question", and
 * a question is shown as a question.
 *
 * ONLY the uncertain rows appear here. A review screen that asks about
 * thirty-one entries when it is unsure about four teaches people to press
 * Accept All, which is the same as having no review at all — and when the
 * reader was sure about everything this screen does not appear.
 *
 * THREE ANSWERS, and each is a different sentence:
 *   Confirm — "yes, that is right". The row becomes theirs; a later upload
 *             will no longer overwrite it.
 *   Edit    — "nearly". Same outcome, with their words instead.
 *   Discard — "that is not mine, or not worth printing". Gone.
 *
 * The EVIDENCE is shown where the reader gave any: the fragment of the document
 * the row came from. Somebody cannot judge "Zeta Labs, 2019–2021" without
 * seeing the line it was read off.
 */

export interface CvReviewProps {
  entries: CvEntry[];
  /** Every question answered — or the citizen deciding to leave the rest. */
  onDone: () => void;
}

const asInput = (e: CvEntry): CvEntryInput => ({
  kind: e.kind, title: e.title, organisation: e.organisation, qualifier: e.qualifier,
  location: e.location, startText: e.startText, endText: e.endText, current: e.current,
  description: e.description, bullets: e.bullets, tags: e.tags, url: e.url, hidden: e.hidden,
});

export function CvReview({ entries, onDone }: CvReviewProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useEditCvEntry();
  const discard = useDeleteCvEntry();
  const busy = confirm.isPending || discard.isPending;

  const failed = (e: unknown) => {
    const m = e as { response?: { data?: { message?: string | string[] } } };
    const raw = m?.response?.data?.message;
    setError(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That answer could not be saved.');
  };

  const answer = (id: string, input: CvEntryInput) => {
    setError(null);
    confirm.mutate({ id, input }, { onSuccess: () => setOpenId(null), onError: failed });
  };

  return (
    <div>
      <div className="eyebrow">Jobs · Reading your CV</div>
      <h1 style={{ fontSize: 26 }}>
        {entries.length === 1 ? 'One thing to check' : `${entries.length} things to check`}
      </h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: 620 }}>
        These are the parts we were not certain we read correctly. Nothing here goes on your
        profile as a fact until you say it is one — confirm it, fix it, or throw it away.
      </p>

      {error && (
        <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {entries.map((e) => (
          openId === e.id ? (
            <EntryEditor key={e.id} entry={e} kind={e.kind} busy={busy} error={null}
              onSave={(input) => answer(e.id, input)} onCancel={() => setOpenId(null)} />
          ) : (
            <div key={e.id} className="card" style={{ display: 'grid', gap: 10 }}>
              <div className="eyebrow">{KIND_ONE[e.kind] ?? e.kind}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.01em' }}>
                  {e.title || e.organisation || 'Untitled'}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {[e.title && e.organisation, e.qualifier, e.location,
                    [e.startText, e.current ? 'Present' : e.endText].filter(Boolean).join(' — ')]
                    .filter(Boolean).join(' · ') || 'Nothing else was read for this one.'}
                </div>
              </div>
              {e.description && <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{e.description}</p>}
              {e.bullets.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, lineHeight: 1.55 }}>
                  {e.bullets.map((b, i) => <li key={`${e.id}-b${i}`}>{b}</li>)}
                </ul>
              )}

              {/* WHERE IT CAME FROM. Nobody can judge a row they cannot trace
                  back to a line of their own document. */}
              {e.evidence && (
                <blockquote style={{
                  margin: 0, padding: '10px 14px', borderLeft: '3px solid var(--line-2)',
                  background: 'var(--wash)', borderRadius: 10,
                  fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)',
                }}>
                  <span className="muted" style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Read from your CV
                  </span>
                  {e.evidence}
                </blockquote>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="accent" size="sm" disabled={busy}
                  onClick={() => answer(e.id, asInput(e))}>Confirm</Button>
                <Button variant="line" size="sm" disabled={busy}
                  onClick={() => setOpenId(e.id)}>Edit</Button>
                <Button variant="line" size="sm" disabled={busy}
                  onClick={() => { setError(null); discard.mutate(e.id, { onError: failed }); }}>Discard</Button>
              </div>
            </div>
          )
        ))}
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="line" onClick={onDone}>Leave the rest for later</Button>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Anything you skip stays on your record marked unchecked — you can come back to it.
        </span>
      </div>
    </div>
  );
}
