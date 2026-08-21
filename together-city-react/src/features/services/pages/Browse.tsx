import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Chip, EmptyState, Spinner, Button } from '@/components/ui';
import { useAuthStore } from '@/store/auth.store';
import {
  serviceHref, useBrowseServices, useServiceCategories, useServiceFacets, useRegulars,
  currentPosition, type ServiceCard,
} from '../api';
import { BusinessCard } from '../components/BusinessCard';
import { SearchModule } from '../components/SearchModule';
import { CategoryRail } from '../components/CategoryRail';
import { NearbyMap } from '../components/NearbyMap';

/**
 * FIND SOMEONE YOU CAN TRUST.
 *
 * The page this replaces answered one question — WHO IS THERE — and answered it
 * with a name, a trade and a photograph. That is a directory. What somebody
 * standing in their kitchen with a leaking pipe is deciding is which stranger
 * to let into the house, and the four things that decision runs on were all
 * missing from the card: what has been checked about them, what other people
 * said, how far away they are, and how to write to them without handing over a
 * phone number.
 *
 * The other half of the old page's problem was arithmetic. Eighteen group chips
 * and fourteen healthcare chips were on screen before anybody had said the word
 * healthcare — thirty-two decisions offered to somebody who had made none. Two
 * levels now, and the second is earned.
 *
 * WHAT THIS PAGE WILL NOT DO IS DECORATE ITSELF. Every number on it is one the
 * server can show its working for. There is no Trust Score, because there is no
 * score behind a score; there are the checks that passed, counted. There are no
 * stars under three reviews, no price band invented from a starting price, and
 * no distance on a search that had no centre to measure from. A directory whose
 * furniture cannot be told from its facts is a directory nobody should trust,
 * which is the one thing this hub is for.
 */

/** Barely a greeting. The page belongs to the citizen, so it says their name
 *  once and then gets out of the way — anything more on a discovery screen
 *  reads as being watched rather than being known. */
