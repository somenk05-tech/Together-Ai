import { Link } from 'react-router-dom';
import { Hero } from '@/components/ui';

const vitals = [
  { label: 'Resting heart rate', value: '72 bpm', meta: 'Smartwatch · today' },
  { label: 'Steps', value: '8,240', meta: '7-day avg 7,900' },
  { label: 'Sleep', value: '7h 10m', meta: 'Last night' },
  { label: 'Health Score', value: '758 / 1000', meta: 'Up 14 pts' },
];

/** Health Profile & Fitness — vitals & smartwatch hub link (ported from medical-fitness.html). */
export function Fitness() {
  return (
    <>
      <Hero
        image="/assets/img/health-profile-hero.webp"
        eyebrow="Medical Hub · 06"
        title="Health Profile & Fitness"
        sub="Your vitals, smartwatch data and health score — connected to the rest of Together City."
        objectPosition="center 30%"
      />

      <section className="blk rise d1">
        <div className="blk-head"><h2>Live vitals</h2><span className="muted" style={{ fontSize: 12 }}>Synced from your smartwatch</span></div>
        <div className="grid4">
          {vitals.map((v) => (
            <div className="card" key={v.label}>
              <div className="muted" style={{ fontSize: 12 }}>{v.label}</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 22, margin: '4px 0 2px' }}>{v.value}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{v.meta}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Powered by your health data</h2></div>
        <div className="grid3">
          <Link className="card lift" to="/medical/blood" style={{ display: 'block' }}><h4>Blood Test Analysis</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Cited, trend-aware markers behind your score.</p></Link>
          <Link className="card lift" to="/nutrition" style={{ display: 'block' }}><h4>Nutrition &amp; meal plans</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Your labs personalise every plate.</p></Link>
          <Link className="card lift" to="/medical/connections" style={{ display: 'block' }}><h4>Sharing &amp; connections</h4><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Decide which hubs read your vitals.</p></Link>
        </div>
      </section>

      <div className="note rise d3">◈ Vitals sync is consent-gated — your Medical Hub stays the single source of truth, and Fitness reads it only while you allow it in <Link to="/medical/connections" style={{ fontWeight: 600 }}>Connections</Link>.</div>

      <div className="trust">
        <span>◈ Smartwatch Sync</span><span>◈ Longitudinal Vitals</span><span>◈ Consent-Gated</span><span>◈ One Health Score</span>
      </div>
    </>
  );
}
