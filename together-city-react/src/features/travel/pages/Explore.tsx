import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useCategories, usePackages, inr, type PackageCard } from '../api';

function Card({ p }: { p: PackageCard }) {
  return (
    <Link to={`/travel/package/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 10', background: 'var(--line)' }}>
          <img src={p.heroUrl} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: 999, padding: '3px 10px' }}>{p.icon} {p.categoryLabel}</span>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{p.title}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{p.destination}, {p.country} · {p.nights}N / {p.days}D</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>{p.summary}</p>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>from {inr(p.priceFromInr)} <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>/ person</span></div>
        </div>
      </article>
    </Link>
  );
}

/** Explore — curated trip packages. Flights (metasearch) live in their own tab. */
export function Explore() {
  const cats = useCategories();
  const [cat, setCat] = useState('');
  const pkgs = usePackages(cat || undefined);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Travel · Explore</div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Where to next?</h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to="/travel/flights"><Button variant="line" size="sm">✈️ Search flights</Button></Link>
          <Link to="/travel/trips"><Button variant="accent" size="sm">🧳 My trips</Button></Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        <button type="button" onClick={() => setCat('')} style={chip(cat === '')}>All</button>
        {(cats.data ?? []).map((c) => <button key={c.key} type="button" onClick={() => setCat(c.key)} style={chip(cat === c.key)}>{c.icon} {c.label}</button>)}
      </div>

      {pkgs.isLoading ? <Spinner label="Finding trips…" />
        : pkgs.isError ? <EmptyState title="Couldn't load trips" hint="Start the backend and reload." />
        : (pkgs.data ?? []).length === 0 ? <EmptyState icon="🧳" title="Nothing in that category" hint="Try another." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {pkgs.data?.map((p) => <Card key={p.id} p={p} />)}
          </div>
        )}
    </div>
  );
}

function chip(on: boolean): React.CSSProperties {
  return { cursor: 'pointer', borderRadius: 999, padding: '7px 15px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)' };
}
