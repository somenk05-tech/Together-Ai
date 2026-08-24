import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { inr, usePackages } from '../api';
import { IMG, PCard, TravelHero, TrustBar } from '../shared';

export function TravelPackages() {
  const pkgs = usePackages();
  const list = pkgs.data ?? [];

  return (
    <>
      <TravelHero eyebrow="Travel Hub · 04" title="Packages" sub="Trips worth packing for." bg={`${IMG}packages-image.webp`} />

      <section className="blk rise d2">
        <div className="blk-head"><h2>Popular packages</h2><Link className="more" to="/travel/explore">View all packages →</Link></div>
        {pkgs.isLoading ? <Spinner label="Loading packages…" />
          : pkgs.isError ? <EmptyState title="Couldn't load packages" hint="This didn’t reach us. Try again in a moment." />
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

      <TrustBar items={['Secure booking', 'Paid from your city wallet', 'Every booking kept here']} />
    </>
  );
}
