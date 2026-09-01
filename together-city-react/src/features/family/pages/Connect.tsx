import { useState } from 'react';
import { PageHeader, Button, Spinner } from '@/components/ui';
import {
  useFamilyMembers, useFamilyMemberMutations, useFamilyProfile,
  useHouseholdInvites, useRespondHouseholdInvite, useHouseholdSharing, useFamilyMealPlanning,
} from '@/features/nutrition/hooks';
import type { HouseholdSharing } from '@/features/nutrition/api';
import type { FamilyMemberProfile, FamilyMemberInput, HouseholdRole } from '@/features/nutrition/api';
import { AddHubMemberDialog } from '@/features/connections/components/AddHubMemberDialog';
import { FamilyDashboard } from '../components/FamilyDashboard';

const DIETS: Record<string, string> = {
  everything: 'Non-vegetarian', nonveg: 'Non-vegetarian', veg: 'Vegetarian', vegan: 'Vegan',
  egg: 'Eggetarian', pesc: 'Pescatarian', jain: 'Jain',
};
const GOALS: [string, string][] = [['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain / build']];
const ACTIVITY: [number, string][] = [[1.2, 'Sedentary'], [1.375, 'Lightly active'], [1.55, 'Moderately active'], [1.725, 'Very active'], [1.9, 'Athlete']];
const CONDITIONS = ['Diabetes', 'High cholesterol', 'Hypertension', 'Fatty liver', 'Kidney disease', 'PCOS', 'Thyroid'];
const ROLE_META: Record<HouseholdRole, { label: string; color: string; soft: string }> = {
  owner: { label: 'Owner', color: 'var(--ok-ink)', soft: 'var(--ok-soft)' },
  adult: { label: 'Adult', color: 'var(--info-ink)', soft: 'var(--info-soft)' },
  child: { label: 'Child', color: 'var(--warn-ink)', soft: 'var(--warn-soft)' },
  guest: { label: 'Guest', color: 'var(--muted)', soft: 'var(--line)' },
};
const fld: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 'var(--r-1)', padding: '10px 12px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', display: 'block', marginBottom: 4 };

