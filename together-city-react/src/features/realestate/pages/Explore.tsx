import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Hero, Pill, Spinner, Tag } from '@/components/ui';
import { useListings, type PropertyCard } from '../api';
import { PropertyCardView } from '../components/PropertyCardView';

const KINDS = [
  { k: 'houses', l: 'Houses' },
  { k: 'offices', l: 'Offices' },
  { k: 'shops', l: 'Shops' },
] as const;
type Kind = (typeof KINDS)[number]['k'];

const AGE = [
  { k: 'new', l: 'New Properties' },
  { k: 'used', l: 'Used Properties' },
] as const;

const AREAS = ['Koregaon Park', 'Kalyani Nagar', 'Viman Nagar', 'Baner', 'Wakad', 'Hinjewadi', 'Aundh', 'Wagholi'];
const DATES = ['Sat, 18 Jul 2026', 'Sun, 19 Jul 2026', 'Mon, 20 Jul 2026'];
const SLOTS = ['11:00 AM', '01:30 PM', '04:00 PM', '06:30 PM'];

/** Explore — discovery view: type tabs, locality search console, live grid, and a viewing booking flow. */
export function Explore() {
  const [kind, setKind] = useState<Kind>('houses');
  const [age, setAge] = useState<'new' | 'used'>('new');
  const [area, setArea] = useState('Koregaon Park');
  const [date, setDate] = useState(DATES[0]);
  const [slot, setSlot] = useState(SLOTS[0]);
  const [confirmed, setConfirmed] = useState(false);

  const listings = useListings({});
  const grid: PropertyCard[] = useMemo(() => {
    const all = listings.data ?? [];
    if (kind === 'houses') return all.filter((p) => p.propertyType === 'apartment' || p.propertyType === 'villa' || p.propertyType === 'plot');
    return all.filter((p) => p.propertyType === 'commercial');
  }, [listings.data, kind]);
  const featured = grid[0];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px 40px' }}>
      <Hero image="/assets/img/realestate-explore-hero.webp" objectPosition="center 55%"
        eyebrow="Real Estate · 01" title="Explore Properties That Fit Your Life"
        sub="Houses, offices and shops — verified, priced clearly, ready to view." />

      {/* property-type tabs */}
      <div className="tabrow" style={{ marginBottom: 10 }}>
        {KINDS.map((t) => (
          <a key={t.k} href="#re-grid" className={kind === t.k ? 'on' : undefined}
            onClick={(e) => { e.preventDefault(); setKind(t.k); }}>{t.l}</a>
        ))}
      </div>
      <div className="tabrow" style={{ marginBottom: 26 }}>
        {AGE.map((t) => (
          <a key={t.k} href="#re-grid" className={age === t.k ? 'on' : undefined}
            onClick={(e) => { e.preventDefault(); setAge(t.k); }}>{t.l}</a>
        ))}
      </div>

      {/* search console */}
      <div className="console" style={{ marginBottom: 40 }}>
        <div className="fields">
          <div className="f"><label>Locality / Society / Landmark</label><input defaultValue={area} readOnly /></div>
          <div className="f"><label>Area</label><input defaultValue="All Areas" readOnly /></div>
          <div className="f"><label>Price Range</label><input defaultValue="₹50L – ₹3.5Cr" readOnly /></div>
          <div className="go"><a className="btn btn-gold" href="#re-grid">Filters</a></div>
        </div>
        <div className="below">
          <span>Popular Areas:</span>
          <div className="pill-row">
            {AREAS.map((a) => <Pill key={a} active={area === a} onClick={() => setArea(a)}>{a}</Pill>)}
          </div>
        </div>
      </div>

      {/* property grid */}
      <section className="blk" id="re-grid">
        <div className="blk-head">
          <h2>{KINDS.find((k) => k.k === kind)?.l} in {area} &amp; nearby</h2>
          <span className="muted" style={{ fontSize: 12 }}>{grid.length} of 128 results</span>
        </div>
        {listings.isLoading ? <Spinner label="Finding properties…" />
          : listings.isError ? <EmptyState title="Couldn't load properties" hint="Start the backend and reload." />
          : grid.length === 0 ? <EmptyState icon="🏠" title="No matching properties" hint="Try another property type or area." />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {grid.map((p) => <PropertyCardView key={p.id} p={p} />)}
            </div>
          )}
      </section>

      {/* viewing request */}
      <section className="blk" id="re-viewing">
        <div className="blk-head">
          <h2>Book a Viewing</h2>
          <span className="muted" style={{ fontSize: 12 }}>{featured ? `${featured.title} · ${featured.locality}` : 'Pick a slot that suits you'}</span>
        </div>
        <div className="card card-lg">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '0 0 16px' }}>
            {DATES.map((d) => (
              <button key={d} type="button" onClick={() => { setDate(d); setConfirmed(false); }}
                style={chip(date === d)}>📅 {d}</button>
            ))}
          </div>
          <b style={{ fontSize: 12.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Available slots</b>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
            {SLOTS.map((s) => (
              <button key={s} type="button" onClick={() => { setSlot(s); setConfirmed(false); }}
                style={chip(slot === s)}>{s}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0' }}>
            <div className="av">RM</div>
            <div>
              <b style={{ display: 'block', fontSize: 14 }}>Riya Mehta</b>
              <span className="muted" style={{ fontSize: 12.5 }}>Your assigned viewing agent · Verified</span>
            </div>
          </div>
          <Button variant="gold" onClick={() => setConfirmed(true)}>Confirm Viewing</Button>
        </div>
        {confirmed && (
          <div className="note" style={{ marginTop: 20 }}>
            ✓ Viewing confirmed for <b>{date}, {slot}</b> with Riya Mehta.
            {' '}<Link to="/realestate/under-construction" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>Under-construction projects →</Link>
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        <Tag tone="green">✓ Verified Properties</Tag>
        <Tag tone="green">✓ Best Price Guarantee</Tag>
        <Tag>✓ Expert Support</Tag>
        <Tag>✓ Safe &amp; Secure</Tag>
      </div>
    </div>
  );
}

function chip(on: boolean): React.CSSProperties {
  return {
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 999, padding: '9px 16px',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent',
    color: on ? '#fff' : 'var(--ink-soft)',
  };
}
