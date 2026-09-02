import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * ONE FIELD, AND NOTHING ELSE ON THE SCREEN.
 *
 * The hub used to open on its own directory: eighteen group chips, a city box,
 * an area box and a map toggle — the right screen for browsing and the wrong
 * one for arriving. That screen is "All listed services" now, at 02, and this
 * is 01: a search bar on white.
 *
 * EVERYTHING THAT WAS HERE AND ISN'T. A photograph of a room, the wordmark,
 * and a rail of suggested trades under it — three things competing with the
 * one thing the screen is for (owner, 2 Sep). A door does not need decorating
 * to be a door, and a suggestion offered before the question is asked is the
 * page guessing out loud.
 *
 * THE FIELD DOES NOT PRETEND TO UNDERSTAND. It hands the words to the same
 * search the directory runs — name-and-trade — so "AC repair in Bandra today"
 * finds the AC people and quietly ignores the urgency. When intent parsing
 * lands it slots in behind this exact input and nobody has to learn a new way
 * to ask. An empty submit is not an error: it opens the full list, which is
 * the honest answer to "show me everything".
 */
export function FindService() {
  const [q, setQ] = useState('');
  const nav = useNavigate();

  const go = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    nav(term ? `/services/browse?q=${encodeURIComponent(term)}` : '/services/browse');
  };

  return (
    <section
      aria-label="Search local services"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-4)',
        display: 'grid',
        placeItems: 'center',
        minHeight: 300,
        padding: 'clamp(40px, 8vw, 96px) clamp(16px, 5vw, 56px)',
      }}
    >
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
  );
}
