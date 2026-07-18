import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, Tabs, TrustBar } from '../shared';

interface Flt { airline: string; no: string; dep: string; arr: string; dur: string; mins: number; price: number }
const FLIGHTS: Flt[] = [
  { airline: 'Emirates', no: 'EK 512', dep: '06:45', arr: '11:20', dur: '3h 35m · Non-stop', mins: 215, price: 1240 },
  { airline: 'IndiGo', no: '6E 1407', dep: '09:15', arr: '13:55', dur: '4h 40m · Non-stop', mins: 280, price: 890 },
  { airline: 'Air India', no: 'AI 995', dep: '14:30', arr: '19:05', dur: '4h 35m · Non-stop', mins: 275, price: 1050 },
  { airline: 'SpiceJet', no: 'SG 11', dep: '17:40', arr: '22:20', dur: '4h 40m · Non-stop', mins: 280, price: 810 },
  { airline: 'flydubai', no: 'FZ 1601', dep: '22:10', arr: '02:35 +1', dur: '8h 25m · 1 stop (BOM)', mins: 505, price: 760 },
];
const SORTS = ['Best', 'Cheapest', 'Fastest'];

const filterCard: React.CSSProperties = { display: 'block', fontSize: 13, marginBottom: 8 };

export function TravelResults() {
  const [sort, setSort] = useState(0);
  const rows = useMemo(() => {
    const list = [...FLIGHTS];
    if (SORTS[sort] === 'Cheapest') list.sort((a, b) => a.price - b.price);
    else if (SORTS[sort] === 'Fastest') list.sort((a, b) => a.mins - b.mins);
    return list;
  }, [sort]);

  return (
    <>
      <div className="console rise" style={{ marginBottom: 22 }}>
        <Tabs tabs={['One way', 'Round trip', 'Multi city']} />
        <div className="fields">
          <Field label="From" value="DXB — Dubai, UAE" />
          <div className="f" style={{ flex: 0, display: 'flex', alignItems: 'center', padding: '16px 8px', color: 'var(--accent)' }}>⇄</div>
          <Field label="To" value="DEL — Delhi, India" />
          <Field label="Depart" value="Sun, 13 Jul 2026" />
          <Field label="Passengers & class" value="1 Passenger, Economy" />
          <div className="go"><Link className="btn btn-gold btn-sm" to="/travel/results">Update search</Link></div>
        </div>
      </div>

      <div className="blk-head rise d1">
        <h2>DXB → DEL · 13 Jul 2026</h2>
        <div className="pill-row">
          {SORTS.map((s, i) => (
            <span key={s} className={i === sort ? 'pill on' : 'pill'} style={{ cursor: 'pointer' }} onClick={() => setSort(i)}>{s}</span>
          ))}
        </div>
      </div>

      <div className="rise d2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,260px) 1fr', gap: 28, alignItems: 'start' }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <h5 style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Price range</h5>
            <input type="range" min={700} max={1400} defaultValue={1400} style={{ width: '100%' }} />
            <p className="meta muted" style={{ fontSize: 12 }}>₹700 – ₹1,400</p>
          </div>
          <div className="card">
            <h5 style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Stops</h5>
            <label style={filterCard}><input type="checkbox" defaultChecked /> Non-stop</label>
            <label style={filterCard}><input type="checkbox" /> 1 stop</label>
            <label style={filterCard}><input type="checkbox" /> 2+ stops</label>
          </div>
          <div className="card">
            <h5 style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Class</h5>
            <label style={filterCard}><input type="checkbox" defaultChecked /> Economy</label>
            <label style={filterCard}><input type="checkbox" /> Business</label>
          </div>
          <div className="card">
            <h5 style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Airlines</h5>
            <label style={filterCard}><input type="checkbox" defaultChecked /> Emirates</label>
            <label style={filterCard}><input type="checkbox" defaultChecked /> IndiGo</label>
            <label style={filterCard}><input type="checkbox" defaultChecked /> Air India</label>
            <label style={filterCard}><input type="checkbox" /> flydubai</label>
          </div>
        </aside>

        <section>
          <div className="rows">
            {rows.map((f) => (
              <div key={f.no} style={{ display: 'flex', alignItems: 'center', gap: 22, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '18px 22px', boxShadow: 'var(--shadow)' }}>
                <div style={{ width: 96, flexShrink: 0, fontWeight: 600, fontSize: 13.5 }}>{f.airline}<span style={{ display: 'block', fontWeight: 400, fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{f.no}</span></div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, fontSize: 14 }}>
                  <span>{f.dep}</span>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
                    <span style={{ display: 'block', height: 1, background: 'var(--line)', margin: '6px 0 4px' }} />{f.dur}
                  </span>
                  <span>{f.arr}</span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <b style={{ display: 'block', fontFamily: 'var(--serif)', fontSize: 19 }}>₹{f.price.toLocaleString('en-IN')}</b>
                  <Link className="btn btn-gold btn-sm" to="/travel/detail">Select</Link>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 13 }}>Compare tray — add up to 3 flights to compare side by side</span>
            <Link className="btn btn-line btn-sm" to="/travel/results">Compare selected</Link>
          </div>
        </section>
      </div>

      <TrustBar items={['Best price guarantee', '24/7 support', 'Secure booking', 'Easy cancellation']} />
    </>
  );
}
