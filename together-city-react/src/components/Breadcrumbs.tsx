import { Link, useLocation, useNavigate } from 'react-router-dom';
import { crumbsFor } from '@/nav/registry';

/**
 * Consistent breadcrumb + back affordance shown across every hub (audit 3.3):
 * Home → Hub → Page, plus a one-click Back that respects real history. Keeps a
 * broad, deep IA feeling like one connected place instead of separate mini-apps.
 */
export function Breadcrumbs({ style }: { style?: React.CSSProperties }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const crumbs = crumbsFor(pathname);
  if (crumbs.length <= 1) return null; // nothing useful on the city home

  return (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 4px 2px', fontSize: 12.5, ...style }}>
      <button type="button" onClick={() => nav(-1)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--line)',
          borderRadius: 'var(--r-full)', padding: '3px 10px', cursor: 'pointer', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
        ← Back
      </button>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', color: 'var(--muted)' }}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {c.path && !last ? (
                <Link to={c.path} style={{ color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>{c.label}</Link>
              ) : (
                <span style={{ color: last ? 'var(--ink)' : 'var(--muted)', fontWeight: last ? 700 : 600 }}>{c.label}</span>
              )}
              {!last && <span aria-hidden style={{ opacity: 0.6 }}>›</span>}
            </span>
          );
        })}
      </span>
    </nav>
  );
}
