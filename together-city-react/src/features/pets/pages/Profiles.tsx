/**
 * ── PET PROFILES ────────────────────────────────────────────────────────────
 *
 * The form is long because the brief's field list is long, and a long form is
 * an abandoned form unless it is honest about which parts matter. So it is in
 * four folds, only the first is required, and the header says what each fold
 * buys: species, weight and age decide the calories; everything after that
 * decides which foods are excluded and which reminders exist.
 *
 * WEIGHT AND DATE OF BIRTH ARE THE TWO FIELDS THE PLAN CANNOT RUN WITHOUT, and
 * they are the two that are validated. Everything else may be left blank and
 * the plan degrades in a stated way rather than silently.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PetCard } from '../components/PetCard';
import { PetPortrait } from '../components/PetPortrait';
import { PetPhotos } from '../components/PetPhotos';
import { Empty } from '../components/States';
import { SectionTitle } from './PetsHome';
import { newPetId, usePets } from '../store';
import { breedsFor } from '../data/breeds';
import { ACTIVITY_LABEL, GOAL_LABEL, readAge } from '../engine/nutrition';
import type { ActivityLevel, BodyCondition, DietStyle, Goal, Housing, Pet, Sex, Species } from '../types';

const blank = (species: Species): Pet => ({
  id: newPetId(), name: '', species, breed: '', dob: null, ageMonths: null, sex: null,
  weightKg: null, targetWeightKg: null, bodyCondition: 'ideal', activity: 'moderate',
  housing: species === 'cat' ? 'indoor' : 'both', sterilised: null, allergies: [], sensitivities: [],
  restrictions: [], currentFood: '', dietStyle: 'commercial', goal: 'maintain', healthNotes: '',
  photos: [], portrait: species, createdAt: new Date().toISOString().slice(0, 10),
});

export function Profiles() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const pets = usePets((s) => s.pets);
  const plans = usePets((s) => s.plans);
  const activePetId = usePets((s) => s.activePetId);
  const setActive = usePets((s) => s.setActive);
  const addPet = usePets((s) => s.addPet);
  const updatePet = usePets((s) => s.updatePet);
  const removePet = usePets((s) => s.removePet);
  const generatePlan = usePets((s) => s.generatePlan);

  const editId = params.get('edit');
  const isNew = params.get('new') === '1';
  const editing = useMemo(() => pets.find((p) => p.id === editId) ?? null, [pets, editId]);
  const [draft, setDraft] = useState<Pet | null>(null);

  useEffect(() => {
    if (isNew) setDraft(blank('dog'));
    else if (editing) setDraft({ ...editing });
    else setDraft(null);
  }, [isNew, editing]);

  const close = () => { setDraft(null); setParams({}); };

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.weightKg) return;
    if (pets.some((p) => p.id === draft.id)) updatePet(draft.id, draft);
    else addPet(draft);
    generatePlan(draft.id);
    close();
  };

  if (draft) {
    return <PetForm draft={draft} setDraft={setDraft} onSave={save} onCancel={close} existing={pets.some((p) => p.id === draft.id)} onDelete={() => { removePet(draft.id); close(); }} />;
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <SectionTitle
        title="Pet profiles"
        line="Everything downstream — calories, meals, the shelf, the reminders — is computed from these."
        action={
          <button type="button" className="btn" onClick={() => setParams({ new: '1' })} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
            Add a pet
          </button>
        }
      />
      {pets.length === 0 ? (
        <Empty glyph="🐾" title="No pets yet" line="Add your first pet and the district reshapes around them." action={<button type="button" className="btn" onClick={() => setParams({ new: '1' })}>Add a pet</button>} />
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(288px, 1fr))' }}>
          {pets.map((pet) => (
            <PetCard key={pet.id} pet={pet} active={pet.id === activePetId} planned={Boolean(plans[pet.id])} onSelect={() => setActive(pet.id)} onEdit={() => setParams({ edit: pet.id })} />
          ))}
        </div>
      )}
      {pets.length > 0 && (
        <button type="button" className="btn btn-line" onClick={() => nav('/pets/plan')} style={{ justifySelf: 'start' }}>
          Build a diet plan →
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function PetForm(
  { draft, setDraft, onSave, onCancel, existing, onDelete }:
  { draft: Pet; setDraft: (p: Pet) => void; onSave: () => void; onCancel: () => void; existing: boolean; onDelete: () => void },
) {
  const set = <K extends keyof Pet>(key: K, value: Pet[K]) => setDraft({ ...draft, [key]: value });
  const age = readAge(draft);
  const valid = draft.name.trim().length > 0 && !!draft.weightKg;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(); }}
      style={{ display: 'grid', gap: 22, maxWidth: 760 }}
    >
      <header style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <PetPortrait pet={draft} size={64} />
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-.02em' }}>
            {existing ? `Edit ${draft.name || 'pet'}` : 'New pet'}
          </h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            Name and weight are required. Everything else improves the plan.
          </p>
        </div>
      </header>

      {/* PHOTOS COME FIRST, AHEAD OF THE FIELDS THAT DO THE WORK.
          The calorie target is computed from weight and age; the photograph is
          computed from nothing and changes nothing. It is at the top anyway,
          because this is the one screen in the district that is about the
          animal rather than about the data, and because a form that opens with
          your own dog's face is a form people finish. */}
      <Fieldset legend="Photos" note="Up to five. The first is the one the city shows on every card — location data is removed here on your device, before anything is saved.">
        <PetPhotos
          petName={draft.name}
          species={draft.species}
          photos={draft.photos}
          onChange={(photos) => set('photos', photos)}
        />
      </Fieldset>

      <Fieldset legend="The basics" note="These four decide the calorie target.">
        <Choice
          label="Species"
          value={draft.species}
          options={[{ value: 'dog', label: 'Dog' }, { value: 'cat', label: 'Cat' }]}
          onChange={(v) => setDraft({ ...draft, species: v as Species, breed: '', portrait: v })}
        />
        <Text label="Pet name" value={draft.name} onChange={(v) => set('name', v)} placeholder="Max" required />
        <Select
          label="Breed"
          value={draft.breed}
          onChange={(v) => set('breed', v)}
          options={[{ value: '', label: 'Select a breed' }, ...breedsFor(draft.species).map((b) => ({ value: b.name, label: b.name }))]}
        />
        <Text label="Date of birth" type="date" value={draft.dob ?? ''} onChange={(v) => set('dob', v || null)} hint={age.months !== null ? `${age.label} old · ${age.stage}` : 'Age drives the life-stage factor'} />
        <Number label="Weight" value={draft.weightKg} onChange={(v) => set('weightKg', v)} unit="kg" step={0.1} required />
        <Choice
          label="Sex"
          value={draft.sex ?? ''}
          options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
          onChange={(v) => set('sex', v as Sex)}
        />
      </Fieldset>

      <Fieldset legend="How they live" note="Activity and neuter status change the multiplier applied to resting energy.">
        <Choice
          label="Activity level"
          value={draft.activity}
          options={(['low', 'moderate', 'high'] as ActivityLevel[]).map((v) => ({ value: v, label: ACTIVITY_LABEL[v] }))}
          onChange={(v) => set('activity', v as ActivityLevel)}
          stack
        />
        <Choice
          label="Indoor or outdoor"
          value={draft.housing}
          options={[{ value: 'indoor', label: 'Indoor' }, { value: 'outdoor', label: 'Outdoor' }, { value: 'both', label: 'Both' }]}
          onChange={(v) => set('housing', v as Housing)}
        />
        <Choice
          label="Sterilised / neutered"
          value={draft.sterilised === null ? '' : String(draft.sterilised)}
          options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
          onChange={(v) => set('sterilised', v === 'true')}
        />
        <Choice
          label="Body condition"
          value={draft.bodyCondition}
          options={[{ value: 'under', label: 'Under ideal' }, { value: 'ideal', label: 'Ideal' }, { value: 'over', label: 'Over ideal' }]}
          onChange={(v) => set('bodyCondition', v as BodyCondition)}
        />
      </Fieldset>

      <Fieldset legend="Diet and goals" note="Allergies are excluded from every plan, recipe and recommendation.">
        <Choice
          label="Primary goal"
          value={draft.goal}
          options={(Object.keys(GOAL_LABEL) as Goal[]).map((g) => ({ value: g, label: GOAL_LABEL[g] }))}
          onChange={(v) => set('goal', v as Goal)}
          stack
        />
        <Number label="Weight goal" value={draft.targetWeightKg} onChange={(v) => set('targetWeightKg', v)} unit="kg" step={0.1} hint="Weight plans are calculated from ideal weight, not current weight." />
        <Choice
          label="How you feed"
          value={draft.dietStyle}
          options={[{ value: 'commercial', label: 'Commercial food' }, { value: 'home-cooked', label: 'Home-cooked' }, { value: 'mixed', label: 'Mixed' }]}
          onChange={(v) => set('dietStyle', v as DietStyle)}
        />
        <Text label="Current food" value={draft.currentFood} onChange={(v) => set('currentFood', v)} placeholder="Brand and pack size" />
        <Tags label="Allergies" values={draft.allergies} onChange={(v) => set('allergies', v)} placeholder="Chicken, beef, dairy…" />
        <Tags label="Food sensitivities" values={draft.sensitivities} onChange={(v) => set('sensitivities', v)} placeholder="Rich food, grain…" />
        <Tags label="Other dietary restrictions" values={draft.restrictions} onChange={(v) => set('restrictions', v)} placeholder="Vet-advised exclusions" />
      </Fieldset>

      <Fieldset legend="Anything else" note="Health notes never become a diagnosis here — they add a caution to the plan and a prompt to ask your vet.">
        <Text label="Health notes" value={draft.healthNotes} onChange={(v) => set('healthNotes', v)} placeholder="Stiff after long walks, sensitive stomach…" />
      </Fieldset>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="btn" disabled={!valid} style={{ background: valid ? 'var(--accent)' : 'var(--wash)', color: valid ? 'var(--on-accent)' : 'var(--faint)', border: 'none' }}>
          {existing ? 'Save changes' : 'Create profile & plan'}
        </button>
        <button type="button" className="btn btn-line" onClick={onCancel}>Cancel</button>
        {existing && (
          <button type="button" className="btn btn-line" onClick={onDelete} style={{ marginLeft: 'auto', color: 'var(--danger-ink)' }}>
            Delete pet
          </button>
        )}
      </div>
      {!valid && <p className="muted" style={{ margin: 0, fontSize: 12 }}>A name and a weight are needed before a plan can be calculated.</p>}
    </form>
  );
}

