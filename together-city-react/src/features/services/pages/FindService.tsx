import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Chip } from '@/components/ui';
import { useServiceCategories, useServiceFacets } from '../api';

/**
 * ONE LINE, IN YOUR OWN WORDS.
 *
 * The hub used to open on the directory: eighteen group chips, a city box, an
 * area box and a map toggle — a filing cabinet handed to somebody who arrived
 * holding a leaking pipe. That screen is not wrong, it is just second. It is
 * "All listed services" now, and this is what 01 looks like: the city's own
 * room, its name written once, and a single field that takes a sentence.
 *
 * THE FIELD DOES NOT PRETEND TO UNDERSTAND. It hands the words to the same
 * search the directory runs — name-and-trade — so "AC repair in Bandra today"
 * finds the AC people and quietly ignores the urgency. When intent parsing
 * lands it slots in behind this input and nobody has to learn a new way to ask.
 * Until then the honest shape is one box that answers, not a wizard that
 * promises.
 *
 * NOTHING IS INVENTED ON THIS SCREEN. The suggested trades below the room are
 * the groups the server says actually have businesses listed today, biggest
 * first. On the day this hub is empty there are no chips at all, which is the
 * truth an empty marketplace should tell.
 */
export function FindService() {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const cats = useServiceCategories();
  const counts = useServiceFacets();

  const groups = cats.data?.groups ?? [];
  const facets = counts.data ?? {};
  const popular = groups
    .map((g) => ({ group: g.group, count: g.items.reduce((s, c) => s + (facets[c.key] ?? 0), 0) }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const go = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    nav(term ? `/services/browse?q=${encodeURIComponent(term)}` : '/services/browse');
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ── the room ─────────────────────────────────────────────────────── */}
      <section
        aria-label="Search local services"
        style={{
          position: 'relative',
          borderRadius: 'var(--r-4)',
          overflow: 'hidden',
          boxShadow: 'var(--e2)',
          backgroundColor: 'var(--well)',
          backgroundImage: 'url(/assets/img/services-find-room.webp)',
          backgroundSize: 'cover',
          /* 40%, NOT CENTRE. On a phone the panel is close to square and
             `cover` zooms hard; centred, the crop lands on the podium and the
             wordmark sits on a reflection. 40% keeps the flat back wall behind
             the words at every width the city is read at. */
          backgroundPosition: '50% 40%',
          minHeight: 300,
          display: 'grid',
          alignContent: 'center',
          justifyItems: 'center',
          gap: 'clamp(18px, 3.4vw, 34px)',
          padding: 'clamp(34px, 6vw, 62px) clamp(18px, 5vw, 56px)',
        }}
      >
        {/* The city signs the room once. Same drawing as the masthead — one
            wordmark in one file, never a second copy that drifts. */}
        <img
          src="/assets/img/tc-word.svg"
          alt="Together City"
          width={1056}
          height={414}
          style={{ width: 'clamp(190px, 27vw, 330px)', height: 'auto', display: 'block' }}
        />

        <form
          onSubmit={go}
          role="search"
          style={{
            width: '100%',
            maxWidth: 720,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-full)',
            boxShadow: 'var(--e2)',
            padding: '7px 8px 7px 18px',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden
            style={{ flex: '0 0 auto', color: 'var(--muted)' }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="What are you looking for"
            placeholder="What are you looking for… today"
            style={{
              flex: '1 1 auto', minWidth: 0, minHeight: 44,
              border: 0, outline: 'none', background: 'transparent',
              font: 'inherit', fontSize: 'clamp(15px, 1.5vw, 18px)', color: 'var(--ink)',
            }}
          />
          <button
            type="submit"
            aria-label="Search"
            style={{
              flex: '0 0 auto', width: 44, height: 44, borderRadius: 'var(--r-full)',
              border: '1px solid var(--line)', background: 'var(--face)', color: 'var(--ink)',
              cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </section>

      {/* ── what is actually listed, and the whole list ───────────────────── */}
      <section style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Or start from a trade</h2>
          <Link to="/services/browse"
            style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-ink)' }}>
            All listed services →
          </Link>
        </div>
        {popular.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {popular.map((p) => (
              <Chip key={p.group} onClick={() => nav(`/services/browse?group=${encodeURIComponent(p.group)}`)}>
                {p.group} · {p.count}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Nobody has listed a business yet. <Link to="/services/list" style={{ fontWeight: 700, color: 'var(--accent-ink)' }}>Be the first →</Link>
          </p>
        )}
      </section>
    </div>
  );
}
