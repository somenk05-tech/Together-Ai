import { Link } from 'react-router-dom';

const plans = [
  { name: 'Together Shield — Individual', meta: 'Cover ₹5,00,000 · cashless at 8,500+ hospitals', price: '₹15,000', cta: 'btn btn-sm btn-line', border: false },
  { name: 'Together Shield — Family Floater', meta: 'Cover ₹10,00,000 · covers 4 members', price: '₹28,000', cta: 'btn btn-sm btn-accent', border: true },
  { name: 'Together Shield — Senior Care', meta: 'Cover ₹5,00,000 · pre-existing cover after 1 year', price: '₹22,000', cta: 'btn btn-sm btn-line', border: false },
];
const steps = [
  { label: 'Submit Claim', cls: 'done', dot: '✓' },
  { label: 'Under Review', cls: 'on', dot: '2' },
  { label: 'Approved', cls: '', dot: '3' },
  { label: 'Reimbursed', cls: '', dot: '4' },
];

/** Health Insurance — compare, buy & manage plans (ported from medical-insurance.html). */
export function Insurance() {
  return (
    <>
      <div className="rise" style={{ marginBottom: 26 }}>
        <div className="eyebrow">Medical Hub · 05</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Health Insurance</h1>
        <p className="lede" style={{ marginTop: 6 }}>Compare, buy and manage plans for yourself and your family — claims handled inside Together City.</p>
      </div>

      <section className="blk rise d1">
        <div className="blk-head"><h2>Compare plans</h2></div>
        <div className="grid3">
          {plans.map((p) => (
            <div className="card" key={p.name} style={p.border ? { borderColor: 'var(--accent)' } : undefined}>
              <h4>{p.name}</h4>
              <p className="muted" style={{ fontSize: 12.5, margin: '6px 0' }}>{p.meta}</p>
              <p style={{ fontFamily: 'var(--serif)', fontSize: 20 }}>{p.price}<span style={{ fontSize: 12, color: 'var(--muted)' }}>/yr</span></p>
              <Link className={p.cta} style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} to="/financial/wallet">Get this plan</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="blk rise d2">
        <div className="blk-head"><h2>My policies</h2></div>
        <div className="rows">
          <div className="row">
            <div className="av" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>⛨</div>
            <div className="grow"><div className="t">Together Shield — Family Floater</div><div className="m">Policy #TS-FF-88213 · covers Somen, Ananya, Papa, Maa · valid till 31 Mar 2027</div></div>
            <span className="tag green">Active</span>
          </div>
        </div>
      </section>

      <section className="blk rise d3">
        <div className="blk-head"><h2>File a claim</h2></div>
        <div className="stepper" style={{ maxWidth: 560 }}>
          {steps.map((s) => (
            <div className={`step${s.cls ? ' ' + s.cls : ''}`} key={s.label}><div className="dot">{s.dot}</div>{s.label}</div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Claim #CLM-40217 · MRI Lumbar Spine, Dec 2024 · ₹8,200 · submitted 6 Jan 2025</p>
      </section>

      <div className="note rise d4">◈ Premiums are paid from your <Link to="/financial/wallet" style={{ fontWeight: 600 }}>Together Wallet</Link>. Manage overall spend in <Link to="/financial/budgets" style={{ fontWeight: 600 }}>Budget Monitoring</Link>.</div>

      <div className="trust">
        <span>◈ Cashless Claims</span><span>◈ Family Floater</span><span>◈ 8,500+ Hospitals</span><span>◈ 24/7 Support</span>
      </div>
    </>
  );
}
