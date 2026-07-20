/** Expert Care — talk to a registered nutritionist. Booking is coming soon;
 *  this page previews what the service will cover. */
export function Dietitian() {
  const conditions = ['CKD / Kidney', 'Diabetes', 'High Cholesterol', 'Heart Health', 'Cancer Support', 'Thyroid', 'PCOS', 'Fatty Liver', 'More'];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 09</div>
      <h1 style={{ fontSize: 26 }}>Expert Care for Better Health</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Consult a registered dietitian for severe conditions, abnormal blood results, or simply expert guidance you can trust.
      </p>

      {/* Coming soon */}
      <div
        className="card"
        style={{
          marginBottom: 16, textAlign: 'center', padding: '30px 20px',
          background: 'var(--paper)', border: '1px dashed var(--line)',
        }}
      >
        <div style={{ fontSize: 34 }}>🩺</div>
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '4px 14px' }}>
          Coming soon
        </span>
        <h2 style={{ fontSize: 19, margin: '12px 0 4px' }}>Talk to a nutritionist</h2>
        <p className="muted" style={{ fontSize: 13, maxWidth: 440, margin: '0 auto' }}>
          One-on-one video consultations with registered dietitians — a personalised plan built around your goals and blood
          markers, plus follow-up support — are launching soon.
        </p>
      </div>

      {/* Preview of what will be covered */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>📹 Online Video Consultation</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>45–60 min · personalised plan + 7-day follow-up</span>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 10px' }}>Specialist support planned for:</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {conditions.map((c) => (
            <span key={c} style={{ fontSize: 11.5, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 999, padding: '3px 11px', color: 'var(--muted)' }}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
