import { useState } from 'react';
import { Spinner } from '@/components/ui';
import { useMedicalMailOps } from './api';

/**
 * The founder's counters for Medical Mail — how much arrived, how much of it
 * was stored and filed, what failed and why (the pipeline's own sentences).
 * Never a subject, a sender, a filename or a citizen: the API refuses to
 * carry them. Behind the developer page's lock.
 */
export function MedicalMailOps() {
  const [days, setDays] = useState(7);
  const q = useMedicalMailOps(days);
  const d = (q.data ?? {}) as Record<string, unknown>;
  const rec = (k: string) => Object.entries((d[k] as Record<string, number>) ?? {});
  const tiles: Array<[string, unknown]> = [
    ['Mailboxes', d.mailboxes], ['Emails received', d.emails], ['Attachments', d.attachments],
    ['Attachment success', d.attachmentSuccessRate === null ? '—' : `${String(d.attachmentSuccessRate ?? 0)}%`],
    ['Attachment failures', d.attachmentFailures], ['Hints on ordinary mail', d.hintsOnOrdinaryMail],
  ];
  return (
    <div className="page mm-ops">
      <div className="eyebrow">Developer · Medical Mail</div>
      <h1 className="mm-h1">Medical Mail, by the numbers</h1>
      <p className="muted mm-lead">Counts and rates. No content leaves the vault — not here, not anywhere.</p>
      <div className="mm-ops-range">
        {[1, 7, 30].map((n) => <button key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n}>{n === 1 ? 'Today' : `${n} days`}</button>)}
      </div>
      {q.isLoading && <Spinner label="Counting…" />}
      {q.isError && <p className="mm-ops-err">The counters could not be read — the developer lock, or the API.</p>}
      {q.data && (
        <div className="mm-ops-grid">
          {tiles.map(([k, v]) => (
            <div key={k} className="card"><div className="mm-ops-n">{String(v ?? 0)}</div><div className="mm-stat-l">{k}</div></div>
          ))}
          <div className="card">
            <div className="mm-eyebrow">Classifications</div>
            {rec('classifications').map(([k, v]) => <div key={k} className="mm-ops-kv"><span>{k}</span><span>{v}</span></div>)}
          </div>
          <div className="card">
            <div className="mm-eyebrow">Attachment states</div>
            {rec('attachmentStatuses').map(([k, v]) => <div key={k} className="mm-ops-kv"><span>{k}</span><span>{v}</span></div>)}
          </div>
          <div className="card mm-ops-wide">
            <div className="mm-eyebrow">Why attachments failed</div>
            {rec('failureReasons').length === 0 && <p className="muted mm-fine">Nothing failed.</p>}
            {rec('failureReasons').map(([k, v]) => <div key={k} className="mm-ops-kv"><span>{k}</span><span>{v}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