function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function ServicesBrowse() {
  const [group, setGroup] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  // "Near me" is off until somebody asks for it. The permission prompt is the
  // cost of this feature and it is only worth paying when it was requested.
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [withinKm, setWithinKm] = useState(2);
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);

  const name = useAuthStore((s) => s.user?.name ?? '');
  const cats = useServiceCategories();
  const facets = useServiceFacets(city || undefined);
  const regulars = useRegulars();
  /* THE GROUP IS A FILTER, NOT A HEADING. Pressing "Automotive" and being
     shown a salon is the page not listening: the group chips are the first row
     on the screen and until this was sent they narrowed nothing at all. The
     leaf wins when both are set — the server applies the same precedence. */
  const list = useBrowseServices({
    category: category || undefined, group: category ? undefined : (group || undefined),
    city: city || undefined, area: area || undefined, q: q || undefined,
    ...(near ? { near: `${near.lat},${near.lng}`, withinKm } : {}),
  });

  const findMe = async () => {
    setLocBusy(true); setLocErr(null);
    try { const p = await currentPosition(); setNear({ lat: p.lat, lng: p.lng }); }
    catch (e) { setLocErr((e as Error).message); }
    finally { setLocBusy(false); }
  };

  const groups = cats.data?.groups ?? [];
  const counts = facets.data ?? {};
  const cityTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const items: ServiceCard[] = list.data?.items ?? [];
  const savedIds = new Set(list.data?.saved ?? []);
  const kept = regulars.data?.items ?? [];

  const popular = groups
    .map((g) => ({ group: g.group, count: g.items.reduce((s, c) => s + (counts[c.key] ?? 0), 0) }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const firstName = name.split(' ')[0];

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* ── the hero ─────────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div className="eyebrow">Local Services</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.12, margin: '4px 0 0', letterSpacing: '-0.02em' }}>
            Find someone you can trust.
          </h1>
          <p className="muted" style={{ fontSize: 15, margin: '10px 0 0', maxWidth: '54ch' }}>
            {firstName ? `${greeting(new Date().getHours())}, ${firstName}. ` : ''}
            Genuine businesses and people around you. Compare them, message them without giving your
            name, and decide with something behind the badge.
          </p>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <Link to="/services/list"><Button variant="accent">+ List your business</Button></Link>
        </div>
      </header>

      <SearchModule
        q={q} onQ={setQ} city={city} onCity={setCity} area={area} onArea={setArea}
        near={near} onFindMe={() => void findMe()} onClearNear={() => setNear(null)}
        withinKm={withinKm} onWithinKm={setWithinKm} locBusy={locBusy} locErr={locErr}
        popular={popular} onPopular={(g) => { setGroup(g); setCategory(''); }}
      />

      <CategoryRail
        groups={groups} counts={counts} group={group} category={category}
        onGroup={setGroup} onCategory={setCategory}
      />

      {/* ── your regulars ────────────────────────────────────────────────── */}
      {kept.length > 0 && (
        <section style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Your regulars</h2>
            <span className="muted" style={{ fontSize: 12.5 }}>Businesses you keep</span>
            <Link to="/services/regulars" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-ink)' }}>
              All {kept.length} →
            </Link>
          </div>
          <div className="swipe-row" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {kept.slice(0, 6).map((r) => (
              <Link key={r.id} to={serviceHref(r)} style={{ textDecoration: 'none', color: 'inherit', flex: '0 0 auto' }}>
                <Card lift style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, width: 250 }}>
                  {r.photos.length > 0 ? (
                    <img src={r.photos[0].url} alt="" loading="lazy"
                      style={{ width: 46, height: 46, borderRadius: 'var(--r-1)', objectFit: 'cover', flex: '0 0 auto' }} />
                  ) : (
                    <div aria-hidden style={{ width: 46, height: 46, borderRadius: 'var(--r-1)', background: 'var(--accent-soft)', flex: '0 0 auto' }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 13.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.businessName}
                    </strong>
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {r.closed ? 'Closed · your regular' : `Your regular · ${r.categoryLabel}`}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── the results ──────────────────────────────────────────────────── */}
      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>
            {near ? 'Businesses near you' : category || group ? 'What is listed' : 'Businesses in the city'}
          </h2>
          {!list.isLoading && (
            <span className="muted" style={{ fontSize: 13 }}>
              {list.data?.total ?? 0} {(list.data?.total ?? 0) === 1 ? 'business' : 'businesses'}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <Chip selected={view === 'list'} onClick={() => setView('list')}>List</Chip>
            <Chip selected={view === 'map'} onClick={() => setView('map')}>Map</Chip>
          </div>
        </div>

        {/* TOGETHER VERIFIED — a product feature stated once, at the top of the
            results, rather than a claim repeated on every card. It says what
            the badge means and, just as importantly, what it does not: this
            hub checks who somebody is, it does not vouch for their work. */}
        <Card style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 15px', background: 'var(--ok-soft)' }}>
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>🛡</span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 13.5 }}>Together Verified</strong>
            <p className="muted" style={{ fontSize: 12.5, margin: '3px 0 0', maxWidth: '78ch' }}>
              A badge here means Together City has checked something specific — the person&rsquo;s identity, the
              business&rsquo;s registration, the address — and each badge says which. It is not a recommendation, and
              nobody buys one. Messaging stays inside Together City: you never have to give a business your number.
            </p>
          </div>
        </Card>

        {list.isLoading ? <Spinner label="Looking…" />
          : list.isError ? <EmptyState title="Couldn't load the directory" hint="Nothing is lost — try again in a moment." />
          : items.length === 0 ? (
            <EmptyState
              title={cityTotal === 0 ? 'Nobody has listed a business yet' : 'Nothing in this corner yet'}
              hint={cityTotal === 0
                ? 'This directory fills up from the people who live here. If you run something — a trade, a class, a kitchen — you can be the first.'
                : 'Try another category, widen the area, or clear the search.'}
            />
          ) : view === 'map' ? (
            <NearbyMap items={items} centre={near} withinKm={withinKm} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: 16 }}>
              {items.map((s) => (
                <BusinessCard key={s.id} s={s} saved={savedIds.has(s.id)} />
              ))}
            </div>
          )}
      </section>

      {/* ── the other side of the market, and it stays the quieter one ───── */}
      <Card style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '16px 18px' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <strong style={{ fontSize: 15 }}>Own a business?</strong>
          <p className="muted" style={{ fontSize: 12.5, margin: '3px 0 0' }}>
            Get discovered by people nearby. Listing is free, and verification is what makes people write to you.
          </p>
        </div>
        <Link to="/services/list"><Button variant="line" size="sm">List your business →</Button></Link>
      </Card>
    </div>
  );
}
