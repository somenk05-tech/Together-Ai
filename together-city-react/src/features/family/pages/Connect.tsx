import { useState } from 'react';
import { PageHeader, Button, Spinner } from '@/components/ui';
import {
  useFamilyMembers, useFamilyMemberMutations, useFamilyProfile,
  useHouseholdInvites, useRespondHouseholdInvite, useHouseholdSharing, useFamilyMealPlanning,
} from '@/features/nutrition/hooks';
import type { HouseholdSharing } from '@/features/nutrition/api';
import type { FamilyMemberProfile, FamilyMemberInput, HouseholdRole } from '@/features/nutrition/api';
import { AddHubMemberDialog } from '@/features/connections/components/AddHubMemberDialog';

const DIETS: Record<string, string> = {
  everything: 'Non-vegetarian', nonveg: 'Non-vegetarian', veg: 'Vegetarian', vegan: 'Vegan',
  egg: 'Eggetarian', pesc: 'Pescatarian', jain: 'Jain',
};
const GOALS: [string, string][] = [['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain / build']];
const ACTIVITY: [number, string][] = [[1.2, 'Sedentary'], [1.375, 'Lightly active'], [1.55, 'Moderately active'], [1.725, 'Very active'], [1.9, 'Athlete']];
const CONDITIONS = ['Diabetes', 'High cholesterol', 'Hypertension', 'Fatty liver', 'Kidney disease', 'PCOS', 'Thyroid'];
const ROLE_META: Record<HouseholdRole, { label: string; color: string; soft: string }> = {
  owner: { label: 'Owner', color: '#2e7d4f', soft: '#e6f2ea' },
  adult: { label: 'Adult', color: '#2f6f8f', soft: '#e4eef4' },
  child: { label: 'Child', color: '#b0803a', soft: '#f7efe1' },
  guest: { label: 'Guest', color: '#7a7a72', soft: '#eeeee9' },
};
const fld: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', display: 'block', marginBottom: 4 };

const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/* ─────────────────────── Incoming invitations (to me) ─────────────────────── */
function InvitesInbox() {
  const invites = useHouseholdInvites();
  const respond = useRespondHouseholdInvite();
  if (!invites.data || invites.data.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 18, border: '1px solid var(--accent)', background: 'var(--accent-soft)' }}>
      <strong style={{ fontSize: 14 }}>🔔 Household invitations</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {invites.data.map((iv) => (
          <div key={iv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', borderRadius: 12, padding: '10px 12px' }}>
            <div className="av sm" style={{ overflow: 'hidden', backgroundImage: iv.from.image ? `url(${iv.from.image})` : undefined, backgroundSize: 'cover' }}>
              {!iv.from.image && initialsOf(iv.from.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, margin: 0 }}>{iv.message}</p>
              <p className="muted" style={{ fontSize: 11.5, margin: '2px 0 0' }}>Role: {ROLE_META[iv.role]?.label ?? iv.role}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="accent" size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: iv.id, accept: true })}>Accept</Button>
              <Button variant="line" size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: iv.id, accept: false })}>Decline</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Family Profile summary ─────────────────────────── */
