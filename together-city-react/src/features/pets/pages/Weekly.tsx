/**
 * ── THE WEEK ────────────────────────────────────────────────────────────────
 *
 * Seven days across, meals down. On a phone it becomes seven stacked days,
 * because a seven-column grid at 390 px is a spreadsheet nobody reads.
 *
 * EVERY MEAL IS EDITABLE IN PLACE — swap, mark fed, save as a favourite, open
 * the recipe. The one thing the grid will not do is let a swap break the
 * calorie budget silently: a swapped meal is re-portioned to the same target,
 * so the week's arithmetic survives the owner rearranging it.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/States';
import { Disclaimer } from '../components/Disclaimer';
import { SectionTitle } from './PetsHome';
import { usePets } from '../store';

const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Weekly() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const plans = usePets((s) => s.plans);
  const toggleMealDone = usePets((s) => s.toggleMealDone);
  const regenerate = usePets((s) => s.regenerate);
  const favourites = usePets((s) => s.favourites);
  const toggleFavourite = usePets((s) => s.toggleFavourite);
  const generatePlan = usePets((s) => s.generatePlan);
  const buildShopping = usePets((s) => s.buildShopping);
  const [open, setOpen] = useState<string | null>(null);

  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const plan = pet ? plans[pet.id] ?? null : null;

  if (!pet || !plan) {
    return <Empty glyph="📅" title="Nothing planned yet" line="The weekly planner draws from the diet plan — make one and the week fills in." action={<button type="button" className="btn" onClick={() => nav('/pets/plan')}>Create a diet plan</button>} />;
  }

  const done = plan.days.flatMap((d) => d.meals).filter((m) => m.done).length;
  const total = plan.days.flatMap((d) => d.meals).length;

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <SectionTitle
        title={`${pet.name}’s week`}
        line={`${plan.merKcal} kcal a day across ${plan.mealsPerDay} meals · ${done} of ${total} meals marked fed`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-line" onClick={() => { generatePlan(pet.id); buildShopping(pet.id); }}>Regenerate week</button>
            <button type="button" className="btn btn-sm" onClick={() => nav('/pets/shopping')} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>Shopping list</button>
          </div>
        }
      />

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(212px, 1fr))' }}>
        {plan.days.map((day, i) => {
          const date = new Date(day.date);
          return (
            <section key={day.date} className="card" style={{ padding: 14, display: 'grid', gap: 10, alignContent: 'start' }}>
              <header style={{ display: 'grid', gap: 1 }}>
                <strong style={{ fontSize: 14.5, fontWeight: 700 }}>{i === 0 ? 'Today' : DAY_NAME[date.getDay()]}</strong>
                <span className="muted" style={{ fontSize: 11 }}>
                  {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {day.meals.length} meals · {day.treatKcal} kcal treats
                </span>
              </header>

              {day.meals.map((meal) => {
                const id = `${day.date}:${meal.id}`;
                const isOpen = open === id;
                const key = meal.recipeId ?? meal.productId ?? meal.id;
                return (
                  <div
                    key={meal.id}
                    style={{
                      display: 'grid', gap: 6, padding: '10px 11px', borderRadius: 'var(--r-2)',
                      background: meal.done ? 'var(--ok-soft)' : 'var(--wash)',
                      border: `1px solid ${meal.done ? 'var(--ok-line)' : 'var(--line)'}`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : id)}
                      aria-expanded={isOpen}
                      style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', font: 'inherit', cursor: 'pointer', display: 'grid', gap: 2 }}
                    >
                      <span className="muted" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                        {meal.slot} · {meal.time}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{meal.title}</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {meal.grams ? `${meal.grams} g` : 'see pack'} · {meal.kcal} kcal
                        {meal.kind === 'complementary' ? ' · complementary' : ''}
                      </span>
                    </button>

                    {isOpen && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>{meal.detail}</p>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <MiniBtn onClick={() => toggleMealDone(pet.id, day.date, meal.id)}>{meal.done ? '✓ Fed' : 'Mark fed'}</MiniBtn>
                          <MiniBtn onClick={() => regenerate(pet.id, day.date, meal.id)}>Swap</MiniBtn>
                          <MiniBtn onClick={() => toggleFavourite(key)}>{favourites.includes(key) ? '★' : '☆'} Save</MiniBtn>
                          {meal.recipeId && <MiniBtn onClick={() => nav(`/pets/cook/${meal.recipeId}`)}>Recipe</MiniBtn>}
                          {meal.productId && <MiniBtn onClick={() => nav(`/pets/shop/${meal.productId}`)}>Product</MiniBtn>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <Disclaimer />
    </div>
  );
}

function MiniBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: 'inherit', fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 999,
        border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
