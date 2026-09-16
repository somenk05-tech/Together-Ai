import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useMedicalMailTimeline } from './api';

/** The chronological health history — one line per thing that happened,
 *  whichever door it came through. References, never copies. */
export function MedicalMailTimeline() {
  const q = useMedicalMailTimeline();
  if (q.isLoading) return <Spinner label="Reading your timeline…" />;
  const items = q.data ?? [];
  const byDay = new Map<string, typeof items>();
  for (const t of items) byDay.set(t.day, [...(byDay.get(t.day) ?? []), t]);
  return (
    <div>
      <div className="eyebrow">Medical Hub · Medical Mail</div>
      <h1 className="mm-h1">Medical timeline</h1>
      <p className="muted mm-lead">Every report, prescription and message in date order — by the date printed on the document, not the day it arrived.</p>
      <p className="mm-back"><Link to="/medical/mail" className="mm-link">← Medical Mail</Link></p>
      {q.isError && <div className="mm-section"><Button size="sm" onClick={() => void q.refetch()}>Try again</Button></div>}
      {!q.isError && items.length === 0 && (
        <div className="card mm-empty mm-section">
          <p>Nothing on the timeline yet</p>
          <p className="mm-hint">It fills itself as reports arrive or are uploaded.</p>
        </div>
      )}
      {[...byDay.entries()].map(([day, rows]) => (
        <div key={day} className="card mm-day">
          <div className="mm-eyebrow">{new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          {rows.map((t) => (
            <div key={t.id} className="mm-tl-row">
              <span className="mm-tl-what">{t.title}</span>
              <span className="mm-tl-src">{t.source === 'medical-mail' ? 'Medical Mail' : 'Uploaded'}</span>
              {t.emailId && <Link to={`/medical/mail/${t.emailId}`} className="mm-link-plain">Open email</Link>}
              {t.recordId && <Link to="/medical/records" className="mm-link-plain">Health Records</Link>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
