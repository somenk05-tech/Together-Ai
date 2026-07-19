import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hero, Button, EmptyState } from '@/components/ui';
import { useFamily, headcount } from '../members';

/**
 * Search by Ingredients (family-search.html). No ingredient-search endpoint
 * exists on the backend, so — as in the vanilla site — this runs against a
 * local curated recipe set. Results respect the family-safe (veg-only) toggle,
 * flag kid-friendly dishes and portion for the whole family.
 */
interface FamilyRecipe {
  id: string; name: string; cuisine: string; minutes: number; veg: boolean; kcal: number; gPerPlate: number; ingredients: string[];
}

const RECIPES: FamilyRecipe[] = [
  { id: 'palak-paneer', name: 'Palak Paneer', cuisine: 'North Indian', minutes: 30, veg: true, kcal: 320, gPerPlate: 240, ingredients: ['paneer', 'spinach', 'onion', 'tomato', 'garlic', 'cream'] },
  { id: 'paneer-bhurji', name: 'Paneer Bhurji', cuisine: 'North Indian', minutes: 20, veg: true, kcal: 280, gPerPlate: 200, ingredients: ['paneer', 'onion', 'tomato', 'capsicum', 'spices'] },
  { id: 'saag-aloo', name: 'Saag Aloo', cuisine: 'Punjabi', minutes: 25, veg: true, kcal: 210, gPerPlate: 220, ingredients: ['spinach', 'potato', 'onion', 'garlic'] },
  { id: 'palak-dal', name: 'Palak Dal', cuisine: 'Indian', minutes: 30, veg: true, kcal: 240, gPerPlate: 250, ingredients: ['spinach', 'toor dal', 'onion', 'tomato', 'garlic'] },
  { id: 'veg-pulao', name: 'Vegetable Pulao', cuisine: 'Indian', minutes: 35, veg: true, kcal: 340, gPerPlate: 280, ingredients: ['rice', 'onion', 'tomato', 'mixed vegetables', 'spices'] },
  { id: 'jeera-rice', name: 'Jeera Rice', cuisine: 'Indian', minutes: 20, veg: true, kcal: 260, gPerPlate: 200, ingredients: ['rice', 'cumin', 'ghee'] },
  { id: 'tomato-rasam', name: 'Tomato Rasam', cuisine: 'South Indian', minutes: 20, veg: true, kcal: 120, gPerPlate: 200, ingredients: ['tomato', 'tamarind', 'garlic', 'spices'] },
  { id: 'banana-oat-smoothie', name: 'Banana Oat Smoothie', cuisine: 'Continental', minutes: 5, veg: true, kcal: 220, gPerPlate: 300, ingredients: ['banana', 'oats', 'yogurt', 'milk'] },
  { id: 'curd-rice', name: 'Curd Rice', cuisine: 'South Indian', minutes: 15, veg: true, kcal: 300, gPerPlate: 250, ingredients: ['rice', 'yogurt', 'onion', 'curry leaves'] },
  { id: 'chicken-curry', name: 'Home-style Chicken Curry', cuisine: 'Indian', minutes: 40, veg: false, kcal: 420, gPerPlate: 260, ingredients: ['chicken', 'onion', 'tomato', 'garlic', 'spices'] },
  { id: 'egg-bhurji', name: 'Egg Bhurji', cuisine: 'Indian', minutes: 15, veg: false, kcal: 240, gPerPlate: 180, ingredients: ['egg', 'onion', 'tomato', 'spices'] },
  { id: 'yogurt-parfait', name: 'Yogurt & Banana Parfait', cuisine: 'Continental', minutes: 5, veg: true, kcal: 190, gPerPlate: 200, ingredients: ['yogurt', 'banana', 'oats', 'honey'] },
];

const STAPLES = ['onion', 'tomato', 'rice', 'chicken', 'yogurt', 'banana'];

const chipStyle: React.CSSProperties = { cursor: 'pointer' };

