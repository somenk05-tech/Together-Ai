import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Field, IMG, TabRow, TravelHero, TrustBar } from '../shared';

const badge = (variant: 'pop' | 'best'): React.CSSProperties => ({
  position: 'absolute', top: 14, right: 14, fontSize: 10, letterSpacing: '.1em', fontWeight: 700,
  textTransform: 'uppercase', padding: '5px 12px', borderRadius: 999,
  background: variant === 'best' ? 'var(--gold)' : 'var(--gold-soft)', color: variant === 'best' ? '#fff' : 'var(--gold)',
});
const cov: React.CSSProperties = { listStyle: 'none', fontSize: 12.5, color: 'var(--ink-soft)', margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: 6 };

function Plan({ name, price, badgeText, badgeVar, cta, ctaClass, borderGold, items }: {
  name: string; price: string; badgeText: string; badgeVar: 'pop' | 'best'; cta: string; ctaClass: string; borderGold?: boolean; items: ReactNode[];
}) {
  return (
    <div className="card lift" style={{ position: 'relative', ...(borderGold ? { borderColor: 'var(--gold)' } : {}) }}>
      <span style={badge(badgeVar)}>{badgeText}</span>
      <h4>{name}</h4>
      <p className="stat val" style={{ margin: '8px 0' }}>{price}</p>
      <ul style={cov}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      <Link className={ctaClass} to="/travel/checkout">{cta}</Link>
    </div>
  );
}

export function TravelInsurance() {
  return (
    <>
      <TravelHero eyebrow="Travel Hub · 06" title="Travel Insurance" sub="Travel with peace of mind, wherever you go." bg={`${IMG}insurance.webp`} />

      <TabRow tabs={['Get insured', 'My policies', 'Claims', 'Support']} />

      <div className="console rise d1" style={{ marginBottom: 16 }}>
        <div className="fields">
          <Field label="Destination" placeholder="Where are you going?" />
          <Field label="Trip dates" value="13 – 17 Jul 2026" />
          <Field label="Travellers" value="2 Adults" />
          <Field label="Trip type" value="Leisure" />
          <div className="go"><Link className="btn btn-gold" to="/travel/checkout">Get quote</Link></div>
        </div>
        <div className="below">
          <label>✓ Trusted by 10M+ travellers</label>
          <label>✓ Instant policy issuance</label>
          <label>✓ 24/7 claim assistance</label>
          <label>✓ Secure &amp; reliable</label>
        </div>
      </div>

      <section className="blk rise d2" style={{ marginTop: 40 }}>
        <div className="blk-head"><h2>Recommended plans for you</h2></div>
        <div className="grid3">
          <Plan name="Trip Secure Plus" price="₹89" badgeText="Popular" badgeVar="pop" cta="View details" ctaClass="btn btn-line btn-sm"
            items={[<>Medical cover — <b>₹250,000</b></>, <>Trip cancellation — <b>₹10,000</b></>, <>Baggage loss — <b>₹5,000</b></>]} />
          <Plan name="Travel Protect Elite" price="₹129" badgeText="Best value" badgeVar="best" cta="View details" ctaClass="btn btn-gold btn-sm" borderGold
            items={[<>Medical cover — <b>₹500,000</b></>, <>Trip cancellation — <b>₹20,000</b></>, <>Baggage loss — <b>₹7,500</b></>]} />
          <Plan name="Premium Deluxe" price="₹179" badgeText="♛ Premium" badgeVar="pop" cta="View details" ctaClass="btn btn-line btn-sm"
            items={[<>Medical cover — <b>₹1,000,000</b></>, <>Trip cancellation — <b>₹25,000</b></>, <>Baggage loss — <b>₹10,000</b></>]} />
        </div>
      </section>

      <section className="blk rise d3">
        <div className="note">
          <b style={{ display: 'block', fontFamily: 'var(--serif)', fontSize: 16, marginBottom: 6, color: 'var(--ink)' }}>Why buy travel insurance?</b>
          Medical emergencies abroad, cancelled flights and lost baggage cost real money — a plan settles claims in days, not weeks, and puts a 24/7 assistance line in your pocket wherever the trip takes you.
        </div>
      </section>

      <TrustBar items={['24/7 global assistance', 'Easy claims', '100% secure', 'Trusted partners']} />
    </>
  );
}
