import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { inr, usePackages } from '../api';
import { Field, IMG, PCard, Tabs, TravelHero, TrustBar } from '../shared';

export function TravelPackages() {
  const pkgs = usePackages();
  const list = pkgs.data ?? [];

  return (
    <>
      <TravelHero eyebrow="Travel Hub · 04" title="Packages" sub="Curated travel experiences, all in one place." bg={`${IMG}packages-image.webp`} />

      <div className="console rise d1" id="console" style={{ marginBottom: 52 }}>
        <Tabs tabs={['All', 'International', 'Domestic', 'Honeymoon', 'Family', 'Group tours', 'Weekend getaways']} />
        <div className="fields">
          <Field label="Destination" placeholder="Where to?" />
          <Field label="Duration" placeholder="e.g. 5 nights" />
          <Field label="Travel dates" placeholder="Add dates" />
          <Field label="Travellers" value="2 Adults" />
          <Field label="Budget" placeholder="Per person" />
          <div className="go"><Link className="btn btn-gold" to="/travel/explore">Search packages</Link></div>
        </div>
      </div>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Popular packages</h2><Link className="more" to="/travel/explore">View all packages →</Link></div>
        {pkgs.isLoading ? <Spinner label="Loading packages…" />
          : pkgs.isError ? <EmptyState title="Couldn't load packages" hint="Start the backend and reload." />
          : list.length === 0 ? <EmptyState icon="🧳" title="No packages yet" hint="Check back soon." />
          : (
            <div className="grid3">
              {list.map((p) => (
                <PCard key={p.id} to={`/travel/package/${p.id}`} img={p.heroUrl} title={p.title} heart
                  meta={`${p.nights}N/${p.days}D · ${p.destination}, ${p.country}`}
                  price={<>From {inr(p.priceFromInr)} <small>pp</small></>} />
              ))}
            </div>
          )}
      </section>

      <section className="blk rise d3" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 40, textAlign: 'center' }}>
        <div className="eyebrow">Custom packages</div>
        <h2>Plan your trip your way</h2>
        <p className="lede center" style={{ margin: '10px auto 22px' }}>Tell us what you want and we'll create the perfect package for you.</p>
        <a className="btn btn-line" href="#console">Create my package</a>
      </section>

      <TrustBar items={['Best price guarantee', '24/7 support', 'Secure booking', 'Easy cancellation', 'Loyalty rewards']} />
    </>
  );
}
