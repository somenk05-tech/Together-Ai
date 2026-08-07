import { useMemo } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { decodeMeal } from '../shareMeal';

/* ------------------------------------------------------------------ *
 * SharedMeal — the full-page, read-only view of a shared meal card.
 * Opened when a recipient taps a shared meal (deep link carries the whole
 * meal). Displays the meal's photo, name, calories/macros and every dish;
 * each dish is a link to its detailed recipe page.
 * ------------------------------------------------------------------ */

/** Deterministic warm gradient for a dish with no photo. */
function tint(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 82%), hsl(${(h + 40) % 360} 60% 68%))`;
}

export function SharedMeal() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  // So a recipe opened from this card returns HERE (RecipeDetail's Back does
  // navigate(-1) when a `from` is supplied, else it goes to the recipe library).
  const from = location.pathname + location.search;
  const meal = useMemo(() => {
    const d = params.get('d');
    return d ? decodeMeal(d) : null;
  }, [params]);

  if (!meal) {
    return (
      <div className="page-note centred">
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>This shared meal couldn’t be opened</div>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>The link may be incomplete or out of date. Ask your friend to send it again.</p>
        <Link to="/nutrition/weekly" style={{ display: 'inline-block', marginTop: 14 }}><button className="btn btn-accent" type="button">Go to your meal plan</button></Link>
      </div>
    );
  }

  const dishes = meal.d ?? [];
  return (
    <div>
      <button type="button" onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 12 }}>← Back</button>

      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: meal.i ? 'var(--line)' : tint(meal.t) }}>
          {meal.i && <img src={meal.i} alt={meal.t} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          {meal.l && (
            <span style={{ position: 'absolute', top: 12, left: 12, background: 'var(--ink)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 8 }}>{meal.l}</span>
          )}
        </div>

        <div style={{ padding: '18px 20px 22px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent-ink)' }}>Shared meal</div>
          <h1 style={{ fontSize: 22, margin: '4px 0 0', lineHeight: 1.25, letterSpacing: '-.01em' }}>{meal.t}</h1>

          {(meal.k || (meal.m && meal.m.length > 0)) && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
              {meal.k ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 11px' }}>{Math.round(meal.k)} kcal</span> : null}
              {(meal.m ?? []).map((m, i) => (
                <span key={i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 11px' }}>{m}</span>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '18px 0 6px' }}>
            {dishes.length} {dishes.length === 1 ? 'dish' : 'dishes'} · tap any dish to see the full recipe
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {dishes.map(([name, recipeId, kcal], i) => {
              const clickable = !!recipeId;
              const inner = (
                <>
                  <span aria-hidden style={{ width: 40, height: 40, borderRadius: 10, background: tint(recipeId || name), flex: '0 0 auto' }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{name}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{Math.round(kcal)} kcal</span>
                  {clickable && <span aria-hidden style={{ color: 'var(--accent-ink)', fontSize: 16 }}>›</span>}
                </>
              );
              const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: i ? '1px solid var(--line)' : 'none', textAlign: 'left', width: '100%' };
              return clickable ? (
                <Link key={recipeId + i} to={`/nutrition/recipes/${recipeId}`} state={{ from }} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>{inner}</Link>
              ) : (
                <div key={name + i} style={rowStyle}>{inner}</div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
        Like this plate? <Link to="/nutrition/weekly" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Build your own meal plan →</Link>
      </p>
    </div>
  );
}
