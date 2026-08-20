/**
 * ── TODAY ───────────────────────────────────────────────────────────────────
 *
 * The screen a pet parent opens at 7:40 in the morning. Everything on it is
 * something they are about to DO: what to put in the bowl, how much, and
 * whether the other person in the house already did it.
 *
 * The calorie derivation lives one page back on the plan. Here it is a single
 * line of context, because the morning is not the moment to re-litigate the
 * multiplier.
 */

import { useNavigate } from 'react-router-dom';
import { MealCard } from '../components/MealCard';
import { Disclaimer } from '../components/Disclaimer';
import { Empty } from '../components/States';
import { PetPortrait } from '../components/PetPortrait';
import { usePets } from '../store';
import { NEVER_FEED } from '../data/ingredients';

export function Today() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const plans = usePets((s) => s.plans);
  const toggleMealDone = usePets((s) => s.toggleMealDone);
  const regenerate = usePets((s) => s.regenerate);
  const favourites = usePets((s) => s.favourites);
  const toggleFavourite = usePets((s) => s.toggleFavourite);

  const pet = pets.find((p) => p.id === activePetId) ?? null;
  const plan = pet ? plans[pet.id] ?? null : null;

  if (!pet) {
    return <Empty glyph="🐾" title="No pet selected" line="Add a pet or pick one to see today’s plan." action={<button type="button" className="btn" onClick={() => nav('/pets/profiles?new=1')}>Add a pet</button>} />;
  }
  if (!plan) {
    return <Empty glyph="🥣" title={`No plan for ${pet.name} yet`} line="Seven short questions and the week is built." action={<button type="button" className="btn" onClick={() => nav('/pets/plan')}>Create the diet plan</button>} />;
  }

  const day = plan.days[0];
  const fed = day.meals.filter((m) => m.done).length;
  const avoidList = NEVER_FEED
    .filter((t) => t.affects === 'Both' || t.affects.toLowerCase() === pet.species)
    .slice(0, 8);

  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <PetPortrait pet={pet} size={64} />
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 300, letterSpacing: '-.02em' }}>
            {pet.name}’s day
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {plan.merKcal} kcal target · {fed} of {day.meals.length} meals given · treats up to {plan.treatKcal} kcal
          </p>
        </div>
        <button type="button" className="btn btn-sm btn-line" style={{ marginLeft: 'auto' }} onClick={() => nav('/pets/weekly')}>
          Weekly planner →
        </button>
      </header>

      <section style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))' }}>
          {day.meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              favourite={favourites.includes(meal.recipeId ?? meal.productId ?? meal.id)}
              onFavourite={() => toggleFavourite(meal.recipeId ?? meal.productId ?? meal.id)}
              onToggle={() => toggleMealDone(pet.id, day.date, meal.id)}
              onRegenerate={() => regenerate(pet.id, day.date, meal.id)}
              onOpen={meal.recipeId ? () => nav(`/pets/cook/${meal.recipeId}`) : meal.productId ? () => nav(`/pets/shop/${meal.productId}`) : undefined}
            />
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Panel title="Treat allowance" glyph="🦴">
          <strong style={{ fontSize: 24, fontWeight: 700 }}>{plan.treatKcal} kcal</strong>
          <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
            Ten per cent of the day, which is where UC Davis and WSAVA both put the ceiling. Treats come out of the
            meal budget, not on top of it — the meals above already account for this.
          </p>
        </Panel>

        <Panel title="Water" glyph="💧">
          <strong style={{ fontSize: 24, fontWeight: 700 }}>{plan.waterMl[0]}–{plan.waterMl[1]} ml</strong>
          <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
            {pet.species === 'dog'
              ? 'Cornell puts normal canine intake at 40–60 ml per kg a day. Consistently above 100 ml/kg is worth a vet call.'
              : 'A cat on wet food drinks visibly less and is not dehydrated. Sudden thirst in a cat is a reason to call the vet.'}
          </p>
        </Panel>

        <Panel title="Foods to avoid" glyph="⛔">
          <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
            {avoidList.map((t) => t.name.split(' (')[0]).join(' · ')}
          </p>
          <button type="button" className="btn btn-sm btn-line" onClick={() => nav('/pets/eat')} style={{ justifySelf: 'start' }}>
            Check any food →
          </button>
        </Panel>
      </div>

      <Disclaimer />
    </div>
  );
}

function Panel({ title, glyph, children }: { title: string; glyph: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 18, display: 'grid', gap: 8, alignContent: 'start' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 17 }}>{glyph}</span>
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase' }}>{title}</span>
      </span>
      {children}
    </section>
  );
}
