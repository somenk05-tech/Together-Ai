import { Link } from 'react-router-dom';
import { Field, IMG, PCard, Tabs, TravelHero, TrustBar } from '../shared';

const ROUTES = [
  { img: `${IMG}trains-image.webp`, title: 'New Delhi → Mumbai', meta: 'Rajdhani Express · Dep 16:55 · 15h 55m', cls: '3AC', price: '₹195' },
  { img: `${IMG}trains.webp`, title: 'Mumbai → Bangalore', meta: 'Udyan Express · 17h 40m', cls: '3AC', price: '₹165' },
  { img: `${IMG}packages-image.webp`, title: 'New Delhi → Kolkata', meta: 'Duronto Express · 16h 30m', cls: '3AC', price: '₹175' },
  { img: `${IMG}hotel-imahe.webp`, title: 'Chennai → Hyderabad', meta: 'Falaknuma Express · 12h 05m', cls: '2AC', price: '₹145' },
  { img: `${IMG}mybookings-image.webp`, title: 'Bangalore → Goa', meta: 'Karnataka Express · 10h 25m', cls: 'Sleeper', price: '₹120' },
];

export function TravelTrains() {
  return (
    <>
      <TravelHero eyebrow="Travel Hub · 02" title="Trains" sub="Book your train tickets across India." bg={`${IMG}trains-image.webp`} />

      <div className="console rise d1" style={{ marginBottom: 52 }}>
        <Tabs tabs={['One way', 'Round trip', 'Flexi search', 'PNR status']} />
        <div className="fields">
          <Field label="From" value="NDLS — New Delhi" />
          <div className="f" style={{ flex: 0, display: 'flex', alignItems: 'center', padding: '16px 8px', color: 'var(--accent)' }}>⇄</div>
          <Field label="To" value="BCT — Mumbai Central" />
          <Field label="Depart date" value="Sun, 13 Jul 2026" />
          <Field label="Class" value="All Classes" />
          <Field label="Passengers" value="1 Passenger" />
          <div className="go"><Link className="btn btn-gold" to="/travel/results">Search trains</Link></div>
        </div>
        <div className="below">
          <label><input type="checkbox" /> Flexible with dates</label>
          <label><input type="checkbox" /> Trains with availability only</label>
          <Link to="/travel/results">PNR status lookup</Link>
        </div>
      </div>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Popular train routes</h2><Link className="more" to="/travel/results">View all →</Link></div>
        <div className="grid3">
          {ROUTES.map((r) => (
            <PCard key={r.title} to="/travel/results" img={r.img} title={r.title} heart meta={r.meta}
              price={<>{r.price} <small>{r.cls}</small></>} />
          ))}
        </div>
      </section>

      <TrustBar items={['Best fare guarantee — match or 110% back', '24/7 support', 'Secure booking', 'Easy cancellation', 'Loyalty rewards']} />
    </>
  );
}