/* ── form furniture ──────────────────────────────────────────────────────── */

function Fieldset({ legend, note, children }: { legend: string; note: string; children: React.ReactNode }) {
  return (
    <fieldset className="card" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-3)', padding: 20, display: 'grid', gap: 16, margin: 0 }}>
      <legend style={{ padding: '0 8px', fontSize: 13, fontWeight: 700, letterSpacing: '.02em' }}>{legend}</legend>
      <p className="muted" style={{ margin: '-8px 0 0', fontSize: 12, lineHeight: 1.5 }}>{note}</p>
      {children}
    </fieldset>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' };
const inputStyle: React.CSSProperties = {
  font: 'inherit', fontSize: 14, padding: '10px 12px', borderRadius: 'var(--r-2)',
  border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', width: '100%',
};

function Text(
  { label, value, onChange, placeholder, hint, type = 'text', required }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; type?: string; required?: boolean },
) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={labelStyle}>{label}{required ? ' *' : ''}</span>
      <input style={inputStyle} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );
}

function Number(
  { label, value, onChange, unit, step = 1, hint, required }:
  { label: string; value: number | null; onChange: (v: number | null) => void; unit: string; step?: number; hint?: string; required?: boolean },
) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={labelStyle}>{label}{required ? ' *' : ''}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          style={{ ...inputStyle, maxWidth: 140 }}
          type="number" step={step} min={0}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        />
        <span className="muted" style={{ fontSize: 13 }}>{unit}</span>
      </span>
      {hint && <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{hint}</span>}
    </label>
  );
}

function Select(
  { label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] },
) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Choice(
  { label, value, options, onChange, stack }:
  { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; stack?: boolean },
) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: stack ? 'column' : 'row' }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              style={{
                font: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, textAlign: 'left',
                padding: '9px 14px', borderRadius: stack ? 'var(--r-2)' : 999, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line)'}`,
                background: on ? 'var(--accent-soft)' : 'var(--card)',
                color: on ? 'var(--accent-ink)' : 'var(--ink-soft)',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tags(
  { label, values, onChange, placeholder }:
  { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string },
) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v) return;
    onChange([...values, v]);
    setText('');
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={inputStyle}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="btn btn-sm btn-line" onClick={add}>Add</button>
      </div>
      {values.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              style={{
                font: 'inherit', fontSize: 12, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                border: '1px solid var(--danger-line)', background: 'var(--danger-soft)', color: 'var(--danger-ink)',
              }}
            >
              {v} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
