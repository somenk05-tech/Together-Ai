import { Link } from 'react-router-dom';

interface TLItem { yr: string; title: string; note?: React.ReactNode }
const ITEMS: TLItem[] = [
  { yr: '15 Jul 2026', title: 'Health Score check-in — 758 / 1000', note: <>Up 14 points since last blood test · <Link to="/medical/blood" style={{ color: 'var(--accent)', fontWeight: 600 }}>view profile</Link></> },
  { yr: '12 Jul 2026', title: 'Vitamin D — retest ordered', note: <>Following borderline result · <Link to="/medical/tests" style={{ color: 'var(--accent)', fontWeight: 600 }}>book a test</Link></> },
  { yr: '2 Jul 2025', title: 'Papa — Cardiology review', note: 'Hypertension stable, medication continued' },
  { yr: '14 Jun 2025', title: 'Ananya — Dermatologist visit', note: 'Follow-up scheduled 20 Jul 2026' },
  { yr: '10 Jun 2025', title: 'Prescription — Dr. Ayesha Kapoor', note: 'General consult, e-prescription filed' },
  { yr: '28 May 2025', title: 'CBC — City Diagnostics', note: 'All values within normal range' },
  { yr: '20 Apr 2025', title: 'Lipid Profile — cholesterol flagged high', note: 'Triggered Nutrition meal-plan adjustment' },
  { yr: 'Dec 2024', title: 'MRI Lumbar Spine', note: 'Reviewed with orthopaedic specialist' },
  { yr: 'Nov 2024', title: 'Vaccination — Tdap Booster' },
  { yr: '2023', title: 'Thyroid Profile', note: 'Within normal range' },
  { yr: '2022', title: 'Vitamin D — low', note: 'Supplement course started' },
  { yr: '2021', title: 'Annual Checkup' },
  { yr: '2020', title: 'Ultrasound' },
];

/** Health Timeline — longitudinal health history (ported from medical-timeline.html). */
export function Timeline() {
  return (
    <>
      <div className="rise" style={{ marginBottom: 26 }}>
        <div className="eyebrow">Medical Hub · Timeline</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Health Timeline</h1>
        <p className="lede" style={{ marginTop: 6 }}>Every visit, test and vaccination — plotted across your years, not just listed.</p>
      </div>

      <div className="note rise d1">◈ AI insight: "HbA1c trending down since March — your meal plan is working." <Link to="/nutrition" style={{ fontWeight: 600 }}>See meal plan impact →</Link></div>

      <div className="rise d2" style={{ position: 'relative', paddingLeft: 28, margin: '20px 0' }}>
        <span style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 2, background: 'var(--line)' }} />
        {ITEMS.map((it, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 22 }}>
            <span style={{ position: 'absolute', left: -28, top: 4, width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--card)', boxShadow: '0 0 0 2px var(--accent)' }} />
            <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>{it.yr}</div>
            <h4>{it.title}</h4>
            {it.note && <p className="muted" style={{ fontSize: 12.5 }}>{it.note}</p>}
          </div>
        ))}
      </div>

      <section className="blk rise d3">
        <div className="blk-head"><h2>Take action</h2></div>
        <div className="grid3">
          <Link className="card lift" to="/medical/records" style={{ display: 'block' }}><h4>Open a record</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Jump to the source report or visit note.</p></Link>
          <Link className="card lift" to="/medical/tests" style={{ display: 'block' }}><h4>Book a follow-up test</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Continue tracking Vitamin D &amp; cholesterol.</p></Link>
          <Link className="card lift" to="/medical/connections" style={{ display: 'block' }}><h4>Share with a doctor</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Consent-scoped, expiring link.</p></Link>
        </div>
      </section>

      <div className="trust">
        <span>◈ Longitudinal History</span><span>◈ Auto-Plotted Results</span><span>◈ AI Insights</span><span>◈ Shareable, Consent-Scoped</span>
      </div>
    </>
  );
}
