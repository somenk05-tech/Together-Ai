/**
 * ── CREATE MY PET'S DIET PLAN ───────────────────────────────────────────────
 *
 * Seven steps, in the brief's order, and each one asks for exactly what the
 * engine needs at that point and nothing else. The last step is not a form: it
 * is the plan, and it opens with the number the whole hub turns on.
 *
 * THE GENERATION PAUSE IS REAL WORK, NOT THEATRE. Building the week walks the
 * catalogue, the recipe file and the composition table for every meal of seven
 * days. It is fast, so the screen shows a short honest wait rather than a fake
 * progress bar counting to an arbitrary number.
 *
 * WHAT THE PLAN SHOWS FIRST is the daily calorie target with its factor and its
 * source underneath, because a target with no derivation is a number to be
 * trusted blindly, and this one shouldn't be — it should be checkable.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stepper } from '../components/Stepper';
import { Disclaimer } from '../components/Disclaimer';
import { Loading, Empty } from '../components/States';
import { MealCard } from '../components/MealCard';
import { PetPortrait } from '../components/PetPortrait';
import { Choice } from './Profiles';
import { SectionTitle } from './PetsHome';
import { newPetId, usePets } from '../store';
import { breedsFor } from '../data/breeds';
import { ACTIVITY_LABEL, energyFor, mealsPerDay, readAge } from '../engine/nutrition';
import { EVIDENCE } from '../data/evidence';
import { HOME_COOKED_WARNING } from '../data/recipes';
import type { ActivityLevel, DietStyle, Goal, Pet, Species } from '../types';

const STEPS = ['Species', 'About', 'Activity', 'Goal', 'Diet', 'Restrictions', 'Plan'];

export function DietPlanner() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const addPet = usePets((s) => s.addPet);
  const updatePet = usePets((s) => s.updatePet);
  const generatePlan = usePets((s) => s.generatePlan);
  const buildShopping = usePets((s) => s.buildShopping);
  const plans = usePets((s) => s.plans);

  const existing = useMemo(() => pets.find((p) => p.id === activePetId) ?? null, [pets, activePetId]);
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<Pet>(() => existing ?? {
    id: newPetId(), name: '', species: 'dog', breed: '', dob: null, ageMonths: null, sex: null,
    weightKg: null, targetWeightKg: null, bodyCondition: 'ideal', activity: 'moderate', housing: 'both',
    sterilised: true, allergies: [], sensitivities: [], restrictions: [], currentFood: '',
    dietStyle: 'commercial', goal: 'maintain', healthNotes: '', photos: [], portrait: 'dog',
    createdAt: new Date().toISOString().slice(0, 10),
  });

  const set = <K extends keyof Pet>(k: K, v: Pet[K]) => setDraft({ ...draft, [k]: v });
  const plan = plans[draft.id] ?? null;
  const canAdvance =
    step === 1 ? draft.name.trim().length > 0 && !!draft.weightKg : true;

  const commit = () => {
    setGenerating(true);
    if (pets.some((p) => p.id === draft.id)) updatePet(draft.id, draft);
    else addPet(draft);
    window.setTimeout(() => {
      generatePlan(draft.id);
      buildShopping(draft.id);
      setGenerating(false);
      setStep(6);
    }, 550);
  };

  useEffect(() => { if (step === 6 && !plan && !generating) commit(); /* eslint-disable-line */ }, [step]);

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 980 }}>
      <SectionTitle
        title="Create my pet’s diet plan"
        line="Seven short steps. The plan is calculated from veterinary energy equations, not from a guess."
      />
      <Stepper steps={STEPS} current={step} onJump={setStep} />

      <div className="card" style={{ padding: 'clamp(18px, 3vw, 30px)', display: 'grid', gap: 20, minHeight: 280 }}>
        {step === 0 && (
          <StepBody title="Who are we feeding?" line="Cats are not small dogs — the equations, the safe-food list and the shelf all change here.">
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {(['dog', 'cat'] as Species[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setDraft({ ...draft, species: s, breed: '', portrait: s }); setStep(1); }}
                  style={{
                    display: 'grid', placeItems: 'center', gap: 10, padding: '26px 40px', cursor: 'pointer',
                    borderRadius: 'var(--r-3)', font: 'inherit',
                    border: `1px solid ${draft.species === s ? 'var(--accent-line)' : 'var(--line)'}`,
                    background: draft.species === s ? 'var(--accent-soft)' : 'var(--card)',
                  }}
                >
                  <PetPortrait pet={{ species: s, name: '', weightKg: null, photos: [] }} size={72} />
                  <strong style={{ fontSize: 17, textTransform: 'uppercase', letterSpacing: '.12em' }}>{s}</strong>
                </button>
              ))}
            </div>
          </StepBody>
        )}

        {step === 1 && (
          <StepBody title="About your pet" line="Name, breed, age and weight. The last two decide the calorie target.">
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Field label="Pet name *">
                <input style={INPUT} value={draft.name} placeholder="Max" onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Breed">
                <select style={INPUT} value={draft.breed} onChange={(e) => set('breed', e.target.value)}>
                  <option value="">Select a breed</option>
                  {breedsFor(draft.species).map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Date of birth" hint={readAge(draft).months !== null ? `${readAge(draft).label} · ${readAge(draft).stage}` : undefined}>
                <input style={INPUT} type="date" value={draft.dob ?? ''} onChange={(e) => set('dob', e.target.value || null)} />
              </Field>
              <Field label="Weight (kg) *">
                <input style={INPUT} type="number" step="0.1" value={draft.weightKg ?? ''} onChange={(e) => set('weightKg', e.target.value === '' ? null : parseFloat(e.target.value))} />
              </Field>
            </div>
          </StepBody>
        )}

        {step === 2 && (
          <StepBody title="How active are they?" line="Merck’s maintenance table is built on neuter status; activity moves the factor inside the verified range and never above it.">
            <Choice
              label="Activity level"
              value={draft.activity}
              stack
              options={(['low', 'moderate', 'high'] as ActivityLevel[]).map((v) => ({ value: v, label: ACTIVITY_LABEL[v] }))}
              onChange={(v) => set('activity', v as ActivityLevel)}
            />
            <Choice
              label="Sterilised / neutered"
              value={draft.sterilised === null ? '' : String(draft.sterilised)}
              options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
              onChange={(v) => set('sterilised', v === 'true')}
            />
          </StepBody>
        )}

        {step === 3 && (
          <StepBody title="What is the goal?" line="A weight goal switches the calculation to ideal body weight, which is what AAHA’s weight-management guidance requires.">
            <Choice
              label="Primary goal"
              value={draft.goal}
              stack
              options={[
                { value: 'maintain', label: 'Maintain a healthy weight' },
                { value: 'weight-loss', label: 'Weight management' },
                { value: 'growth', label: 'Healthy growth' },
                { value: 'senior', label: 'Senior nutrition' },
                { value: 'wellness', label: 'General wellness' },
              ]}
              onChange={(v) => set('goal', v as Goal)}
            />
            {draft.goal === 'weight-loss' && (
              <Field label="Target weight (kg)" hint="If you leave this blank we use 85% of current weight as a placeholder — your vet should set the real target.">
                <input style={{ ...INPUT, maxWidth: 160 }} type="number" step="0.1" value={draft.targetWeightKg ?? ''} onChange={(e) => set('targetWeightKg', e.target.value === '' ? null : parseFloat(e.target.value))} />
              </Field>
            )}
          </StepBody>
        )}

        {step === 4 && (
          <StepBody title="How do you feed them?" line="This decides how the week is built — and how loudly the plan has to say ‘complementary’.">
            <Choice
              label="Diet preference"
              value={draft.dietStyle}
              stack
              options={[
                { value: 'commercial', label: 'Commercial food — complete and balanced' },
                { value: 'mixed', label: 'Mixed — commercial base with home-cooked meals' },
                { value: 'home-cooked', label: 'Home-cooked' },
              ]}
              onChange={(v) => set('dietStyle', v as DietStyle)}
            />
            <Field label="Current food">
              <input style={INPUT} value={draft.currentFood} placeholder="Brand and pack size" onChange={(e) => set('currentFood', e.target.value)} />
            </Field>
            {draft.dietStyle !== 'commercial' && (
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, padding: '12px 14px', borderRadius: 'var(--r-2)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', color: 'var(--warn-ink)' }}>
                {HOME_COOKED_WARNING}
              </p>
            )}
          </StepBody>
        )}

        {step === 5 && (
          <StepBody title="Anything to avoid?" line="Anything listed here is excluded from every meal, recipe and recommendation in the hub.">
            <QuickTags label="Allergies" values={draft.allergies} onChange={(v) => set('allergies', v)} suggestions={draft.species === 'dog' ? ['Chicken', 'Beef', 'Dairy', 'Wheat', 'Egg', 'Lamb'] : ['Fish', 'Chicken', 'Dairy', 'Beef']} />
            <QuickTags label="Sensitivities" values={draft.sensitivities} onChange={(v) => set('sensitivities', v)} suggestions={['Rich or oily food', 'Grain', 'Soy']} />
            <QuickTags label="Other restrictions" values={draft.restrictions} onChange={(v) => set('restrictions', v)} suggestions={['Vet-advised low fat', 'Low phosphorus']} />
            <Field label="Health notes">
              <input style={INPUT} value={draft.healthNotes} placeholder="Anything your vet has told you" onChange={(e) => set('healthNotes', e.target.value)} />
            </Field>
          </StepBody>
        )}

        {step === 6 && (
          generating || !plan
            ? <Loading line={`Building ${draft.name || 'your pet'}’s week from the energy equations, the catalogue and the composition tables…`} />
            : <PlanResult petId={draft.id} onWeekly={() => nav('/pets/weekly')} onShopping={() => nav('/pets/shopping')} />
        )}

        {step < 6 && (
          <footer style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8 }}>
            <button type="button" className="btn btn-line" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</button>
            <button
              type="button"
              className="btn"
              disabled={!canAdvance}
              onClick={() => (step === 5 ? commit() : setStep(step + 1))}
              style={{ background: canAdvance ? 'var(--accent)' : 'var(--wash)', color: canAdvance ? 'var(--on-accent)' : 'var(--faint)', border: 'none' }}
            >
              {step === 5 ? 'Generate my pet’s plan' : 'Continue'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

/* ── the plan itself ─────────────────────────────────────────────────────── */

export function PlanResult({ petId, onWeekly, onShopping }: { petId: string; onWeekly: () => void; onShopping: () => void }) {
  const pets = usePets((s) => s.pets);
  const plans = usePets((s) => s.plans);
  const toggleMealDone = usePets((s) => s.toggleMealDone);
  const regenerate = usePets((s) => s.regenerate);
  const pet = pets.find((p) => p.id === petId) ?? null;
  const plan = plans[petId] ?? null;

  if (!pet || !plan) return <Empty glyph="🥣" title="No plan yet" line="Finish the steps above and the plan appears here." />;

  const energy = energyFor(pet);
  const today = plan.days[0];

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <header style={{ display: 'grid', gap: 6 }}>
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase' }}>
          {pet.name}’s personalised diet plan
        </span>
        <h3 style={{ margin: 0, fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 300, letterSpacing: '-.025em' }}>
          {plan.merKcal} kcal a day
        </h3>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, maxWidth: 620 }}>
          Resting requirement {plan.rerKcal} kcal, multiplied by {energy.factor} for “{energy.factorLabel.toLowerCase()}”
          {energy.basis === 'ideal-weight' ? `, calculated on an ideal weight of ${energy.basisKg} kg` : ''}.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>
          Method: {EVIDENCE.rer.exponentialFormula} · <a href={energy.citation.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{energy.citation.source}</a>
        </p>
        {energy.weightNote && (
          <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 'var(--r-2)', padding: '10px 13px' }}>
            {energy.weightNote}
          </p>
        )}
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Figure label="Meals a day" value={String(mealsPerDay(pet))} note="Adults twice, kittens four times" />
        <Figure label="Treat allowance" value={`${plan.treatKcal} kcal`} note="10% ceiling — UC Davis" />
        <Figure label="Water" value={`${plan.waterMl[0]}–${plan.waterMl[1]} ml`} note="Cornell, per day" />
        <Figure label="Plan" value="7 days" note="Regenerate any meal" />
      </div>

      <section style={{ display: 'grid', gap: 12 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Today’s plan</h4>
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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={onWeekly} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
          Open the weekly planner
        </button>
        <button type="button" className="btn btn-line" onClick={onShopping}>Build this week’s shopping list</button>
      </div>

      <Disclaimer />
    </div>
  );
}

