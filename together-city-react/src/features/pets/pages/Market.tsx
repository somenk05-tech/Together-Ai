/**
 * ── THE COMPLETE MARKET ─────────────────────────────────────────────────────
 *
 * 184 real products from Supertails, Heads Up For Tails and Zigly, laid out as
 * a shop: category rail across the top, filters and sort in a bar, a wide grid
 * of tiles beneath.
 *
 * THE DEFAULT SORT IS "RELEVANCE", WHICH HERE MEANS VERIFIABILITY. A product
 * with a confirmed price and a published guaranteed analysis outranks one
 * without, before price is considered at all. That is a deliberate merchandising
 * position: in a catalogue assembled from retail pages, the products we can
 * describe honestly are the ones worth showing first.
 *
 * PERSONALISATION IS A RAIL, NOT A FILTER. "Recommended for Max" sits above the
 * grid with its reasons visible; the grid underneath stays the whole shop.
 * Silently filtering a shop to a pet's profile is how an owner concludes you do
 * not stock something you stock.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductTile } from '../components/ProductTile';
import { Empty } from '../components/States';
import { SectionTitle } from './PetsHome';
import { useBrands, useCatalogue } from '../api';
import { usePets } from '../store';
import { RECOMMENDED_RAILS, recommendFor } from '../engine/recommend';
import type { ProductCategory, SpeciesScope } from '../types';

const CATEGORIES: { key: ProductCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'food', label: 'Food' },
  { key: 'treats', label: 'Treats' },
  { key: 'toys', label: 'Toys' },
  { key: 'walk', label: 'Walk' },
  { key: 'grooming', label: 'Groom' },
  { key: 'home', label: 'Home' },
  { key: 'litter', label: 'Litter' },
  { key: 'wellness', label: 'Wellness' },
  { key: 'training', label: 'Training' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'fashion', label: 'Fashion' },
  { key: 'vet-diet', label: 'Vet diets' },
];

export function Market() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const pet = pets.find((p) => p.id === activePetId) ?? null;

  const [species, setSpecies] = useState<SpeciesScope>(pet?.species ?? 'both');
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<'relevance' | 'low' | 'high' | 'name'>('relevance');

  const { data: products } = useCatalogue({ species, category, q, brand, maxPrice, sort });
  const { data: brands } = useBrands();

  const cart = usePets((s) => s.cart);
  const wishlist = usePets((s) => s.wishlist);
  const compare = usePets((s) => s.compare);
  const addToCart = usePets((s) => s.addToCart);
  const toggleWishlist = usePets((s) => s.toggleWishlist);
  const toggleCompare = usePets((s) => s.toggleCompare);

  const qtyOf = (id: string) => cart.filter((l) => l.productId === id).reduce((n, l) => n + l.qty, 0);

  const rails = useMemo(
    () => (pet ? RECOMMENDED_RAILS.map((r) => ({ ...r, items: recommendFor(pet, r.category, 3) })).filter((r) => r.items.length) : []),
    [pet],
  );

  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <SectionTitle
        title="Pet shop"
        line="Everything your pet needs, personalised for them. Every price, pack size and source on this shelf was read off the retailer’s own page."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-line" onClick={() => nav('/pets/specialist')}>Pet Specialist</button>
            <button type="button" className="btn btn-sm btn-line" onClick={() => nav('/pets/bundles')}>Bundles</button>
            <button type="button" className="btn btn-sm" onClick={() => nav('/pets/cart')} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
              Cart · {cart.reduce((n, l) => n + l.qty, 0)}
            </button>
          </div>
        }
      />

      {pet && rails.length > 0 && (
        <section style={{ display: 'grid', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            Recommended for {pet.name}
            <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
              {' · '}{pet.breed}, {pet.weightKg} kg, {pet.activity} activity
            </span>
          </h3>
          {rails.slice(0, 3).map((rail) => (
            <div key={rail.category} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <strong style={{ fontSize: 13.5 }}>{rail.label}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{rail.line}</span>
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(216px, 1fr))' }}>
                {rail.items.map((rec) => (
                  <ProductTile
                    key={rec.product.id}
                    product={rec.product}
                    reason={rec.reasons[0] ?? null}
                    inCart={qtyOf(rec.product.id)}
                    wishlisted={wishlist.includes(rec.product.id)}
                    comparing={compare.includes(rec.product.id)}
                    onOpen={() => nav(`/pets/shop/${rec.product.id}`)}
                    onAdd={() => addToCart(rec.product.id, 0)}
                    onWishlist={() => toggleWishlist(rec.product.id)}
                    onCompare={() => toggleCompare(rec.product.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <div style={{ display: 'grid', gap: 12, position: 'sticky', top: 0, zIndex: 2, background: 'var(--ground)', paddingBlock: 10 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              aria-pressed={category === c.key}
              style={{
                font: 'inherit', fontSize: 12.5, fontWeight: category === c.key ? 700 : 500, whiteSpace: 'nowrap',
                padding: '7px 14px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                border: `1px solid ${category === c.key ? 'var(--accent-line)' : 'var(--line)'}`,
                background: category === c.key ? 'var(--accent-soft)' : 'var(--card)',
                color: category === c.key ? 'var(--accent-ink)' : 'var(--ink-soft)',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 184 products"
            aria-label="Search products"
            style={{ font: 'inherit', fontSize: 13.5, padding: '9px 13px', borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--card)', minWidth: 200, flex: '1 1 200px' }}
          />
          <Select label="Species" value={species} onChange={(v) => setSpecies(v as SpeciesScope)} options={[{ value: 'both', label: 'Dogs & cats' }, { value: 'dog', label: 'Dogs' }, { value: 'cat', label: 'Cats' }]} />
          <Select label="Brand" value={brand} onChange={setBrand} options={[{ value: '', label: 'All brands' }, ...brands.map((b) => ({ value: b, label: b }))]} />
          <Select
            label="Budget"
            value={maxPrice === null ? '' : String(maxPrice)}
            onChange={(v) => setMaxPrice(v === '' ? null : parseInt(v, 10))}
            options={[{ value: '', label: 'Any budget' }, { value: '300', label: 'Under ₹300' }, { value: '800', label: 'Under ₹800' }, { value: '2000', label: 'Under ₹2,000' }, { value: '5000', label: 'Under ₹5,000' }]}
          />
          <Select label="Sort by" value={sort} onChange={(v) => setSort(v as typeof sort)} options={[{ value: 'relevance', label: 'Best verified' }, { value: 'low', label: 'Price: low to high' }, { value: 'high', label: 'Price: high to low' }, { value: 'name', label: 'Name' }]} />
        </div>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
        {products.length} product{products.length === 1 ? '' : 's'}
        {compare.length > 0 && (
          <>
            {' · '}
            <button type="button" onClick={() => nav('/pets/compare')} style={{ border: 'none', background: 'none', font: 'inherit', color: 'var(--accent-ink)', cursor: 'pointer', padding: 0, fontWeight: 700 }}>
              Compare {compare.length} →
            </button>
          </>
        )}
      </p>

      {products.length === 0 ? (
        <Empty glyph="🔍" title="Nothing matches those filters" line="Widen the budget or clear the brand — the catalogue is 184 products deep." action={<button type="button" className="btn btn-line" onClick={() => { setQ(''); setBrand(''); setMaxPrice(null); setCategory('all'); }}>Clear filters</button>} />
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(216px, 1fr))' }}>
          {products.map((p) => (
            <ProductTile
              key={p.id}
              product={p}
              inCart={qtyOf(p.id)}
              wishlisted={wishlist.includes(p.id)}
              comparing={compare.includes(p.id)}
              onOpen={() => nav(`/pets/shop/${p.id}`)}
              onAdd={() => addToCart(p.id, 0)}
              onWishlist={() => toggleWishlist(p.id)}
              onCompare={() => toggleCompare(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A filter dropdown. `label` is REQUIRED rather than optional, because an
 * optional accessible name is one nobody passes: to a screen reader this
 * control was "combo box" four times over on one screen, with no way to tell
 * the species filter from the sort order short of opening each.
 */
export function Select(
  { label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] },
) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ font: 'inherit', fontSize: 13, padding: '9px 11px', borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)' }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
