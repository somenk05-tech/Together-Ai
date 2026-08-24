import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { useListings, useEnquire, priceLabel, type PropertyCard } from '../api';
import { Masthead } from '../components/Masthead';

const KINDS = [
  { k: 'houses', l: 'Houses', types: ['apartment', 'villa', 'plot'] },
  { k: 'offices', l: 'Offices & shops', types: ['commercial'] },
] as const;
type Kind = (typeof KINDS)[number]['k'];

/**
 * THE ARC'S GEOMETRY, COMPUTED — never a hardcoded height per position.
 *
 * A table of seven heights is a shape that is correct at exactly seven
 * listings. This hub will have four next week and forty next year, and the
 * first version of this page had the table.
 */
const TALL = 246, DROP = 96, RATIO = 0.74;

/**
 * UNDER THREE, THERE IS NO ARC.
 *
 * An arc is a shape made of number. Three cards can imply a curve; one card on
 * a curve is a card sitting off-centre at two-thirds height for no reason, and
 * the scroller's edge fade is drawn across the only listing you have — the
 * page dimming the thing it exists to show. Below the threshold everything
 * stands at full height, the fade is switched off, and the scroll hint goes
 * with it. It is the curated match deck's rule, for the deck's reason: if
 * there are not many, keep the tab clean.
 */
const ARC_FANS_AT = 3;

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const counted = (n: number) => `${COUNT[n] ?? n} listing${n === 1 ? '' : 's'}`;

/** One card on the arc. Its own Connect, because a classified line is a price
 *  and the one thing you can do about it. */
function Lot({ p, geom }: { p: PropertyCard; geom: { w: number; h: number } }) {
  const navigate = useNavigate();
  const enquire = useEnquire();
  const [err, setErr] = useState('');
  const canConnect = !p.postedByYou && p.verified.listedBy === 'owner';

  const open = () => navigate(`/realestate/property/${p.id}`);
  const connect = (e: React.MouseEvent) => {
    e.stopPropagation();
    setErr('');
    enquire.mutate({ id: p.id }, {
      onSuccess: (r) => navigate(`/chats?c=${r.conversationId}`),
      onError: (ex) => setErr(
        (ex as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Couldn’t open the chat.'),
    });
  };

  return (
    <button type="button" className="elot" style={{ width: geom.w }} onClick={open}>
      <span className="ename">{p.title}{p.locality ? `, ${p.locality}` : ''}</span>
      {p.coverPhoto
        ? <img className="eshot" src={p.coverPhoto} alt="" style={{ width: geom.w, height: geom.h }} />
        : <span className="eshot" style={{ display: 'block', width: geom.w, height: geom.h }} />}
      <span className="eprice">{priceLabel(p.priceInr, p.listingType)}</span>
      {canConnect
        ? (
          <span role="button" tabIndex={0} className="ego" aria-disabled={enquire.isPending}
            onClick={connect}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); connect(e as unknown as React.MouseEvent); } }}>
            {enquire.isPending ? 'Opening…' : 'Connect →'}
          </span>
        )
        : <span className="ewhere">{p.city}</span>}
      {err && <span className="eerr">{err}</span>}
    </button>
  );
}

/** Explore — the hub's front door. A masthead, an empty middle, and one band
 *  of listings along the foot. */
export function Explore() {
  const [kind, setKind] = useState<Kind>('houses');
  const [q, setQ] = useState('');

  const listings = useListings({});
  const shown: PropertyCard[] = useMemo(() => {
    const types = KINDS.find((t) => t.k === kind)!.types as readonly string[];
    let all = (listings.data ?? []).filter((p) => types.includes(p.propertyType));
    const needle = q.trim().toLowerCase();
    if (needle) all = all.filter((p) => `${p.title} ${p.locality} ${p.city}`.toLowerCase().includes(needle));
    return all;
  }, [listings.data, kind, q]);

  const sparse = shown.length < ARC_FANS_AT;
  const mid = (shown.length - 1) / 2;
  const geometry = (i: number) => {
    if (sparse) return { w: Math.round(TALL * RATIO), h: TALL };
    const away = Math.abs(i - mid) / Math.max(mid, 1);   // 0 at the centre, 1 at an end
    const h = Math.round(TALL - DROP * away);
    return { w: Math.round(h * RATIO), h };
  };

  const city = shown[0]?.city;

  return (
    <div className="eplate">
      <Masthead mark={['Real', 'Estate']} registered title="Where life happens next"
        nav={[
          ...KINDS.map((t) => ({ label: t.l, onSelect: () => setKind(t.k), on: kind === t.k })),
          { label: 'Under construction', to: '/realestate/under-construction' },
          { label: 'List a property', to: '/realestate/sell' },
        ]}>
        Real listings from real owners — photo-verified before they go live, priced by
        the person who owns it.
        <span className="efind">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Search listings by locality, city or title"
            placeholder="Search a locality, a city, a listing…" />
          {q && <button type="button" onClick={() => setQ('')}>Clear</button>}
        </span>
      </Masthead>

      <div className="egap" />

      {listings.isLoading ? <Spinner label="Finding properties…" />
        : listings.isError ? <EmptyState title="Couldn’t load properties" hint="Please check your connection and try again." />
        : shown.length === 0 ? (
          <p className="eempty">
            {q.trim()
              ? `Nothing in ${KINDS.find((t) => t.k === kind)!.l.toLowerCase()} matches “${q.trim()}”.`
              : 'Nothing listed here yet — post the first property from List a property.'}
          </p>
        )
        : (
          <div className={`earc${sparse ? ' efew' : ''}`}>
            {shown.map((p, i) => <Lot key={p.id} p={p} geom={geometry(i)} />)}
          </div>
        )}

      <div className="efoot">
        <span>{counted(shown.length)}{city ? ` · ${city}` : ''}</span>
        {/* No scroll hint when there is nothing to scroll — a page that tells
            you to scroll past its only listing is lying about how much it has. */}
        {!sparse && <span>Scroll →</span>}
      </div>
    </div>
  );
}
