import { Link } from 'react-router-dom';

/** Order Blood Tests — coming soon. Uploading & analysing reports you already have works today. */
export function Tests() {
  return (
    <div>
      <div className="eyebrow">Medical Hub · Order Blood Tests</div>
      <h1 style={{ fontSize: 26 }}>Order Blood Tests</h1>

      <div className="card" style={{ marginTop: 20, textAlign: 'center', padding: '46px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🧪</div>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Coming soon</h2>
        <p className="muted" style={{ fontSize: 13.5, maxWidth: '46ch', margin: '0 auto 18px', lineHeight: 1.6 }}>
          Booking home-collection blood tests from partner labs is on the way. In the meantime,
          you can already upload a report you have and get it read and analysed instantly.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-accent btn-sm" to="/medical/blood">Upload &amp; analyse a report →</Link>
          <Link className="btn btn-line btn-sm" to="/medical/records">Health Records</Link>
        </div>
      </div>
    </div>
  );
}
