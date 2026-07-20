import { useState } from 'react';
import { Hero, Button, Spinner } from '@/components/ui';
import { useFamilyMembers, useFamilyMemberMutations } from '@/features/nutrition/hooks';
import type { FamilyMemberProfile, FamilyMemberInput } from '@/features/nutrition/api';

const ROLES = ['self', 'father', 'mother', 'spouse', 'son', 'daughter', 'child', 'grandparent', 'other'];
const DIETS: [string, string][] = [
  ['everything', 'Non-vegetarian'], ['veg', 'Vegetarian'], ['vegan', 'Vegan'],
  ['egg', 'Eggetarian'], ['pesc', 'Pescatarian'], ['jain', 'Jain'],
];
const GOALS: [string, string][] = [['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain / build']];
const ACTIVITY: [number, string][] = [[1.2, 'Sedentary'], [1.375, 'Lightly active'], [1.55, 'Moderately active'], [1.725, 'Very active'], [1.9, 'Athlete']];
const CONDITIONS = ['Diabetes', 'High cholesterol', 'Hypertension', 'Fatty liver', 'Kidney disease', 'PCOS', 'Thyroid'];

const blank = (): FamilyMemberInput => ({
  name: '', role: 'member', sex: 'male', age: 30, heightCm: 170, weightKg: 65,
  activity: 1.4, goal: 'maintain', diet: 'everything', healthConditions: [], allergies: '',
});
const toInput = (m: FamilyMemberProfile): FamilyMemberInput => ({
  name: m.name, role: m.role, sex: m.sex, age: m.age, heightCm: m.heightCm, weightKg: m.weightKg,
  activity: m.activity, goal: m.goal, diet: m.diet, healthConditions: m.healthConditions, allergies: m.allergies,
});

const fld: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: '100%' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', display: 'block', marginBottom: 4 };

function MemberForm({ initial, isSelf, onSave, onCancel, saving }: { initial: FamilyMemberInput; isSelf?: boolean; onSave: (d: FamilyMemberInput) => void; onCancel: () => void; saving: boolean }) {
  const [f, setF] = useState<FamilyMemberInput>(initial);
  const set = (k: keyof FamilyMemberInput, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const toggleCond = (c: string) => set('healthConditions', f.healthConditions.includes(c) ? f.healthConditions.filter((x) => x !== c) : [...f.healthConditions, c]);
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (<div><span style={lbl}>{label}</span>{children}</div>);
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16, border: '1px solid var(--accent)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        <Field label="Name"><input style={fld} value={f.name} placeholder="e.g. Priya" onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Relationship"><select style={fld} value={f.role} disabled={isSelf} onChange={(e) => set('role', e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></Field>
        <Field label="Sex"><select style={fld} value={f.sex} onChange={(e) => set('sex', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></Field>
        <Field label="Age"><input style={fld} type="number" value={f.age} onChange={(e) => set('age', +e.target.value)} /></Field>
        <Field label="Height (cm)"><input style={fld} type="number" value={f.heightCm} onChange={(e) => set('heightCm', +e.target.value)} /></Field>
        <Field label="Weight (kg)"><input style={fld} type="number" value={f.weightKg} onChange={(e) => set('weightKg', +e.target.value)} /></Field>
        <Field label="Activity"><select style={fld} value={f.activity} onChange={(e) => set('activity', +e.target.value)}>{ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Goal"><select style={fld} value={f.goal} onChange={(e) => set('goal', e.target.value)}>{GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Diet"><select style={fld} value={f.diet} onChange={(e) => set('diet', e.target.value)}>{DIETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <span style={lbl}>Medical conditions</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CONDITIONS.map((c) => {
            const on = f.healthConditions.includes(c);
            return (
              <button key={c} type="button" onClick={() => toggleCond(c)}
                style={{ fontSize: 12.5, cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--ink)' }}>
                {on ? '✓ ' : ''}{c}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <span style={lbl}>Allergies (comma-separated)</span>
        <input style={fld} value={f.allergies ?? ''} placeholder="e.g. peanuts, shellfish" onChange={(e) => set('allergies', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Button variant="accent" disabled={saving || !f.name.trim()} onClick={() => onSave(f)}>{saving ? 'Saving…' : 'Save member'}</Button>
        <Button variant="line" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function MemberCard({ m, onEdit, onRemove }: { m: FamilyMemberProfile; onEdit: () => void; onRemove: () => void }) {
  const dietLabel = DIETS.find(([v]) => v === m.diet)?.[1] ?? m.diet;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="av" style={{ width: 44, height: 44, fontSize: 17 }}>{(m.name[0] ?? '?').toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: 0 }}>{m.name}{m.isSelf && <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> · You</span>}</h4>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>{m.role[0].toUpperCase() + m.role.slice(1)} · {dietLabel} · {m.age}y · {m.weightKg}kg</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 13 }}>
        <span><b>{m.targets.kcal.toLocaleString('en-IN')}</b> <span className="muted">kcal</span></span>
        <span><b>{m.targets.protein}</b> <span className="muted">g protein</span></span>
        <span><b>{m.targets.fiber}</b> <span className="muted">g fibre</span></span>
      </div>
      {m.healthConditions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {m.healthConditions.map((c) => <span key={c} style={{ fontSize: 11, background: '#f7efe1', color: '#b0803a', borderRadius: 999, padding: '3px 9px', fontWeight: 600 }}>{c}</span>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="line" size="sm" onClick={onEdit}>Edit</Button>
        {!m.isSelf && <Button variant="line" size="sm" onClick={onRemove}>Remove</Button>}
      </div>
    </div>
  );
}

/** Connect Family Members — admin-managed sub-profiles (Family Meal Planner §).
 *  Each member has their own biometrics, diet, goal and conditions, so the family
 *  plan can compute per-member targets and portions. */
export function FamilyConnect() {
  const members = useFamilyMembers();
  const { add, update, remove } = useFamilyMemberMutations();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div>
      <Hero image="/assets/img/nutrition-hub--main-pages--family--connect-family.webp" eyebrow="Family Nutrition · 01"
        title="Family Members"
        sub="Add each person in your household — their diet, goal and health conditions set their own nutrition targets, and the family plan cooks shared meals with personalised portions." />

      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px' }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>Household</h3>
          {!adding && editing === null && <Button variant="accent" onClick={() => setAdding(true)}>+ Add member</Button>}
        </div>

        {adding && (
          <MemberForm initial={blank()} saving={add.isPending}
            onSave={(d) => add.mutate(d, { onSuccess: () => setAdding(false) })}
            onCancel={() => setAdding(false)} />
        )}

        {members.isLoading && <Spinner label="Loading your household…" />}
        {members.data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {members.data.map((m) => editing === m.id ? (
              <div key={m.id} style={{ gridColumn: '1 / -1' }}>
                <MemberForm initial={toInput(m)} isSelf={m.isSelf} saving={update.isPending}
                  onSave={(d) => update.mutate({ id: m.id, dto: d }, { onSuccess: () => setEditing(null) })}
                  onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <MemberCard key={m.id} m={m}
                onEdit={() => { setAdding(false); setEditing(m.id); }}
                onRemove={() => { if (confirm(`Remove ${m.name} from your family?`)) remove.mutate(m.id); }} />
            ))}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 18, lineHeight: 1.5 }}>
          Each member's targets are calculated from their age, sex, height, weight, activity and goal, then adjusted for any medical conditions. The Family Weekly Planner cooks one shared meal and portions it per member.
        </p>
      </div>
    </div>
  );
}
