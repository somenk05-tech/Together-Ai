import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

const CIRC = 339.3; // 2π·54, matches tc.css .ring .fgc stroke-dasharray
const PCT = 86;

const avhero: CSSProperties = {
  width: 120, height: 120, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--serif)',
  fontSize: 36, fontWeight: 700, marginBottom: 16,
};
const astrocard: CSSProperties = {
  background: 'linear-gradient(135deg,rgba(183,110,121,.14),rgba(212,175,94,.10))',
  border: '1px solid var(--line)', borderRadius: 14, padding: '18px 20px', marginTop: 16,
};

function BreakRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
      <span>{label}</span><b style={{ color: 'var(--ink)' }}>{value}</b>
    </div>
  );
}

const INTERESTS = ['Travel', 'Music', 'Photography', 'Yoga', 'Dogs', 'Design', 'Coffee'];
const VALUES = ['Family Oriented', 'Ambitious', 'Health Conscious', 'Non Smoker'];

export function DatingMatchDetail() {
  return (
    <>
      <div className="eyebrow rise">Dating Hub · Match Detail</div>

      <div className="rise" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 32, alignItems: 'start' }}>
        <section>
          <div style={avhero}>AR</div>
          <h1 style={{ fontSize: 'clamp(24px,3vw,34px)' }}>
            Ananya Rao, 29 <span style={{ color: 'var(--accent)', fontSize: 19 }}>✓</span>
          </h1>
          <p className="lede" style={{ margin: '6px 0 16px' }}>
            Product Designer · Master's degree · 5'5" · Mumbai, India · 18 km away · Vegetarian · Never smoked
          </p>

          <div className="pill-row" style={{ marginBottom: 22 }}>
            {INTERESTS.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>

          <h3 style={{ marginBottom: 10 }}>About Ananya</h3>
          <p className="lede" style={{ marginBottom: 24 }}>
            Product designer who spends weekends chasing sunrise treks and good filter coffee. Big believer in quality
            time over grand gestures, and always up for a spontaneous city walk.
          </p>

          <h3 style={{ marginBottom: 12 }}>Values &amp; lifestyle</h3>
          <div className="pill-row" style={{ marginBottom: 24 }}>
            {VALUES.map((v) => <span key={v} className="pill on">{v}</span>)}
          </div>

          <h3 style={{ marginBottom: 12 }}>
            Astrology insight <span className="tag soon" style={{ fontSize: 9, marginLeft: 6 }}>optional</span>
          </h3>
          <div style={astrocard}>
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
              Sun in Libra, Moon in Cancer — a natural pairing with your Aquarius Sun and Cancer Moon. Shared water-sign
              emotional rhythm points to easy communication and mutual comfort.
            </p>
          </div>
        </section>

        <aside>
          <div className="card" style={{ textAlign: 'center', marginBottom: 18 }}>
            <div className="ring" style={{ margin: '0 auto 8px' }}>
              <svg width={120} height={120}>
                <circle className="bgc" cx={60} cy={60} r={54} />
                <circle className="fgc" cx={60} cy={60} r={54} style={{ strokeDashoffset: CIRC * (1 - PCT / 100) }} />
              </svg>
              <div className="cent"><b>{PCT}</b><span>Great match</span></div>
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>Compatibility score</p>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <h4 style={{ marginBottom: 10 }}>Compatibility breakdown</h4>
            <BreakRow label="Values" value="92%" />
            <BreakRow label="Lifestyle" value="84%" />
            <BreakRow label="Communication" value="81%" />
            <BreakRow label="Interests" value="87%" />
            <BreakRow label="Emotional Alignment" value="85%" />
          </div>

          <div className="note" style={{ marginBottom: 18 }}>
            You both value honesty, loyalty and growth — Together City's engine flagged this as one of your strongest
            reads this month.
          </div>

          <Link to="/dating/chat?u=@ananya" style={{ display: 'block', marginBottom: 10 }}>
            <Button variant="gold" style={{ width: '100%', justifyContent: 'center' }}>Accept introduction</Button>
          </Link>
          <Link to="/dating/matches" style={{ display: 'block' }}>
            <Button variant="line" style={{ width: '100%', justifyContent: 'center' }}>Pass — find someone else</Button>
          </Link>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12, textAlign: 'center' }}>
            She'll be notified only if you accept the introduction.
          </p>
        </aside>
      </div>

      <div className="trust">
        <span>◈ Verified profiles</span>
        <span>◈ Privacy first</span>
        <span>◈ Handpicked matches</span>
        <span>◈ Quality over quantity</span>
      </div>
    </>
  );
}