const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/* ─────────────────────── Incoming invitations (to me) ─────────────────────── */
function InvitesInbox() {
  const invites = useHouseholdInvites();
  const respond = useRespondHouseholdInvite();
  // A failed read must not look like "nobody invited you" — for somebody
  // waiting on an invitation, that sentence confirms a fear, not a fact.
  if (invites.isError) {
    return (
      <div className="card" style={{ marginBottom: 18 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          We couldn’t check for household invitations just now. If someone has
          invited you, the invitation is still waiting — try again in a moment.
        </p>
      </div>
    );
  }
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
            <div className="flex-min">
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
  if (profile.isError) {
    return (
      <div className="card" style={{ marginBottom: 18 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          We couldn’t load the household summary just now — the household itself
          is unchanged.
        </p>
      </div>
    );
  }
  if (!p || p.counts.total <= 1) return null;
  const Stat = ({ n, l }: { n: number | string; l: string }) => (
    <div><div style={{ fontSize: 17, fontWeight: 800 }}>{n}</div><div className="muted" style={{ fontSize: 11 }}>{l}</div></div>
  );
  const c = p.compatibility;
  const cColor = c.level === 'high' ? 'var(--ok-ink)' : c.level === 'moderate' ? 'var(--warn-ink)' : 'var(--warn-ink)';
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>{p.name}</h3>
        <span className="muted" style={{ fontSize: 12 }}>one shared plan · personalised plates</span>
      </div>

      {/* Family Compatibility Score — how easily the household shares one meal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, padding: 14, background: 'var(--paper)', borderRadius: 'var(--r-2)' }}>
        <div style={{ flex: 'none', width: 62, height: 62, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `conic-gradient(${cColor} ${c.score * 3.6}deg, var(--line) 0)` }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, color: cColor }}>{c.score}%</div>
        </div>
        <div className="flex-min">
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
          {p.dietTypes.map((d) => <span key={d} style={{ fontSize: 11, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '3px 10px', fontWeight: 600 }}>{d}</span>)}
          {p.conditions.map((c) => <span key={c} style={{ fontSize: 11, background: 'var(--warn-soft)', color: 'var(--warn-ink)', borderRadius: 'var(--r-full)', padding: '3px 10px', fontWeight: 600 }}>{c}</span>)}
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
  if (query.isError) {
    return (
      <div className="card" style={{ marginBottom: 18 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          We couldn’t load the family meal-planning switch just now — its
          setting hasn’t changed.
        </p>
      </div>
    );
  }
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
        <div className="flex-min">
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
            style={{ flex: 'none', width: 48, height: 28, borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .15s', background: on ? 'var(--accent)' : 'var(--line)' }}>
            <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: 'var(--card)', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 11.5, textAlign: 'right', maxWidth: 130 }}>
            Set by the head of your household.
          </span>
        )}
      </div>
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
  if (query.isError) {
    return (
      <div className="card" style={{ marginBottom: 18 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
          We couldn’t load your privacy settings just now — nothing about what’s
          shared has changed.
        </p>
      </div>
    );
  }
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
              <div className="flex-min">
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{r.hint}</div>
              </div>
              <button role="switch" aria-checked={on} disabled={update.isPending}
                onClick={() => update.mutate({ [r.key]: !on })}
                style={{ flex: 'none', width: 44, height: 26, borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .15s', background: on ? 'var(--accent)' : 'var(--line)' }}>
                <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--card)', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── Edit member form ───────────────────────────── */
/**
 * Was EditSelfForm, and was only ever reachable from the owner's own row.
 *
 * The server has always allowed more than that: updateFamilyMember is scoped by
 * ownerId and refuses only when the row belongs to a real invited user, because
 * those people manage their own profile in their own hub. A member the owner
 * typed in by hand has no such owner — it is household bookkeeping, and it was
 * editable by the API and not by any button.
 *
 * Which mattered rather more once the previous commit made an unknown body
 * visible: the card could say a member's targets could not be worked out, and
 * the only way to act on it was to remove them and add them back.
 */
function EditMemberForm({ initial, isSelf, onSave, onCancel, saving }: { initial: FamilyMemberInput; isSelf: boolean; onSave: (d: FamilyMemberInput) => void; onCancel: () => void; saving: boolean }) {
  const [f, setF] = useState<FamilyMemberInput>(initial);
  const set = (k: keyof FamilyMemberInput, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const toggleCond = (c: string) => set('healthConditions', f.healthConditions.includes(c) ? f.healthConditions.filter((x) => x !== c) : [...f.healthConditions, c]);
  /**
   * A <label> wrapping its control, rather than a <span> beside it.
   *
   * The text was always there to read; it was not attached to anything, so a
   * screen reader announced seven of these as "combo box" and "spin button"
   * with no clue which was Weight and which was Goal. Wrapping is used instead
   * of htmlFor because it needs no id, and an id would have to be unique across
   * every member card on the page.
   */
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label style={{ display: 'block' }}><span style={lbl}>{label}</span>{children}</label>
  );
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16, border: '1px solid var(--accent)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        {/* Blank is an answer, and it has to survive the round trip.
            `+e.target.value` on an emptied field is 0, not null — so clearing
            your age used to send 0, which the server clamped to 1 and stored as
            a one-year-old. Every one of these now sends null when emptied, and
            the sex select has somewhere to put "we haven't said". */}
        <Field label="Sex"><select style={fld} value={f.sex ?? ''} onChange={(e) => set('sex', e.target.value || null)}><option value="">Not stated</option><option value="male">Male</option><option value="female">Female</option></select></Field>
        <Field label="Age"><input style={fld} type="number" value={f.age ?? ''} onChange={(e) => set('age', e.target.value === '' ? null : +e.target.value)} /></Field>
        <Field label="Height (cm)"><input style={fld} type="number" value={f.heightCm ?? ''} onChange={(e) => set('heightCm', e.target.value === '' ? null : +e.target.value)} /></Field>
        <Field label="Weight (kg)"><input style={fld} type="number" value={f.weightKg ?? ''} onChange={(e) => set('weightKg', e.target.value === '' ? null : +e.target.value)} /></Field>
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
                style={{ fontSize: 12.5, cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '6px 12px', fontFamily: 'inherit', fontWeight: 600, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--ink)' }}>
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
        <Button variant="accent" disabled={saving} onClick={() => onSave(f)}>{saving ? 'Saving…' : isSelf ? 'Save my profile' : `Save ${initial.name.split(' ')[0]}’s details`}</Button>
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
        <div className="flex-min">
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {m.name}
            {m.isSelf && <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· You</span>}
          </h4>
          {/* Only the parts we actually know. This was `{dietLabel} · {m.age}y`
              unconditionally, which renders "nully" the moment age can be null —
              and it always could have been; the column was lying about it. */}
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
            {[dietLabel, m.age != null ? `${m.age}y` : null, !m.privacy.weight && m.weightKg ? `${m.weightKg}kg` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: role.color, background: role.soft, borderRadius: 'var(--r-full)', padding: '3px 10px' }}>{role.label}</span>
      </div>

      {m.privacy.targets ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 12.5, color: 'var(--muted)' }}>
          🔒 Nutrition targets are private — the plan still portions their plate safely.
        </div>
      ) : m.bodyUnknown ? (
        // Not a number. A member whose body nobody has entered had one computed
        // from a 30-year-old man of 170 cm and 65 kg, printed here as theirs, and
        // their plate portioned from it.
        //
        // Who can act on this differs, so the sentence does too. A member the
        // owner typed in, they can fix — Edit is right there now. A real invited
        // citizen owns their own profile and the owner cannot touch it, so
        // telling them to go and add it would be telling them to do something
        // the server will refuse.
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 12.5, lineHeight: 1.6 }}>
          No targets for {m.name.split(' ')[0]} yet — {m.bodyUnknown.fields.join(', ').toLowerCase()} still to add.
          <span className="muted">
            {' '}Portions come from a body, and we would rather ask than use somebody else&rsquo;s.
            {m.userId !== null && !m.isSelf ? ` ${m.name.split(' ')[0]} adds this in their own Nutrition Hub.` : ''}
          </span>
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
          {m.healthConditions.map((c) => <span key={c} style={{ fontSize: 11, background: 'var(--warn-soft)', color: 'var(--warn-ink)', borderRadius: 'var(--r-full)', padding: '3px 9px', fontWeight: 600 }}>{c}</span>)}
        </div>
      )}
      {m.privacy.conditions && !m.isSelf && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>🔒 Health conditions private</p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {/* Edit exactly where the server will accept one: your own row, and the
            members you typed in yourself. `userId` is null for those and set for
            a real invited citizen, who owns their profile in their own hub —
            updateFamilyMember refuses that case and the button should not offer
            what the API will refuse. */}
        {(m.isSelf || m.userId === null) && <Button variant="line" size="sm" onClick={onEdit}>Edit</Button>}
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
        {/* The per-member check lived on the family landing page; the landing
            went (owner's call, 13 Aug) and the check moved HERE, beside the
            members it is about — a flag about somebody's portion sits next to
            the card where that somebody is managed. */}
        <div style={{ marginBottom: 18 }}>
          <FamilyDashboard />
        </div>
        <FamilyMealPlanningCard />
        <FamilyProfileCard />
        <PrivacyCard />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px' }}>
          <h3 style={{ fontSize: 17, margin: 0 }}>Household</h3>
          {editing === null && <Button variant="accent" onClick={() => setInviting(true)}>+ Add Member</Button>}
        </div>

        {members.isLoading && <Spinner label="Loading your household…" />}
        {members.isError && (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            We couldn’t load your household just now — nobody has been removed.
            Try again in a moment.
          </p>
        )}
        {members.data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {members.data.map((m) => editing === m.id ? (
              <div key={m.id} style={{ gridColumn: '1 / -1' }}>
                <EditMemberForm initial={toInput(m)} isSelf={m.isSelf} saving={update.isPending}
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

      </div>

      {inviting && (
        <AddHubMemberDialog
          moduleKey="nutrition"
          title="Add to Nutrition Family Hub"
          blurb="Add someone you cook for by their exact @handle."
          onClose={() => setInviting(false)}
        />
      )}
    </div>
  );
}
