import { Link } from 'react-router-dom';

/** Talk to a Doctor — coming soon. */
export function Consults() {
  return (
    <div>
      <div className="eyebrow">Medical Hub · Talk to a Doctor</div>
      <h1 style={{ fontSize: 26 }}>Talk to a Doctor</h1>

      <div className="card" style={{ marginTop: 20, textAlign: 'center', padding: '46px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🩺</div>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Coming soon</h2>
        <p className="muted" style={{ fontSize: 13.5, maxWidth: '46ch', margin: '0 auto 18px', lineHeight: 1.6 }}>
          Booking video and clinic consults with verified doctors — with your reports and blood
          panel shared securely — is on the way. In the meantime, upload a report and get an
          instant AI-assisted analysis to bring to your next appointment.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-accent btn-sm" to="/medical/blood">Analyse a report →</Link>
          <Link className="btn btn-line btn-sm" to="/medical/records">Health Records</Link>
        </div>
      </div>
    </div>
  );
}
