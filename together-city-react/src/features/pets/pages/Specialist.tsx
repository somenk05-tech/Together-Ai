/**
 * ── PET SPECIALIST ──────────────────────────────────────────────────────────
 *
 * A different experience from the general market, as the brief asks — and the
 * difference is that you do not arrive here with a category in mind. You arrive
 * with a NEED: my dog is putting on weight, my cat brings up hairballs, my
 * senior is stiff in the mornings.
 *
 * SO THE NAVIGATION IS NEEDS, AND EVERY NEED CARRIES ITS OWN LIMIT.
 * "Joint support" shows joint supplements and says, on the same card, that
 * stiffness in an older dog is a veterinary conversation and not a purchase.
 * A specialised shelf that sells into a symptom without saying that is the
 * thing this section must not become.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductTile } from '../components/ProductTile';
import { Empty } from '../components/States';
import { Disclaimer } from '../components/Disclaimer';
import { SectionTitle } from './PetsHome';
import { useCatalogue } from '../api';
import { usePets } from '../store';
import type { ProductCategory } from '../types';

interface Need {
  key: string;
  label: string;
  line: string;
  limit: string | null;
  match: RegExp;
  categories: ProductCategory[];
}

const NEEDS: Need[] = [
  { key: 'weight', label: 'Weight management', line: 'Satiety and light formulations, plus slow feeders.', limit: 'A weight plan belongs with your vet, who sets the target weight this hub then calculates against.', match: /satiety|weight|light|slim|slow feed/i, categories: ['food', 'vet-diet', 'home'] },
  { key: 'digestion', label: 'Sensitive digestion', line: 'Gentle formulations and single-protein foods.', limit: 'Persistent loose stools, vomiting or weight loss are veterinary signs, not shopping problems.', match: /sensitiv|digest|gastro|intestinal|stomach|probiotic|gut/i, categories: ['food', 'vet-diet', 'wellness', 'treats'] },
  { key: 'skin', label: 'Skin & coat', line: 'Shampoos, omega supplements and coat-supporting diets.', limit: 'Itching, hair loss and hot spots need a diagnosis before a product — allergy, parasites and infection look alike.', match: /skin|coat|shampoo|omega|salmon|conditioner|derma/i, categories: ['grooming', 'wellness', 'food'] },
  { key: 'senior', label: 'Senior support', line: 'Senior diets, joint supplements and easier bowls.', limit: 'Stiffness in an older pet deserves a veterinary examination — arthritis is treatable and undertreated.', match: /senior|mature|7\+|joint|glucosamine|flexadin|hip/i, categories: ['food', 'wellness', 'home'] },
  { key: 'growth', label: 'Puppy & kitten growth', line: 'Growth formulations and starter diets.', limit: 'Large-breed puppies need controlled calcium — the wrong growth food is a skeletal risk, so ask your vet.', match: /puppy|kitten|starter|junior|growth|babydog/i, categories: ['food', 'treats', 'training'] },
  { key: 'dental', label: 'Dental care', line: 'Dental chews, toothbrushes and pastes.', limit: 'Chews reduce plaque; they do not treat existing dental disease, which needs a professional clean under anaesthesia.', match: /dental|dentastix|teeth|tooth|oral|twistix|veggiedent/i, categories: ['treats', 'grooming'] },
  { key: 'urinary', label: 'Urinary & renal', line: 'Prescription urinary and renal diets.', limit: 'These are prescription diets. Feeding one without a diagnosis can harm a healthy animal.', match: /urinary|renal|struvite|kidney|s\/o/i, categories: ['vet-diet', 'food'] },
  { key: 'parasite', label: 'Tick & flea control', line: 'Spot-ons, collars and oral parasiticides.', limit: 'Dosing is by body weight and the wrong product can be toxic — cats especially. Buy the dose your vet specifies.', match: /tick|flea|bravecto|simparica|kiltix|selamectin|parasit/i, categories: ['wellness', 'grooming'] },
  { key: 'indoor-cat', label: 'Indoor cats', line: 'Indoor formulations, hairball care, litter and enrichment.', limit: null, match: /indoor|hairball|litter|scratch|cat tree/i, categories: ['food', 'litter', 'toys', 'home'] },
  { key: 'apartment', label: 'Apartment life', line: 'Puzzle feeders, training pads and odour control.', limit: null, match: /puzzle|interactive|training pad|odour|odor|stain|slow feed/i, categories: ['toys', 'training', 'cleaning', 'home'] },
  { key: 'travel', label: 'Travel', line: 'Carriers, travel bowls and ID tags.', limit: null, match: /carrier|travel|tag|foldable|car /i, categories: ['walk'] },
  { key: 'active', label: 'Active & working dogs', line: 'Durable harnesses, rope toys and higher-energy food.', limit: null, match: /harness|rope|xplorers|retractable|active|performance/i, categories: ['walk', 'toys', 'food'] },
];

export function Specialist() {
  const nav = useNavigate();
  const [need, setNeed] = useState<Need>(NEEDS[0]);
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const { data: all } = useCatalogue({ species: pet?.species ?? 'both', sort: 'relevance' });

  const cart = usePets((s) => s.cart);
  const wishlist = usePets((s) => s.wishlist);
  const compare = usePets((s) => s.compare);
  const addToCart = usePets((s) => s.addToCart);
  const toggleWishlist = usePets((s) => s.toggleWishlist);
  const toggleCompare = usePets((s) => s.toggleCompare);

  const matches = all.filter(
    (p) => need.categories.includes(p.category) && need.match.test(`${p.name} ${p.subcategory} ${p.notes}`),
  );

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <SectionTitle
        title="Pet specialist"
        line="Shop by need, not by shelf name. Every need shows where shopping stops and the vet starts."
      />

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {NEEDS.map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => setNeed(n)}
            aria-pressed={need.key === n.key}
            style={{
              font: 'inherit', fontSize: 12.5, fontWeight: need.key === n.key ? 700 : 500,
              padding: '8px 14px', borderRadius: 'var(--r-full)', cursor: 'pointer',
              border: `1px solid ${need.key === n.key ? 'var(--accent-line)' : 'var(--line)'}`,
              background: need.key === n.key ? 'var(--accent-soft)' : 'var(--card)',
              color: need.key === n.key ? 'var(--accent-ink)' : 'var(--ink-soft)',
            }}
          >
            {n.label}
          </button>
        ))}
      </div>

      <header style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-.015em' }}>{need.label}</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{need.line}</p>
        {need.limit && (
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, padding: '12px 14px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn-ink)' }}>
            <strong style={{ display: 'block', fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: 3 }}>Where this stops</strong>
            {need.limit}
          </p>
        )}
      </header>

      {matches.length === 0 ? (
        <Empty glyph="🔎" title="Nothing verified for this need yet" line="None of our 184 products covers this need for this species yet." action={<button type="button" className="btn btn-line" onClick={() => nav('/pets/shop')}>Browse everything</button>} />
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(216px, 1fr))' }}>
          {matches.map((p) => (
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
      )}

      <Disclaimer text="Together City does not diagnose conditions and does not claim any product treats or prevents disease. Veterinary diets and parasiticides are prescription-channel products in India and should be used under veterinary guidance." />
    </div>
  );
}
