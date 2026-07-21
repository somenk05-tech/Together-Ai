import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useCategories, useEvents, inr, eventDate, type EventCard } from '../api';

function Card({ e }: { e: EventCard }) {
  return (
    <Link to={`/entertainment/event/${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ position: 'relative', aspectRatio: '3 / 4', background: 'var(--line)' }}>
          <img src={e.posterUrl} alt={e.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 999, padding: '3px 10px' }}>{e.icon} {e.categoryLabel}</span>
        </div>
        <div style={{ padding: '11px 13px' }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>{e.title}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{eventDate(e.date)} · {e.time}</div>
          <div className="muted" style={{ fontSize: 12 }}>{e.venue}, {e.city}</div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 6 }}>from {inr(e.priceFromInr)}</div>
        </div>
      </article>
    </Link>
  );
}

/** Discover — what's on across movies, concerts, comedy, theatre, sports & experiences. */
export function Discover() {
  const cats = useCategories();
  const [cat, setCat] = useState('');
  const events = useEvents({ category: cat || undefined });

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Entertainment · Discover</div>
          <h1 style={{ fontSize: 26, margin: 0 }}>What’s on in your city</h1>
        </div>
        <Link to="/entertainment/tickets" style={{ marginLeft: 'auto' }}><Button variant="accent" size="sm">🎟 My tickets</Button></Link>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        <button type="button" onClick={() => setCat('')}
          style={{ cursor: 'pointer', borderRadius: 999, padding: '7px 15px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${cat === '' ? 'var(--accent)' : 'var(--line)'}`, background: cat === '' ? 'var(--accent)' : 'transparent', color: cat === '' ? '#fff' : 'var(--ink-soft)' }}>All</button>
        {(cats.data ?? []).map((c) => (
          <button key={c.key} type="button" onClick={() => setCat(c.key)}
            style={{ cursor: 'pointer', borderRadius: 999, padding: '7px 15px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${cat === c.key ? 'var(--accent)' : 'var(--line)'}`, background: cat === c.key ? 'var(--accent)' : 'transparent', color: cat === c.key ? '#fff' : 'var(--ink-soft)' }}>{c.icon} {c.label}</button>
        ))}
      </div>

      {events.isLoading ? <Spinner label="Loading events…" />
        : events.isError ? <EmptyState title="Couldn't load events" hint="Please check your connection and try again." />
        : (events.data ?? []).length === 0 ? <EmptyState icon="🎭" title="Nothing in that category yet" hint="Try another category." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {events.data?.map((e) => <Card key={e.id} e={e} />)}
          </div>
        )}
    </div>
  );
}
