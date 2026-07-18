import { Link } from 'react-router-dom';
import { Field, IMG, PCard, TabRow, TravelHero, TrustBar } from '../shared';

const DEST = [
  { img: `${IMG}flight-image.webp`, title: 'United States', meta: 'Tourist visa · 5–7 days', price: 'From ₹650' },
  { img: `${IMG}trains.webp`, title: 'United Kingdom', meta: 'Standard visitor · 3–5 days', price: 'From ₹450' },
  { img: `${IMG}packages-image.webp`, title: 'Schengen', meta: 'Short-stay C visa · 5–10 days', price: 'From ₹350' },
  { img: `${IMG}hotels.webp`, title: 'Canada', meta: 'Visitor visa · 7–15 days', price: 'From ₹600' },
  { img: `${IMG}travel-guide.webp`, title: 'Australia', meta: 'eVisitor · 7–10 days', price: 'From ₹500' },
  { img: `${IMG}mybookings-image.webp`, title: 'UAE', meta: 'Tourist visa · 1–3 days', price: 'From ₹150' },
];

const CHECKLIST = [
  'Passport valid for 6+ months from travel date',
  '2 recent passport-size photographs',
  'Proof of accommodation (hotel booking / invitation letter)',
  'Return flight ticket',
  'Bank statements — last 3 months',
  'Travel insurance certificate',
];

const ck: React.CSSProperties = {
  width: 20, height: 20, borderRadius: '50%', border: '1.5px solid var(--accent)', color: 'var(--accent)',
  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, marginTop: 1,
};

export function TravelVisa() {
  return (
    <>
      <TravelHero eyebrow="Travel Hub · 07" title="Visa Services" sub="Your journey begins with the right visa." bg={`${IMG}image-visa.webp`} />

      <TabRow tabs={['Apply visa', 'My applications', 'Visa information', 'Document checklist', 'Support']} />

      <div className="console rise d1" style={{ marginBottom: 52 }}>
        <div className="fields">
          <Field label="Destination country" placeholder="Where are you travelling?" />
          <Field label="Travel purpose" value="Tourism" />
          <Field label="Trip start" value="13 Jul 2026" />
          <Field label="Trip end" value="20 Jul 2026" />
          <Field label="Nationality" value="UAE resident" />
          <div className="go"><Link className="btn btn-gold" to="/travel/detail">Find visa</Link></div>
        </div>
      </div>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Popular destinations</h2></div>
        <div className="grid3">
          {DEST.map((d) => (
            <PCard key={d.title} to="/travel/detail" img={d.img} title={d.title} meta={d.meta} price={d.price} />
          ))}
        </div>
      </section>

      <section className="blk rise d3" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 40 }}>
        <div className="eyebrow center" style={{ textAlign: 'center' }}>How it works</div>
        <h2 className="center" style={{ textAlign: 'center', marginBottom: 6 }}>Our simple 3-step process</h2>
        <div className="stepper">
          <div className="step on"><span className="dot">1</span>Choose visa</div>
          <div className="step"><span className="dot">2</span>Apply online</div>
          <div className="step"><span className="dot">3</span>Get your visa</div>
        </div>
        <div className="center" style={{ textAlign: 'center', marginTop: 18 }}><Link className="btn btn-line" to="/chats">Contact support</Link></div>
      </section>

      <section className="blk rise d3">
        <div className="blk-head"><h2>Document checklist</h2></div>
        <div className="card">
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CHECKLIST.map((c) => (
              <li key={c} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: 'var(--ink-soft)' }}>
                <span style={ck}>✓</span>{c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <TrustBar items={['Best price guarantee', '24/7 support', 'Secure processing', 'Application tracking']} />
    </>
  );
}
