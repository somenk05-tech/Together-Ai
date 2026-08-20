/**
 * ── COOK FOR MY PET ─────────────────────────────────────────────────────────
 *
 * The differentiator, and the section with the most ways to do harm. Its whole
 * design is built around one distinction that never gets softened: these are
 * COMPLEMENTARY meals. The badge is on the list card, on the detail page, in
 * the header of the section, and in the portion panel. Four times is not
 * excessive for the claim that separates a topper from a deficient diet.
 *
 * PORTIONS ARE COMPUTED FOR THE SELECTED PET, from the composition table, and
 * capped: a complementary recipe is offered at 10–25% of the day, never as the
 * whole day, no matter how the arithmetic comes out.
 */

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Disclaimer } from '../components/Disclaimer';
import { Empty } from '../components/States';
import { SectionTitle } from './PetsHome';
import { usePets } from '../store';
import { useRecipe, useRecipes } from '../api';
import { HOME_COOKED_WARNING } from '../data/recipes';
import { FOOD } from '../data/composition';
import { recipeGramsFor, recipeKcalPer100g } from '../engine/plan';
import { energyFor } from '../engine/nutrition';

export function Cook() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const favourites = usePets((s) => s.favourites);
  const toggleFavourite = usePets((s) => s.toggleFavourite);
  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const { data: recipes } = useRecipes(pet?.species ?? 'dog');

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <SectionTitle
        title="Cook for my pet"
        line={`Indian ingredients, safe preparation, real portions${pet ? ` for ${pet.name}` : ''}. Every recipe here is complementary — a topper or an occasional meal beside a complete diet.`}
      />

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, padding: '14px 16px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn-ink)' }}>
        {HOME_COOKED_WARNING}
      </p>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))' }}>
        {recipes.map((r) => {
          const per100 = recipeKcalPer100g(r);
          return (
            <article key={r.id} className="card" style={{ display: 'grid', gap: 10, padding: 18, alignContent: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{r.name}</h3>
                <button
                  type="button"
                  onClick={() => toggleFavourite(r.id)}
                  aria-pressed={favourites.includes(r.id)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, color: favourites.includes(r.id) ? 'var(--accent-ink)' : 'var(--muted)' }}
                >
                  {favourites.includes(r.id) ? '★' : '☆'}
                </button>
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 999, padding: '3px 9px', justifySelf: 'start' }}>
                Complementary
              </span>
              <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>{r.summary}</p>
              <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
                {r.prepMinutes} min · {per100 ? `${per100} kcal per 100 g` : 'energy not calculable'} · {r.items.length} ingredients
              </p>
              <button type="button" className="btn btn-sm btn-line" style={{ justifySelf: 'start' }} onClick={() => nav(`/pets/cook/${r.id}`)}>
                Open recipe →
              </button>
            </article>
          );
        })}
      </div>

      <Disclaimer />
    </div>
  );
}

export function RecipeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: recipe } = useRecipe(id);
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const addShoppingItem = usePets((s) => s.addShoppingItem);
  const pet = pets.find((p) => p.id === activePetId) ?? null;

  const portion = useMemo(() => {
    if (!recipe || !pet) return null;
    const energy = energyFor(pet);
    const topper = Math.round(energy.merKcal * 0.15);   // 15% — inside the 10–25% band
    return { kcal: topper, grams: recipeGramsFor(recipe, topper) };
  }, [recipe, pet]);

  if (!recipe) return <Empty glyph="🍲" title="Recipe not found" line="It may have been renamed." action={<button type="button" className="btn" onClick={() => nav('/pets/cook')}>Back to recipes</button>} />;

  const per100 = recipeKcalPer100g(recipe);

  return (
    <div style={{ display: 'grid', gap: 22, maxWidth: 820 }}>
      <button type="button" className="btn btn-sm btn-line" style={{ justifySelf: 'start' }} onClick={() => nav('/pets/cook')}>← All recipes</button>

      <header style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--warn-ink)' }}>
          Complementary · {recipe.species === 'both' ? 'dogs and cats' : `${recipe.species}s`}
        </span>
        <h2 style={{ margin: 0, fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 300, letterSpacing: '-.025em' }}>{recipe.name}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>{recipe.summary}</p>
      </header>

      {portion && pet && (
        <section className="card" style={{ padding: 18, display: 'grid', gap: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent-ink)' }}>
            Portion for {pet.name}
          </span>
          <strong style={{ fontSize: 26, fontWeight: 700 }}>
            {portion.grams ? `${portion.grams} g` : 'Not calculable'} · {portion.kcal} kcal
          </strong>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            That is 15% of {pet.name}’s {energyFor(pet).merKcal} kcal day — inside the band where a complementary meal
            is safe alongside a complete diet. The rest of the day should still come from a complete and balanced food.
          </p>
        </section>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Ingredients</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
              <th style={TH}>Ingredient</th>
              <th style={TH}>Share</th>
              <th style={TH}>For this portion</th>
              <th style={TH}>kcal / 100 g</th>
            </tr>
          </thead>
          <tbody>
            {recipe.items.map((item) => {
              const food = FOOD.get(item.food);
              const grams = portion?.grams ? Math.round(portion.grams * item.share) : null;
              return (
                <tr key={item.food} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={TD}>{item.label}</td>
                  <td style={TD}>{Math.round(item.share * 100)}%</td>
                  <td style={TD}>{grams ? `${grams} g` : '—'}</td>
                  <td style={{ ...TD, color: 'var(--muted)' }}>{food?.kcal ?? 'not verified'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6 }}>
          Energy values per 100 g edible portion from the Indian Food Composition Tables 2017 (NIN / ICMR), or a USDA
          mirror where IFCT has no entry. As made, this recipe is {per100 ? `${per100} kcal per 100 g` : 'not calculable'}.
        </p>
        <button
          type="button"
          className="btn btn-sm btn-line"
          style={{ justifySelf: 'start' }}
          onClick={() => recipe.items.forEach((i) => addShoppingItem(i.label, portion?.grams ? `${Math.round(portion.grams * i.share)} g` : 'as needed'))}
        >
          Add ingredients to shopping list
        </button>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Method</h3>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, fontSize: 13.5, lineHeight: 1.65 }}>
          {recipe.method.map((m) => <li key={m}>{m}</li>)}
        </ol>
      </section>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Panel title="Suitable for" tone="ok" items={recipe.suitableFor} />
        <Panel title="Not for" tone="danger" items={recipe.notFor} />
      </div>

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, padding: '14px 16px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn-ink)' }}>
        <strong style={{ display: 'block', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Supplementation</strong>
        {recipe.supplementNote}
      </p>

      <Disclaimer />
    </div>
  );
}

const TH: React.CSSProperties = { padding: '8px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' };
const TD: React.CSSProperties = { padding: '10px 6px' };

function Panel({ title, tone, items }: { title: string; tone: 'ok' | 'danger'; items: string[] }) {
  const ink = tone === 'ok' ? 'var(--ok-ink)' : 'var(--danger-ink)';
  const soft = tone === 'ok' ? 'var(--ok-soft)' : 'var(--danger-soft)';
  const line = tone === 'ok' ? 'var(--ok-line)' : 'var(--danger-line)';
  return (
    <section style={{ padding: 16, borderRadius: 'var(--r-2)', background: soft, border: `1px solid ${line}` }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: ink }}>{title}</span>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </section>
  );
}
