import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useUnderConstruction, priceLabel, bhkLabel, type PropertyDetail } from '../api';

function ProjectCard({ p }: { p: PropertyDetail }) {
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
        <Link to={`/realestate/property/${p.id}`} style={{ width: 220, flexShrink: 0, position: 'relative' }}>
          <div style={{ aspectRatio: '4 / 3', background: 'var(--line)' }}>
            {p.coverPhoto && <img src={p.coverPhoto} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#fff', background: '#e65100', borderRadius: 999, padding: '3px 9px' }}>Under construction</span>
        </Link>
        <div style={{ flex: 1, minWidth: 240, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 16 }}>{p.projectName ?? p.title}</strong>
            {p.postedByYou && <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 999, padding: '1px 6px' }}>Yours</span>}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {p.developer ? `${p.developer} · ` : ''}{bhkLabel(p)} · {p.areaSqft.toLocaleString('en-IN')} sqft · {p.locality}, {p.city}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
            <div><span className="muted">Price </span><strong>{priceLabel(p.priceInr, p.listingType)}</strong></div>
            <div><span className="muted">Possession </span><strong>{p.possessionDate}</strong></div>
            {p.reraId && <div><span className="muted">RERA </span><strong style={{ fontSize: 11.5 }}>{p.reraId}</strong></div>}
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
              <span className="muted">Construction progress</span><strong>{p.progressPct}%</strong>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${p.progressPct}%`, background: '#e65100' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="muted" style={{ fontSize: 11.5 }}>📐 {p.floorPlans.length} floor plan{p.floorPlans.length === 1 ? '' : 's'}</span>
            <span className="muted" style={{ fontSize: 11.5 }}>· 🧱 {p.milestones.length} milestones</span>
          </div>
          <div style={{ marginTop: 10 }}><Link to={`/realestate/property/${p.id}`}><Button variant="accent" size="sm">View plans & milestones →</Button></Link></div>
        </div>
      </div>
    </article>
  );
}

/** Under Construction — its own tab: projects with progress, RERA, plans and milestones. */
export function UnderConstruction() {
  const q = useUnderConstruction();
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div className="eyebrow">Real Estate · Under Construction</div>
          <h1 style={{ fontSize: 26, margin: 0 }}>New & under-construction projects</h1>
        </div>
        <Link to="/realestate" style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">← Ready homes</Button></Link>
      </div>
      <p className="muted" style={{ fontSize: 13.5, margin: '8px 0 16px' }}>
        Pre-launch and in-progress homes — each with RERA registration, a live build-progress tracker, floor plans and a payment/construction milestone schedule.
      </p>

      {q.isLoading ? <Spinner label="Loading projects…" />
        : q.isError ? <EmptyState title="Couldn't load projects" hint="Start the backend and reload." />
        : (q.data ?? []).length === 0 ? <EmptyState icon="🏗" title="No under-construction projects yet" hint="Post one from “Post a property”." />
        : q.data?.map((p) => <ProjectCard key={p.id} p={p} />)}
    </div>
  );
}
