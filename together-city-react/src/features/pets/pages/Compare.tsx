/**
 * ── COMPARE ─────────────────────────────────────────────────────────────────
 *
 * Up to three products, side by side, on the rows a pet owner actually decides
 * on. Two of the brief's three verdicts can be computed honestly and one very
 * often cannot:
 *
 *   BEST VALUE          — price per kilogram. Computable when the pack size
 *                         parses and the price was verified.
 *   BEST FOR THIS PET   — the recommendation engine's own score, with reasons.
 *   BEST INGREDIENT     — needs a guaranteed analysis, and 174 of 184 rows do
 *     PROFILE             not have one. So this verdict appears only when the
 *                         data supports it, and says why when it does not.
 *
 * An award nobody can check is worse than an empty cell.
 */

import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/States';
import { PriceLine } from '../components/PriceLine';
import { rupees } from '../engine/format';
import { SectionTitle } from './PetsHome';
import { useProductsByIds } from '../api';
import { usePets } from '../store';
import { scoreProduct } from '../engine/recommend';
import { packGrams } from '../engine/packs';
import type { Product } from '../types';
import { shortName } from '../engine/naming';
import { PackShot } from '../components/PackShot';

const pricePerKg = (p: Product): number | null => {
  const v = p.variants.find((x) => x.priceInr && packGrams(x.pack));
  if (!v || !v.priceInr) return null;
  const g = packGrams(v.pack);
  return g ? Math.round((v.priceInr / g) * 1000) : null;
};

export function Compare() {
  const nav = useNavigate();
  const compare = usePets((s) => s.compare);
  const toggleCompare = usePets((s) => s.toggleCompare);
  const addToCart = usePets((s) => s.addToCart);
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const { data: products } = useProductsByIds(compare);

  if (products.length === 0) {
    return <Empty glyph="⚖️" title="Nothing to compare yet" line="Tap Compare on any two or three products in the shop and they line up here." action={<button type="button" className="btn" onClick={() => nav('/pets/shop')}>Go to the shop</button>} />;
  }

  const values = products.map(pricePerKg);
  const bestValueIndex = values.some((v) => v !== null)
    ? values.indexOf(Math.min(...values.filter((v): v is number => v !== null)))
    : -1;

  const scores = pet ? products.map((p) => scoreProduct(p, pet)?.score ?? -1) : [];
  const bestForPetIndex = scores.length ? scores.indexOf(Math.max(...scores)) : -1;

  const withAnalysis = products.filter((p) => p.nutrition.proteinPct !== null);
  const bestProteinIndex = withAnalysis.length >= 2
    ? products.indexOf(withAnalysis.reduce((a, b) => ((b.nutrition.proteinPct ?? 0) > (a.nutrition.proteinPct ?? 0) ? b : a)))
    : -1;

  const ROWS: { label: string; render: (p: Product) => string }[] = [
    { label: 'Brand', render: (p) => p.brand },
    { label: 'Pack size', render: (p) => p.packSizes[0] ?? 'not stated' },
    { label: 'Price', render: (p) => (p.priceFrom ? rupees(p.priceFrom) : 'not verified') },
    { label: 'MRP', render: (p) => (p.mrpFrom ? rupees(p.mrpFrom) : 'not verified') },
    { label: 'Price per kg', render: (p) => { const v = pricePerKg(p); return v ? rupees(v) : 'not calculable'; } },
    { label: 'Protein', render: (p) => (p.nutrition.proteinPct !== null ? `${p.nutrition.proteinPct}%` : 'not published') },
    { label: 'Fat', render: (p) => (p.nutrition.fatPct !== null ? `${p.nutrition.fatPct}%` : 'not published') },
    { label: 'Energy', render: (p) => (p.nutrition.kcalPerKg !== null ? `${p.nutrition.kcalPerKg} kcal/kg` : 'not published') },
    { label: 'Main protein', render: (p) => p.mainProtein ?? 'not stated' },
    { label: 'Grain free', render: (p) => (p.grainFree === null ? 'not stated' : p.grainFree ? 'Yes' : 'No') },
    { label: 'Life stage', render: (p) => p.lifeStage },
    { label: 'Species', render: (p) => (p.species === 'both' ? 'Dogs & cats' : p.species) },
    { label: 'Retailer', render: (p) => p.retailer },
  ];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <SectionTitle title="Compare" line="Only rows the source data actually supports. A blank here is a gap in the retailer’s listing, not a gap in the product." />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 520, width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...TH, minWidth: 120 }} />
              {products.map((p, i) => (
                <th key={p.id} style={{ ...TH, verticalAlign: 'top', minWidth: 170 }}>
                  <div style={{ display: 'grid', gap: 6, textAlign: 'left' }}>
                    <PackShot src={p.imageUrl} alt={p.name} category={p.category} height={92} drawnSize={54} />
                    <span className="muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{p.brand}</span>
                    <button type="button" onClick={() => nav(`/pets/shop/${p.id}`)} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 13.5, fontWeight: 700, textAlign: 'left', cursor: 'pointer', lineHeight: 1.35 }}>
                      {shortName(p)}
                    </button>
                    <PriceLine product={p} size="sm" />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {i === bestValueIndex && <Award label="Best value" />}
                      {i === bestForPetIndex && pet && <Award label={`Best for ${pet.name}`} />}
                      {i === bestProteinIndex && <Award label="Highest protein" />}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button type="button" className="btn btn-sm" onClick={() => addToCart(p.id, 0)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', fontSize: 11 }}>Add</button>
                      <button type="button" className="btn btn-sm btn-line" onClick={() => toggleCompare(p.id)} style={{ fontSize: 11 }}>Remove</button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} style={{ borderTop: '1px solid var(--line)' }}>
                <th style={{ ...TD, textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 12 }}>{row.label}</th>
                {products.map((p) => {
                  const v = row.render(p);
                  const absent = /not (published|verified|stated|calculable)/.test(v);
                  return <td key={p.id} style={{ ...TD, color: absent ? 'var(--faint)' : 'inherit', fontWeight: absent ? 400 : 600 }}>{v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {withAnalysis.length < 2 && (
        <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, maxWidth: 660 }}>
          No “best ingredient profile” verdict is shown: fewer than two of these products publish a guaranteed
          analysis on their source listing, and comparing a published protein figure against an absent one would be a
          ranking of paperwork rather than of food.
        </p>
      )}
    </div>
  );
}

const TH: React.CSSProperties = { padding: '10px 12px 14px 0', textAlign: 'left' };
const TD: React.CSSProperties = { padding: '10px 12px 10px 0' };

function Award({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: 'var(--ok-soft)', color: 'var(--ok-ink)', border: '1px solid var(--ok-line)' }}>
      {label}
    </span>
  );
}
