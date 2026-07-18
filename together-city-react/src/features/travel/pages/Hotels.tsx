import { Link } from 'react-router-dom';
import { Field, IMG, PCard, Tabs, TravelHero, TrustBar } from '../shared';

const STAYS = [
  { img: `${IMG}hotel-imahe.webp`, title: 'Address Downtown', meta: '★ 4.8 (1,245 reviews) · Downtown Dubai', price: '₹1,250' },
  { img: `${IMG}hotels.webp`, title: 'Atlantis The Palm', meta: '★ 4.7 · Palm Jumeirah', price: '₹1,950' },
  { img: `${IMG}packages-image.webp`, title: 'Jumeirah Beach Hotel', meta: '★ 4.6 · Jumeirah Beach', price: '₹1,100' },
  { img: `${IMG}mybookings-image.webp`, title: 'Armani Hotel', meta: '★ 4.9 · Burj Khalifa', price: '₹2,250' },
  { img: `${IMG}travel-guide-images.webp`, title: 'Rixos Premium', meta: '★ 4.5 · JBR', price: '₹950' },
  { img: `${IMG}flight-image.webp`, title: 'The Ritz-Carlton', meta: '★ 4.8 · Dubai International Financial Centre', price: '₹1,650' },
];

export function TravelHotels() {
  return (
    <>
      <TravelHero eyebrow="Travel Hub · 03" title="Hotels" sub="Find and book the perfect stay." bg={`${IMG}hotel-imahe.webp`} />

      <div className="console rise d1" style={{ marginBottom: 20 }}>
        <Tabs tabs={['All hotels', 'Hotel apartments', 'Villas', 'Resorts', 'Homestays']} />
        <div className="fields">
          <Field label="Destination" value="Dubai, UAE" />
          <Field label="Check-in" value="Sun, 13 Jul 2026" />
          <Field label="Check-out" value="Tue, 15 Jul 2026" />
          <Field label="Rooms & guests" value="1 Room, 2 Adults" />
          <div className="go"><Link className="btn btn-gold" to="/travel/results">Search hotels</Link></div>
        </div>
        <div className="below">
          <label>◈ Best price guarantee</label>
          <label>◈ Free cancellation</label>
          <label>◈ Pay at hotel</label>
          <label>◈ Secure booking</label>
        </div>
      </div>

      <section className="blk rise d2" style={{ marginTop: 36 }}>
        <div className="blk-head"><h2>Popular stays in Dubai</h2><Link className="more" to="/travel/results">View all →</Link></div>
        <div className="grid3">
          {STAYS.map((s) => (
            <PCard key={s.title} to="/travel/detail" img={s.img} title={s.title} heart meta={s.meta}
              price={<>{s.price} <small>/ night</small></>} />
          ))}
        </div>
      </section>

      <TrustBar items={['Best price guarantee', '24/7 support', 'Secure booking', 'Easy cancellation', 'Loyalty rewards']} />
    </>
  );
}
