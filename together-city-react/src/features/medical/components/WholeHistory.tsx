import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useMedicalHistory, type HistoryArea } from '../api';

const STATUS: Record<HistoryArea['status'], { label: string; color: string; bg: string }> = {
  attention: { label: 'Needs attention', color: 'var(--danger-ink)', bg: 'var(--danger-soft)' },
  watch: { label: 'Keep an eye on', color: 'var(--warn-ink)', bg: 'var(--warn-soft)' },
  good: { label: 'In range', color: 'var(--ok-ink)', bg: 'var(--ok-soft)' },
  unclear: { label: 'Not enough to say', color: 'var(--ink-soft)', bg: 'var(--line)' },
};

const eyebrowSmall = { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 6 };

/**
 * THE WHOLE RECORD, READ (owner, 10 Sep): "give the user analysis of their
 * entire medical history". Every document in the vault — blood panels,
 * prescriptions, scans, notes — read as one overview, area by area, each claim
 * naming the document it came from. Written once on the server and kept until
 * something in the vault changes, so opening this page twice costs nothing.
 */
export function WholeHistory() {
  const h = useMedicalHistory();

  if (h.isLoading) {
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Your whole history</div>
        <Spinner label="Reading every document in your vault…" />
      </div>
    );
  }
  if (h.isError || !h.data) {
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Your whole history</div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>We couldn’t read your history just now — nothing has been lost.</p>
        <div style={{ marginTop: 10 }}><Button size="sm" variant="line" onClick={() => void h.refetch()}>Try again</Button></div>
      </div>
    );
  }
  const d = h.data;
  if (!d.hasRecords) {
    return (
      <div className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Your whole history</div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          Nothing in your vault yet. <Link to="/medical/records" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Upload your reports</Link> — every one is read, filed and brought into this analysis.
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="eyebrow">Your whole history</div>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
        {d.documents} document{d.documents === 1 ? '' : 's'}
        {d.panels ? ` · ${d.panels} blood panel${d.panels === 1 ? '' : 's'}` : ''}
        {d.from ? ` · ${d.from === d.to ? d.from : `${d.from} to ${d.to}`}` : ''}
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.65, margin: '10px 0 0' }}>{d.overview}</p>

      {d.needsTag > 0 && (
        <p style={{ fontSize: 12.5, marginTop: 10, padding: '8px 10px', background: 'var(--warn-soft)', borderRadius: 8 }}>
          {d.needsTag} document{d.needsTag === 1 ? ' is' : 's are'} waiting for a tag — <Link to="/medical/records" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>tell us what {d.needsTag === 1 ? 'it is' : 'they are'}</Link>.
        </p>
      )}

      {d.areas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 14 }}>
          {d.areas.map((a, i) => {
            const st = STATUS[a.status];
            return (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13.5 }}>{a.area}</strong>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, borderRadius: 'var(--r-full)', padding: '3px 10px', background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.55, margin: '6px 0 0', color: 'var(--ink-soft)' }}>{a.summary}</p>
                {a.evidence.length > 0 && (
                  <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11.5, lineHeight: 1.5 }}>
                    {a.evidence.map((e, j) => <li key={j}>{e}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {d.changes.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={eyebrowSmall}>How things have changed</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>{d.changes.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {d.discuss.length > 0 && (
        <p style={{ marginTop: 12, padding: '10px 12px', background: 'var(--warn-soft)', borderLeft: '3px solid var(--warn-line)', borderRadius: 6, fontSize: 13 }}>
          <b>Worth discussing with your doctor:</b> {d.discuss.join('; ')}
        </p>
      )}
      {d.gaps.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={eyebrowSmall}>Questions to ask about what’s missing</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>{d.gaps.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        {d.disclaimer}{!d.fromModel ? ' · The AI reading is unavailable right now — showing what your records say without it.' : ''}
      </p>
    </div>
  );
}