function FamilyProfileCard() {
  const profile = useFamilyProfile();
  const p = profile.data;
  if (!p || p.counts.total <= 1) return null;
  const Stat = ({ n, l }: { n: number | string; l: string }) => (
    <div><div style={{ fontSize: 18, fontWeight: 800 }}>{n}</div><div className="muted" style={{ fontSize: 11 }}>{l}</div></div>
  );
  const c = p.compatibility;
  const cColor = c.level === 'high' ? '#2e7d4f' : c.level === 'moderate' ? '#b0803a' : '#c0733a';
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>{p.name}</h3>
        <span className="muted" style={{ fontSize: 12 }}>one shared plan · personalised plates</span>
      </div>

      {/* Family Compatibility Score — how easily the household shares one meal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, padding: 14, background: 'var(--paper)', borderRadius: 14 }}>
        <div style={{ flex: 'none', width: 62, height: 62, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `conic-gradient(${cColor} ${c.score * 3.6}deg, var(--line) 0)` }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, color: cColor }}>{c.score}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13.5 }}>Family compatibility · {c.level === 'high' ? 'High' : c.level === 'moderate' ? 'Moderate' : 'Low'}</strong>
          <p className="muted" style={{ fontSize: 12.5, margin: '3px 0 0' }}>{c.recommendation}</p>
        </div>
      </div>
      {c.reasons.length > 0 && c.level !== 'high' && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
          {c.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 14 }}>
        <Stat n={p.counts.total} l="members" />
        <Stat n={p.counts.adults} l="adults" />
        <Stat n={p.counts.children} l="children" />
        <Stat n={p.counts.seniors} l="seniors" />
        <Stat n={p.summary.avgCalories.toLocaleString('en-IN')} l="avg kcal" />
        <Stat n={`${p.summary.avgProtein}g`} l="avg protein" />
        <Stat n={`${p.summary.avgFiber}g`} l="avg fibre" />
      </div>
      {(p.dietTypes.length > 0 || p.conditions.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          {p.dietTypes.map((d) => <span key={d} style={{ fontSize: 11, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', fontWeight: 600 }}>{d}</span>)}
          {p.conditions.map((c) => <span key={c} style={{ fontSize: 11, background: '#f7efe1', color: '#b0803a', borderRadius: 999, padding: '3px 10px', fontWeight: 600 }}>{c}</span>)}
        </div>
      )}
      {p.summary.medicalAlerts.length > 0 && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          ⚠️ {p.summary.medicalAlerts.length} medical note{p.summary.medicalAlerts.length === 1 ? '' : 's'} across the household — the planner portions each plate to keep everyone safe.
        </p>
      )}
    </div>
  );
}

/* ─────────────────── Family Meal Planning mode (household toggle) ─────────────────── */
function FamilyMealPlanningCard() {
  const { query, update } = useFamilyMealPlanning();
  const ctx = query.data;
  if (!ctx) return null;
  const on = ctx.familyMealPlanning;
  const isOwner = ctx.role === 'owner';
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>🍽️ Family Meal Planning</h3>
        <span className="muted" style={{ fontSize: 12 }}>cook together, or plan independently</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{on ? 'ON — one shared family meal' : 'OFF — independent meal plans'}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {on
              ? 'Everyone follows the same weekly meals with personalised portions, macros and medical or diet substitutions. Refreshing or skipping a meal updates every member.'
              : 'Each connected member gets their own independent AI meal plan while staying in the family. Refreshing a meal affects only that member.'}
          </div>
        </div>
        {isOwner ? (
          <button role="switch" aria-checked={on} disabled={update.isPending}
            onClick={() => update.mutate(!on)}
            style={{ flex: 'none', width: 48, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .15s', background: on ? 'var(--accent)' : 'var(--line)' }}>
            <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 11.5, textAlign: 'right', maxWidth: 130 }}>
            Set by the head of your household.
          </span>
        )}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
        This is a family-level setting — it applies to everyone in the household.
      </p>
    </div>
  );
}

/* ─────────────────────────── Privacy / sharing controls ─────────────────────────── */
const SHARE_ROWS: { key: keyof HouseholdSharing; label: string; hint: string }[] = [
  { key: 'targets', label: 'Nutrition targets', hint: 'Daily calories, protein & fibre' },
  { key: 'conditions', label: 'Health conditions', hint: 'Diabetes, kidney disease, etc.' },
  { key: 'weight', label: 'Weight & height', hint: 'Your body metrics' },
  { key: 'bloodTests', label: 'Blood tests', hint: 'Shared blood-panel results' },
];
function PrivacyCard() {
  const { query, update } = useHouseholdSharing();
  const s = query.data;
  if (!s) return null;
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>🔒 Your privacy</h3>
        <span className="muted" style={{ fontSize: 12 }}>what your household can see about you</span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 12px' }}>
        Your medical data stays private by default. The meal planner still uses it to keep your plate safe — these toggles only control what other members can <em>see</em>.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SHARE_ROWS.map((r) => {
          const on = s[r.key];
          return (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{r.hint}</div>
              </div>
              <button role="switch" aria-checked={on} disabled={update.isPending}
                onClick={() => update.mutate({ [r.key]: !on })}
                style={{ flex: 'none', width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .15s', background: on ? 'var(--accent)' : 'var(--line)' }}>
                <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── Edit self profile form ─────────────────────────── */
function EditSelfForm({ initial, onSave, onCancel, saving }: { initial: FamilyMemberInput; onSave: (d: FamilyMemberInput) => void; onCancel: () => void; saving: boolean }) {
  const [f, setF] = useState<FamilyMemberInput>(initial);
  const set = (k: keyof FamilyMemberInput, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const toggleCond = (c: string) => set('healthConditions', f.healthConditions.includes(c) ? f.healthConditions.filter((x) => x !== c) : [...f.healthConditions, c]);
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (<div><span style={lbl}>{label}</span>{children}</div>);
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16, border: '1px solid var(--accent)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        <Field label="Sex"><select style={fld} value={f.sex} onChange={(e) => set('sex', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></Field>
        <Field label="Age"><input style={fld} type="number" value={f.age} onChange={(e) => set('age', +e.target.value)} /></Field>
        <Field label="Height (cm)"><input style={fld} type="number" value={f.heightCm} onChange={(e) => set('heightCm', +e.target.value)} /></Field>
        <Field label="Weight (kg)"><input style={fld} type="number" value={f.weightKg} onChange={(e) => set('weightKg', +e.target.value)} /></Field>
        <Field label="Activity"><select style={fld} value={f.activity} onChange={(e) => set('activity', +e.target.value)}>{ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Goal"><select style={fld} value={f.goal} onChange={(e) => set('goal', e.target.value)}>{GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Diet"><select style={fld} value={f.diet} onChange={(e) => set('diet', e.target.value)}>{Object.entries(DIETS).filter(([v]) => v !== 'nonveg').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
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
        <Button variant="accent" disabled={saving} onClick={() => onSave(f)}>{saving ? 'Saving…' : 'Save my profile'}</Button>
        <Button variant="line" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Member card ─────────────────────────────── */
function MemberCard({ m, onEdit, onRemove }: { m: FamilyMemberProfile; onEdit: () => void; onRemove: () => void }) {
  const dietLabel = DIETS[m.diet] ?? m.diet;
  const role = ROLE_META[m.householdRole] ?? ROLE_META.adult;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="av" style={{ width: 46, height: 46, fontSize: 17, overflow: 'hidden', backgroundImage: m.image ? `url(${m.image})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          {!m.image && (m.name[0] ?? '?').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {m.name}
            {m.isSelf && <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· You</span>}
          </h4>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>{dietLabel} · {m.age}y{!m.privacy.weight && m.weightKg ? ` · ${m.weightKg}kg` : ''}</p>
        </div>
        <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: role.color, background: role.soft, borderRadius: 999, padding: '3px 10px' }}>{role.label}</span>
      </div>

      {m.privacy.targets ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 12.5, color: 'var(--muted)' }}>
          🔒 Nutrition targets are private — the plan still portions their plate safely.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 13 }}>
          <span><b>{m.targets.kcal.toLocaleString('en-IN')}</b> <span className="muted">kcal</span></span>
          <span><b>{m.targets.protein}</b> <span className="muted">g protein</span></span>
          <span><b>{m.targets.fiber}</b> <span className="muted">g fibre</span></span>
        </div>
      )}

      {m.healthConditions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {m.healthConditions.map((c) => <span key={c} style={{ fontSize: 11, background: '#f7efe1', color: '#b0803a', borderRadius: 999, padding: '3px 9px', fontWeight: 600 }}>{c}</span>)}
        </div>
      )}
      {m.privacy.conditions && !m.isSelf && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>🔒 Health conditions private</p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {m.isSelf && <Button variant="line" size="sm" onClick={onEdit}>Edit</Button>}
        {!m.isSelf && <Button variant="line" size="sm" onClick={onRemove}>Remove</Button>}
      </div>
    </div>
  );
}

const toInput = (m: FamilyMemberProfile): FamilyMemberInput => ({
  name: m.name, role: m.role, sex: m.sex, age: m.age, heightCm: m.heightCm, weightKg: m.weightKg,
  activity: m.activity, goal: m.goal, diet: m.diet, healthConditions: m.healthConditions, allergies: m.allergies,
});

/** Connect Household Members — invite real Together City users (Nutrition Hub
 *  only; never a social connection). Each member keeps their own private profile;
 *  the family plan cooks shared meals with personalised portions. */
export function FamilyConnect() {
  const members = useFamilyMembers();
  const { update, remove } = useFamilyMemberMutations();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 01"
        title="Household Members"
        sub="Invite the people you cook for by their Together City ID — they accept, and their own diet, goals and health conditions shape the shared family plan. Private to the Nutrition Hub; never a social connection." />

      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <InvitesInbox />
        <FamilyMealPlanningCard />
        <FamilyProfileCard />
        <PrivacyCard />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px' }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>Household</h3>
          {editing === null && <Button variant="accent" onClick={() => setInviting(true)}>+ Add Member</Button>}
        </div>

        {members.isLoading && <Spinner label="Loading your household…" />}
        {members.data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {members.data.map((m) => editing === m.id ? (
              <div key={m.id} style={{ gridColumn: '1 / -1' }}>
                <EditSelfForm initial={toInput(m)} saving={update.isPending}
                  onSave={(d) => update.mutate({ id: m.id, dto: d }, { onSuccess: () => setEditing(null) })}
                  onCancel={() => setEditing(null)} />
              </div>
            ) : (
              <MemberCard key={m.id} m={m}
                onEdit={() => setEditing(m.id)}
                onRemove={() => { if (confirm(`Remove ${m.name} from your household? This ends the Household Connection only — it doesn't affect any social connection.`)) remove.mutate(m.id); }} />
            ))}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: 18, lineHeight: 1.5 }}>
          Each member keeps their own private medical profile, blood tests, preferences and targets — nothing is merged or overwritten. The Family Profile aggregates everyone into one intelligent household plan, cooking shared meals portioned per person.
        </p>
      </div>

      {inviting && (
        <AddHubMemberDialog
          moduleKey="nutrition"
          title="Add to Nutrition Family Hub"
          blurb="Add someone you cook for by their exact @handle."
          familyOnly
          onClose={() => setInviting(false)}
        />
      )}
    </div>
  );
}
