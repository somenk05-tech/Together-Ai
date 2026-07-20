import { useState } from 'react';
import { Hero, Button, Spinner } from '@/components/ui';
import {
  useFamilyMembers, useFamilyMemberMutations, useFamilyProfile,
  useHouseholdInvites, useInviteHousehold, useRespondHouseholdInvite,
} from '@/features/nutrition/hooks';
import { nutritionApi } from '@/features/nutrition/api';
import type { FamilyMemberProfile, FamilyMemberInput, HouseholdRole, HouseholdSearchResult } from '@/features/nutrition/api';

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
const INVITE_ROLES: HouseholdRole[] = ['adult', 'child', 'guest'];

const fld: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', display: 'block', marginBottom: 4 };

const initialsOf = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/* ─────────────────────────── Search + invite modal ─────────────────────────── */
function InviteModal({ onClose }: { onClose: () => void }) {
  const invite = useInviteHousehold();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<HouseholdRole>('adult');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<HouseholdSearchResult | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const doSearch = async () => {
    if (!q.trim()) return;
    setSearching(true); setResult(null); setSent(null); setErr(null);
    try { setResult(await nutritionApi.searchHouseholdUser(q.trim())); }
    catch { setErr('Search failed — try again.'); }
    finally { setSearching(false); }
  };
  const send = () => {
    setErr(null);
    invite.mutate({ userRef: result?.user?.id ?? q.trim(), role }, {
      onSuccess: (r) => setSent(r.message),
      onError: () => setErr('Could not send the invitation.'),
    });
  };

  const rel = result?.relationship;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,14,.5)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 460, width: '100%', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Invite to your Household</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>Find a Together City member by their user ID or @username. This is private to the Nutrition Hub — it never adds them as a friend or social connection.</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginTop: 16 }}>
          <span style={lbl}>Together City User ID or @username</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={fld} value={q} placeholder="e.g. @priya or a user ID"
              onChange={(e) => { setQ(e.target.value); setResult(null); setSent(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } }} />
            <Button variant="line" onClick={doSearch} disabled={searching || !q.trim()}>{searching ? '…' : 'Search'}</Button>
          </div>
        </div>

        {result && !result.found && (
          <p style={{ color: '#c0392b', fontSize: 13, marginTop: 14 }}>No Together City member matches “{q.trim()}”. Check the ID or username and try again.</p>
        )}

        {result?.found && result.user && (
          <div style={{ marginTop: 16, border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="av" style={{ width: 46, height: 46, fontSize: 16, overflow: 'hidden', backgroundImage: result.user.profileImage ? `url(${result.user.profileImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                {!result.user.profileImage && initialsOf(result.user.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ margin: 0, fontSize: 15.5 }}>{result.user.name}</h4>
                <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>@{result.user.handle}</p>
              </div>
            </div>

            {rel === 'self' && <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>That’s you — you’re the head of this household.</p>}
            {rel === 'member' && <p style={{ fontSize: 12.5, marginTop: 12, color: '#2e7d4f', fontWeight: 600 }}>✓ Already in your household.</p>}
            {rel === 'pending' && <p style={{ fontSize: 12.5, marginTop: 12, color: '#b0803a', fontWeight: 600 }}>⏳ Invitation already pending.</p>}

            {(rel === 'none' || rel === 'pending') && !sent && (
              <div style={{ marginTop: 14 }}>
                <span style={lbl}>Household role</span>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {INVITE_ROLES.map((r) => (
                    <button key={r} type="button" onClick={() => setRole(r)}
                      style={{ cursor: 'pointer', flex: 1, borderRadius: 999, padding: '7px 0', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                        border: `1.5px solid ${role === r ? ROLE_META[r].color : 'var(--line)'}`, background: role === r ? ROLE_META[r].soft : 'transparent', color: role === r ? ROLE_META[r].color : 'var(--ink)' }}>
                      {ROLE_META[r].label}
                    </button>
                  ))}
                </div>
                <Button variant="accent" onClick={send} disabled={invite.isPending} style={{ width: '100%' }}>
                  {invite.isPending ? 'Sending…' : 'Send household invite →'}
                </Button>
              </div>
            )}
          </div>
        )}

        {sent && (
          <div style={{ marginTop: 16, background: 'var(--accent-soft)', borderRadius: 12, padding: 14 }}>
            <strong style={{ fontSize: 13.5, color: 'var(--accent)' }}>✓ Invitation sent</strong>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>They’ll see “{sent}” in Nutrition Hub and can Accept or Decline.</p>
            <Button variant="line" size="sm" onClick={onClose}>Done</Button>
          </div>
        )}
        {err && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 12 }}>{err}</p>}
      </div>
    </div>
  );
}

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
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>{dietLabel} · {m.age}y{m.weightKg ? ` · ${m.weightKg}kg` : ''}</p>
        </div>
        <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: role.color, background: role.soft, borderRadius: 999, padding: '3px 10px' }}>{role.label}</span>
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
      <Hero image="/assets/img/nutrition-hub--main-pages--family--connect-family.webp" eyebrow="Family Nutrition · 01"
        title="Household Members"
        sub="Invite the people you cook for by their Together City ID — they accept, and their own diet, goals and health conditions shape the shared family plan. Private to the Nutrition Hub; never a social connection." />

      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <InvitesInbox />
        <FamilyProfileCard />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px' }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>Household</h3>
          {editing === null && <Button variant="accent" onClick={() => setInviting(true)}>+ Add member</Button>}
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

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
    </div>
  );
}