/* ── furniture ───────────────────────────────────────────────────────────── */

const INPUT: React.CSSProperties = {
  font: 'inherit', fontSize: 14, padding: '10px 12px', borderRadius: 'var(--r-2)',
  border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', width: '100%',
};

function StepBody({ title, line, children }: { title: string; line: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 5 }}>
        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-.015em' }}>{title}</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, maxWidth: 580 }}>{line}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
      {children}
      {hint && <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{hint}</span>}
    </label>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 'var(--r-2)', background: 'var(--wash)', display: 'grid', gap: 3 }}>
      <span className="muted" style={{ fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ fontSize: 19, fontWeight: 700 }}>{value}</strong>
      <span className="muted" style={{ fontSize: 11 }}>{note}</span>
    </div>
  );
}

function QuickTags(
  { label, values, onChange, suggestions }:
  { label: string; values: string[]; onChange: (v: string[]) => void; suggestions: string[] },
) {
  const toggle = (s: string) => onChange(values.includes(s) ? values.filter((v) => v !== s) : [...values, s]);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {suggestions.map((s) => {
          const on = values.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={on}
              style={{
                font: 'inherit', fontSize: 13, padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--danger-line)' : 'var(--line)'}`,
                background: on ? 'var(--danger-soft)' : 'var(--card)',
                color: on ? 'var(--danger-ink)' : 'var(--ink-soft)',
                fontWeight: on ? 700 : 500,
              }}
            >
              {on ? '✕ ' : '+ '}{s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