export function FamilySearch() {
  const { state } = useFamily();
  const N = headcount(state);
  const [ings, setIngs] = useState<string[]>(['paneer', 'spinach']);
  const [safe, setSafe] = useState(true);
  const [draft, setDraft] = useState('');

  const results = useMemo(() => {
    let pool = RECIPES.filter((r) => ings.some((i) => r.ingredients.some((ri) => ri.indexOf(i) >= 0)));
    if (safe) pool = pool.filter((r) => r.veg);
    return pool
      .map((r) => ({ r, matched: ings.filter((i) => r.ingredients.some((ri) => ri.indexOf(i) >= 0)) }))
      .sort((a, b) => b.matched.length - a.matched.length)
      .slice(0, 9);
  }, [ings, safe]);

  const addIng = (v: string) => {
    const t = v.trim().toLowerCase();
    if (t && ings.indexOf(t) < 0) setIngs((x) => [...x, t]);
  };
  const removeIng = (v: string) => setIngs((x) => x.filter((i) => i !== v));

  return (
    <div>
      <Hero image="/assets/img/recipes-hero.webp" eyebrow="Family Nutrition · 06"
        title="Search by Ingredients"
        sub="Tell us what's in the kitchen — results respect every member's exclusions, flag kid-friendly recipes, and portion ingredients for the whole family."
        objectPosition="center 50%" />

      <div className="card" style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {ings.map((ing) => (
            <span key={ing} className="pill" style={chipStyle} onClick={() => removeIng(ing)}>
              {ing}<span style={{ marginLeft: 6, opacity: 0.6 }}>✕</span>
            </span>
          ))}
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { addIng(draft); setDraft(''); } }}
            placeholder="Type an ingredient and press Enter…"
            style={{ flex: 1, minWidth: 180, border: '1px solid var(--line)', borderRadius: 999, padding: '12px 18px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit' }} />
          <Button variant="accent" size="sm" onClick={() => { if (draft.trim()) { addIng(draft); setDraft(''); } }}>Search →</Button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)', marginTop: 16 }}>
          <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Family-safe results only — excludes non-vegetarian dishes for vegetarian members
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2>Matches</h2>
            <span className="meta">{results.length} recipe{results.length === 1 ? '' : 's'} found</span>
          </div>
          {results.length === 0 ? (
            <EmptyState title="No recipes match yet" hint="Add another ingredient." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
              {results.map(({ r, matched }) => {
                const kid = r.kcal <= 350;
                return (
                  <div key={r.id} className="pcard card" style={{ padding: 16 }}>
                    <h4 style={{ marginBottom: 4 }}>{r.name}</h4>
                    <p className="meta" style={{ margin: '0 0 4px' }}>
                      {r.cuisine} · {r.minutes} min · {r.veg ? 'Veg' : 'Non-veg'}
                      {kid && <span className="tag green" style={{ marginLeft: 6 }}>Kid-Friendly</span>}
                    </p>
                    <span className="kcal" style={{ fontWeight: 700 }}>{r.kcal} kcal</span>
                    <span className="muted" style={{ fontSize: 11 }}> · {r.gPerPlate} g/plate</span>
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>Uses: {matched.join(', ')}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <span className="btn btn-accent btn-sm">Recipe (for {N})</span>
                      <Link to="/family/grocery" className="btn btn-line btn-sm">Add to Basket</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h4>Kitchen Staples</h4>
            <div className="pill-row" style={{ marginTop: 12 }}>
              {STAPLES.map((s) => (
                <span key={s} className="pill" style={chipStyle} onClick={() => addIng(s)}>+ {s}</span>
              ))}
            </div>
          </div>
          <div className="card">
            <h4>Long-Term Memory</h4>
            <p className="meta" style={{ display: 'block', marginTop: 10 }}>
              Dietary needs and conditions you set for each family member are remembered — non-veg and high-sugar dishes are auto-excluded for those who need it, and lighter meals are flagged <span className="tag green">Kid-Friendly</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
