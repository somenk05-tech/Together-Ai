/**
 * ── THE PLAN, NOT A SECOND FORM ─────────────────────────────────────────────
 *
 * This page used to be a seven-step wizard that asked for the species, the
 * name, the breed, the age, the weight, the activity, the goal, the diet and
 * the allergies — every one of which the profile page had already collected
 * and stored. Two forms writing the same nine fields is not two features; it
 * is one feature and a bug waiting for the day they disagree about a weight.
 *
 * So the profile is the only place a pet is described, and this page is what
 * the description produces: the calorie target, where the multiplier came
 * from, today's meals, and the door to the month. It generates on arrival if
 * no plan exists, because a citizen who has filled in a profile has already
 * told us everything the plan needs and should not have to ask for it.
 *
 * WHAT IS LEFT TO DECIDE HERE IS ONLY WHAT THE PROFILE CANNOT KNOW: whether to
 * rebuild the month. That is one button.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Disclaimer } from '../components/Disclaimer';
import { Empty, Loading } from '../components/States';
import { MealCard } from '../components/MealCard';
import { PetPortrait } from '../components/PetPortrait';
import { SectionTitle } from './PetsHome';
import { usePets } from '../store';
import { energyFor, mealsPerDay, readAge } from '../engine/nutrition';
import { EVIDENCE } from '../data/evidence';
import { PLAN_DAYS } from '../engine/plan';
import { ESTIMATE_CAVEAT } from '../data/density';

export function DietPlanner() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const plans = usePets((s) => s.plans);
  const generatePlan = usePets((s) => s.generatePlan);
  const buildShopping = usePets((s) => s.buildShopping);
  const toggleMealDone = usePets((s) => s.toggleMealDone);
  const regenerate = usePets((s) => s.regenerate);

  const pet = useMemo(() => pets.find((p) => p.id === activePetId) ?? null, [pets, activePetId]);
  const plan = pet ? plans[pet.id] ?? null : null;
  const ready = Boolean(pet?.weightKg);

  // Generate on arrival rather than on a button. The profile is complete; the
  // plan is arithmetic on it; making somebody press "create" first is asking
  // them to authorise a calculation.
  useEffect(() => {
    if (pet && ready && !plan) {
      generatePlan(pet.id);
      buildShopping();
    }
  }, [pet, ready, plan, generatePlan, buildShopping]);

  if (!pet) {
    return (
      <Empty
        glyph="🐾"
        title="No pet selected"
        line="The plan is calculated from a pet’s profile, so it starts there."
        action={<button type="button" className="btn" onClick={() => nav('/pets/profiles?new=1')}>Add a pet</button>}
      />
    );
  }

  if (!ready) {
    return (
      <Empty
        glyph="⚖️"
        title={`${pet.name} needs a weight`}
        line="Add a weight to the profile and the plan builds itself."
        action={<button type="button" className="btn" onClick={() => nav(`/pets/profiles?edit=${pet.id}`)}>Open {pet.name}’s profile</button>}
      />
    );
  }

  if (!plan) return <Loading line={`Building ${pet.name}’s month…`} />;

  const energy = energyFor(pet);
  const age = readAge(pet);
  const today = plan.days[0];

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <SectionTitle
        title="Diet plan"
        line="Calculated from the profile."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm btn-line" onClick={() => nav(`/pets/profiles?edit=${pet.id}`)}>Edit profile</button>
            <button type="button" className="btn btn-sm btn-line" onClick={() => { generatePlan(pet.id); buildShopping(); }}>Rebuild month</button>
          </div>
        }
      />

      <header className="card" style={{ padding: 'clamp(18px, 3vw, 28px)', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <PetPortrait pet={pet} size={56} />
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase' }}>
              {pet.name}’s personalised diet plan
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {pet.breed || pet.species} · {age.label} · {pet.weightKg} kg
              {pet.targetWeightKg && pet.targetWeightKg !== pet.weightKg ? ` · goal ${pet.targetWeightKg} kg` : ''}
              {pet.allergies.length ? ` · avoids ${pet.allergies.join(', ')}` : ''}
            </span>
          </div>
        </div>

        <h3 style={{ margin: 0, fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 300, letterSpacing: '-.025em' }}>
          {plan.merKcal} kcal a day
        </h3>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, maxWidth: 640 }}>
          Resting requirement {plan.rerKcal} kcal, multiplied by {energy.factor} for “{energy.factorLabel.toLowerCase()}”
          {energy.basis === 'ideal-weight' ? `, calculated on an ideal weight of ${energy.basisKg} kg` : ''}.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
          Method: {EVIDENCE.rer.exponentialFormula} · <a href={energy.citation.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{energy.citation.source}</a>
        </p>
        {energy.weightNote && (
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 'var(--r-2)', padding: '10px 13px' }}>
            {energy.weightNote}
          </p>
        )}
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Figure label="Meals a day" value={String(mealsPerDay(pet))} note="Adults twice, kittens four times" />
        <Figure label="Treat allowance" value={`${plan.treatKcal} kcal`} note="10% ceiling — UC Davis" />
        <Figure label="Water" value={`${plan.waterMl[0]}–${plan.waterMl[1]} ml`} note="Cornell, per day" />
        <Figure label="Plan" value={`${PLAN_DAYS} days`} note="Rebuilt whenever the profile changes" />
      </div>

      <section style={{ display: 'grid', gap: 12 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Today</h4>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {today.meals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              onToggle={() => toggleMealDone(pet.id, today.date, meal.id)}
              onRegenerate={() => regenerate(pet.id, today.date, meal.id)}
            />
          ))}
        </div>
        {today.meals.some((m) => m.gramsRange) && (
          <p className="muted" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, maxWidth: 720 }}>{ESTIMATE_CAVEAT}</p>
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nutritional balance</h4>
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.65 }}>{plan.proteinNote}</p>
        {plan.avoid.length > 0 && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--danger-ink)' }}>Excluded from every meal: </strong>{plan.avoid.join(', ')}
          </p>
        )}
        {plan.cautions.map((c) => (
          <p key={c} style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, padding: '10px 13px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn-ink)' }}>
            {c}
          </p>
        ))}
      </section>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => nav('/pets/monthly')} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
            Open the monthly plan
          </button>
          <button type="button" className="btn btn-line" onClick={() => nav('/pets/today')}>Today’s meals</button>
        </div>
        {pets.length > 1 && (
          /* This page is about one animal. The shop is not — so the button that
             leads there says what it leads to, rather than letting somebody
             assume they will have to do this once per pet. */
          <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
            One grocery list covers the whole house — {pets.map((p) => p.name).join(', ')}.
          </p>
        )}
      </div>

      <Disclaimer />
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 'var(--r-2)', background: 'var(--wash)', display: 'grid', gap: 3 }}>
      <span className="muted" style={{ fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ fontSize: 20, fontWeight: 700 }}>{value}</strong>
      <span className="muted" style={{ fontSize: 11 }}>{note}</span>
    </div>
  );
}
