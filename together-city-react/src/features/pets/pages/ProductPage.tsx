/**
 * ── ONE PRODUCT ─────────────────────────────────────────────────────────────
 *
 * The full page: variants and prices, guaranteed analysis where the retailer
 * published one, who it is for and who should avoid it, subscribe-and-save,
 * alternatives, and the source link.
 *
 * WHO SHOULD AVOID IT IS COMPUTED, NOT COPIED. It reads the product's own
 * fields against the selected pet — species, life stage, declared allergens —
 * and says plainly when the answer is "not this pet". A shop that will sell a
 * kitten food for a senior dog without a word is not personalised, it is just
 * indifferent.
 *
 * NUTRITION IS SHOWN AS AN ABSENCE WHEN IT IS ABSENT. Ten of 184 rows carry a
 * guaranteed analysis; the other 174 print the reason there is no table rather
 * than a table of dashes that looks like the data is coming.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PriceLine } from '../components/PriceLine';
import { rupees } from '../engine/format';
import { SourceLine } from '../components/SourceLine';
import { ProductTile } from '../components/ProductTile';
import { Empty } from '../components/States';
import { Disclaimer } from '../components/Disclaimer';
import { useCatalogue, useProduct } from '../api';
import { usePets } from '../store';
import { scoreProduct } from '../engine/recommend';
import { packGrams } from '../engine/packs';
import { readAge } from '../engine/nutrition';
import { shortName } from '../engine/naming';
import { PackShot } from '../components/PackShot';

export function ProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: product } = useProduct(id);
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const addToCart = usePets((s) => s.addToCart);
  const toggleWishlist = usePets((s) => s.toggleWishlist);
  const toggleCompare = usePets((s) => s.toggleCompare);
  const wishlist = usePets((s) => s.wishlist);
  const compare = usePets((s) => s.compare);
  const cart = usePets((s) => s.cart);
  const [variant, setVariant] = useState(0);

  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const { data: related } = useCatalogue({ category: product?.category ?? 'all', species: product?.species, sort: 'relevance' });

  if (!product) {
    return <Empty glyph="📦" title="Product not found" line="It may have been removed from the catalogue." action={<button type="button" className="btn" onClick={() => nav('/pets/shop')}>Back to the shop</button>} />;
  }

  const rec = pet ? scoreProduct(product, pet) : null;
  const alternatives = related.filter((p) => p.id !== product.id).slice(0, 4);
  const age = pet ? readAge(pet) : null;

  const mismatch: string[] = [];
  if (pet) {
    if (product.species !== 'both' && product.species !== pet.species) mismatch.push(`This is a ${product.species} product and ${pet.name} is a ${pet.species}.`);
    if (age && product.lifeStage !== 'all' && product.lifeStage !== age.stage) mismatch.push(`Formulated for the ${product.lifeStage} stage; ${pet.name} is ${age.stage}.`);
    const allergen = [...pet.allergies, ...pet.sensitivities].find((a) => `${product.name} ${product.mainProtein ?? ''}`.toLowerCase().includes(a.toLowerCase()));
    if (allergen) mismatch.push(`${pet.name}’s profile lists ${allergen} as something to avoid, and this product appears to contain it.`);
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <button type="button" className="btn btn-sm btn-line" style={{ justifySelf: 'start' }} onClick={() => nav('/pets/shop')}>← Shop</button>

      <div style={{ display: 'grid', gap: 26, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ display: 'grid', placeItems: 'center', padding: 20, borderRadius: 'var(--r-3)', background: 'var(--wash)', gap: 10 }}>
            <PackShot src={product.imageUrl} alt={product.name} category={product.category} height={300} drawnSize={140} />
            <span className="muted" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase' }}>{product.subcategory || product.category}</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
            {product.imageUrl
              ? `Photograph: ${product.retailer}, from the source listing.`
              : 'No product photograph was published on the source listing, so the shelf draws its own pack.'}
          </p>
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{product.brand}</span>
            <h2 style={{ margin: 0, fontSize: 'clamp(22px, 3.6vw, 32px)', fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2 }}>{shortName(product)}</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {product.species === 'both' ? 'Dogs and cats' : product.species === 'dog' ? 'Dogs' : 'Cats'}
              {product.lifeStage !== 'all' ? ` · ${product.lifeStage}` : ''}
              {product.breedSize && product.breedSize !== 'All' ? ` · ${product.breedSize} breeds` : ''}
            </p>
          </div>

          <PriceLine product={product} size="lg" />

          {product.variants.length > 1 && (
            <div style={{ display: 'grid', gap: 7 }}>
              <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase' }}>Pack size</span>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {product.variants.map((v, i) => (
                  <button
                    key={`${v.pack}-${i}`}
                    type="button"
                    onClick={() => setVariant(i)}
                    aria-pressed={variant === i}
                    style={{
                      font: 'inherit', fontSize: 12.5, padding: '8px 13px', borderRadius: 'var(--r-2)', cursor: 'pointer',
                      border: `1px solid ${variant === i ? 'var(--accent-line)' : 'var(--line)'}`,
                      background: variant === i ? 'var(--accent-soft)' : 'var(--card)',
                      color: variant === i ? 'var(--accent-ink)' : 'var(--ink-soft)', textAlign: 'left',
                    }}
                  >
                    <strong style={{ display: 'block' }}>{v.pack ?? 'Standard'}</strong>
                    <span style={{ fontSize: 11 }}>{v.priceInr ? rupees(v.priceInr) : 'price not verified'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {product.vetGuidance && (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, padding: '12px 14px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn-ink)' }}>
              <strong>Veterinary guidance required.</strong> Prescription-channel product. Your vet decides whether
              it’s right for your pet.
            </p>
          )}

          {mismatch.length > 0 && (
            <div style={{ display: 'grid', gap: 6, padding: '12px 14px', borderRadius: 'var(--r-2)', background: 'var(--danger-soft)', border: '1px solid var(--danger-line)' }}>
              <strong style={{ fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--danger-ink)' }}>Not right for {pet?.name}</strong>
              {mismatch.map((m) => <p key={m} style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--danger-ink)' }}>{m}</p>)}
            </div>
          )}

          {rec && rec.reasons.length > 0 && mismatch.length === 0 && (
            <div style={{ display: 'grid', gap: 5, padding: '12px 14px', borderRadius: 'var(--r-2)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)' }}>
              <strong style={{ fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--accent-ink)' }}>Why this suits {pet?.name}</strong>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.65 }}>
                {rec.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => addToCart(product.id, variant)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
              Add to cart{cart.some((l) => l.productId === product.id) ? ' · added' : ''}
            </button>
            <button type="button" className="btn btn-line" onClick={() => { addToCart(product.id, variant); nav('/pets/cart'); }}>Buy now</button>
            <button type="button" className="btn btn-line" onClick={() => toggleWishlist(product.id)}>{wishlist.includes(product.id) ? '♥ Saved' : '♡ Wishlist'}</button>
            <button type="button" className="btn btn-line" onClick={() => toggleCompare(product.id)}>{compare.includes(product.id) ? '✓ Comparing' : 'Compare'}</button>
          </div>

          <SourceLine retailer={product.retailer} url={product.sourceUrl} date={product.lastVerified} />
        </div>
      </div>

      <section style={{ display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nutrition & specification</h3>
        {product.verified.nutrition ? (
          <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 520 }}>
            <tbody>
              <Cell label="Crude protein" value={product.nutrition.proteinPct !== null ? `${product.nutrition.proteinPct}%` : null} />
              <Cell label="Crude fat" value={product.nutrition.fatPct !== null ? `${product.nutrition.fatPct}%` : null} />
              <Cell label="Crude fibre" value={product.nutrition.fibrePct !== null ? `${product.nutrition.fibrePct}%` : null} />
              <Cell label="Moisture" value={product.nutrition.moisturePct !== null ? `${product.nutrition.moisturePct}%` : null} />
              <Cell label="Ash" value={product.nutrition.ashPct !== null ? `${product.nutrition.ashPct}%` : null} />
              <Cell label="Energy" value={product.nutrition.kcalPerKg !== null ? `${product.nutrition.kcalPerKg} kcal/kg` : null} />
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.65, maxWidth: 620 }}>
            The source listing doesn’t publish a guaranteed analysis, and we won’t invent one. Feed to the analysis
            and chart on the pack itself.
          </p>
        )}
        {product.keyIngredients && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65 }}><strong>Ingredients: </strong>{product.keyIngredients}</p>}
        {product.specs && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65 }}><strong>Specification: </strong>{product.specs}</p>}
        {product.mainProtein && <p style={{ margin: 0, fontSize: 13 }}><strong>Main protein: </strong>{product.mainProtein}</p>}
        {product.notes && <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65 }}>{product.notes}</p>}
        {packGrams(product.variants[variant]?.pack ?? null) && (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Selected pack: {packGrams(product.variants[variant]?.pack ?? null)} g
          </p>
        )}
      </section>

      {alternatives.length > 0 && (
        <section style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Alternatives in the same category</h3>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(216px, 1fr))' }}>
            {alternatives.map((p) => (
              <ProductTile
                key={p.id}
                product={p}
                inCart={cart.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0)}
                wishlisted={wishlist.includes(p.id)}
                comparing={compare.includes(p.id)}
                onOpen={() => nav(`/pets/shop/${p.id}`)}
                onAdd={() => addToCart(p.id, 0)}
                onWishlist={() => toggleWishlist(p.id)}
                onCompare={() => toggleCompare(p.id)}
              />
            ))}
          </div>
        </section>
      )}

      <Disclaimer text="Product information is reproduced from the source retailer's listing on the date shown. Prices and availability change. Nothing on this page is a medical claim, and veterinary diets and parasiticides should be used only under veterinary guidance." />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | null }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--line)' }}>
      <th style={{ textAlign: 'left', padding: '9px 12px 9px 0', fontWeight: 600, color: 'var(--muted)', fontSize: 12.5 }}>{label}</th>
      <td style={{ padding: '9px 0', fontWeight: value ? 700 : 400, color: value ? 'inherit' : 'var(--faint)' }}>{value ?? 'not published'}</td>
    </tr>
  );
}
