import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { useUnderConstruction, priceLabel, bhkLabel, type PropertyDetail } from '../api';
import { Masthead } from '../components/Masthead';

/**
 * NOT THE ARC, AND ON PURPOSE.
 *
 * Explore is browsing: you are looking at photographs and one of them stops
 * you. This page is not that. A person on it is COMPARING — this project is
 * 40% built and hands over in 2027, that one is 80% and hands over next
 * spring — and comparison is reading, which wants rows that line up, not
 * cards on a curve at four different heights.
 *
 * So it takes the other half of the reference: the masthead, the small tracked
 * label scale, and everything set as a ruled index. What it does NOT take is
 * the arc, because copying the gesture onto a page that needs a table would be
 * mistaking the reference's look for its argument.
 *
 * PROGRESS IS A HAIRLINE. It was a 8px amber bar on every row, and on an index
 * of twelve projects twelve fat amber bars are the loudest thing on the page —
 * while the thing you actually compare is the number beside them.
 */
function Project({ p, n }: { p: PropertyDetail; n: number }) {
  const to = `/realestate/property/${p.id}`;
  return (
    <li className="erow">
      <span className="eno">{String(n).padStart(2, '0')}</span>
      <Link to={to} aria-label={p.projectName ?? p.title}>
        {p.coverPhoto
          ? <img className="ethumb" src={p.coverPhoto} alt="" />
          : <span className="ethumb" style={{ display: 'block' }} />}
      </Link>
      <div>
        <h3 className="etitle">
          <Link to={to} style={{ color: 'inherit', textDecoration: 'none' }}>{p.projectName ?? p.title}</Link>
          {p.postedByYou && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · yours</span>}
        </h3>
        <p className="esub">
          {p.developer ? `${p.developer} · ` : ''}{bhkLabel(p)} · {p.areaSqft.toLocaleString('en-IN')} sqft · {p.locality}, {p.city}
          {p.reraId ? ` · RERA ${p.reraId}` : ''}
        </p>
        <p className="esub">
          {p.floorPlans.length} floor plan{p.floorPlans.length === 1 ? '' : 's'} ·{' '}
          {p.milestones.length} milestone{p.milestones.length === 1 ? '' : 's'} ·{' '}
          <Link to={to} style={{ fontWeight: 700 }}>Plans &amp; milestones →</Link>
        </p>
      </div>
      <div className="eside">
        <strong>{priceLabel(p.priceInr, p.listingType)}</strong>
        <span className="muted">Possession {p.possessionDate ?? '—'}</span>
        <div className="ehair"><i style={{ width: `${p.progressPct ?? 0}%` }} /></div>
        <span className="muted" style={{ fontSize: 11 }}>{p.progressPct ?? 0}% built</span>
      </div>
    </li>
  );
}

/** Under Construction — projects with progress, RERA, plans and milestones. */
export function UnderConstruction() {
  const q = useUnderConstruction();
  const items = q.data ?? [];
  return (
    <div>
      <Masthead mark={['Under', 'Construction']} title="Homes that do not exist yet"
        nav={[
          { label: 'Ready homes', to: '/realestate/explore' },
          { label: 'List a property', to: '/realestate/sell' },
          { label: 'My listings', to: '/realestate/mine' },
        ]}>
        Pre-launch and in-progress projects — RERA registration, build progress,
        floor plans, milestones.
      </Masthead>

      <div style={{ marginTop: 28 }}>
        {q.isLoading ? <Spinner label="Loading projects…" />
          : q.isError ? <EmptyState title="Couldn’t load projects" hint="Please check your connection and try again." />
          : items.length === 0 ? <p className="eempty">No under-construction projects yet. Post one from List a property.</p>
          : <ol className="eindex">{items.map((p, i) => <Project key={p.id} p={p} n={i + 1} />)}</ol>}
      </div>

      {items.length > 0 && (
        <div className="efoot">
          <span>{items.length} project{items.length === 1 ? '' : 's'} tracking</span>
          <span>RERA-registered</span>
        </div>
      )}
    </div>
  );
}
