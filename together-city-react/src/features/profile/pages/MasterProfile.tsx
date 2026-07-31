import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@/components/ui';
import { profileApi, type MasterProfileView } from '../api';
import { useMasterProfile, useProfileCompletion } from '../hooks';

/**
 * The Master Profile screen (FE-3.1).
 *
 * §3's diagnosis is that identity and body data live in whichever hub happened
 * to need them first, so several screens keep their own copy and a missing copy
 * gets filled with a sample value. The API side of the fix has existed for a
 * while — GET/PATCH /profile/master, a version column for optimistic
 * concurrency, an audit trail of every change — and it was read by five hubs
 * with NO SCREEN TO EDIT IT. Height, weight, age and sex were set in
 * /nutrition/preferences, which is how a nutrition page came to own somebody's
 * sex and date of birth.
 *
 * This is that screen. Five sections, as the ticket asks, and one rule that
 * decides the shape of all of them: A FIELD IS OWNED BY EXACTLY ONE PLACE.
 *
 * So Identity, Body and Contact are edited here, because MasterProfile is where
 * they live. Diet and Medical are SHOWN here and edited where they are stored —
 * FoodPref and the medical hub — with a link. Rendering an editable copy of a
 * field this screen does not own would recreate the exact problem §3 is about,
 * one screen further along. BE-3.2's fan-out is what eventually moves them; a
 * form is not the place to pretend it already has.
 *
 * Autosave is per field, on blur, not on keystroke: a half-typed weight is not
 * a fact about anybody, and a PATCH per character makes the audit trail
 * unreadable.
 */

type Draft = Partial<MasterProfileView>;

const SECTIONS = [
  { id: 'identity', label: 'Identity' },
  { id: 'body', label: 'Body' },
  { id: 'diet', label: 'Diet' },
  { id: 'medical', label: 'Medical' },
  { id: 'contact', label: 'Contact' },
] as const;

const WHY_WE_ASK = {
  sexAtBirth:
    'Used only for health calculations — calorie and nutrient targets, and the reference ranges on '
    + 'your lab results. It is never shown to anyone else.',
  genderIdentity:
    'How Together City refers to you, and what your dating profile shows. It is never used in a '
    + 'health calculation.',
};

export function MasterProfile() {
  const master = useMasterProfile();
  const completion = useProfileCompletion();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useMutation({
    mutationFn: (patch: Draft) => profileApi.updateMaster(patch),
    onSuccess: (fresh, patch) => {
      // The server's answer replaces the draft for the fields it just took, so
      // a normalised value (a trimmed name, a rounded height) is what the field
      // shows rather than what was typed.
      setDraft((d) => {
        const next = { ...d };
        for (const k of Object.keys(patch)) delete next[k as keyof Draft];
        return next;
      });
      qc.setQueryData(['profile', 'master'], fresh);
      void qc.invalidateQueries({ queryKey: ['profile', 'completion'] });
      setSaved(Object.keys(patch)[0] ?? null);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(null), 2200);
    },
  });

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const v = useMemo(() => ({ ...(master.data ?? {}), ...draft }) as MasterProfileView, [master.data, draft]);
  const dirty = Object.keys(draft).length > 0;

  if (master.isLoading) return <Spinner label="Opening your profile…" />;
  if (!master.data) return <p className="muted" style={{ padding: 28 }}>We couldn’t load your profile. Reload to try again.</p>;

  const set = (k: keyof MasterProfileView, value: unknown) => setDraft((d) => ({ ...d, [k]: value }));
  const commit = (k: keyof MasterProfileView) => {
    if (!(k in draft)) return;              // nothing changed on this field
    save.mutate({ [k]: draft[k] } as Draft);
  };

  const field = (
    k: keyof MasterProfileView, label: string,
    input: React.ReactNode, hint?: string,
  ) => (
    <label key={k} style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
        {saved === k && <span style={{ color: '#2e7d32', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>saved</span>}
        {k in draft && saved !== k && <span style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>unsaved</span>}
      </span>
      <div style={{ marginTop: 4 }}>{input}</div>
      {hint && <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block', marginTop: 4 }}>{hint}</span>}
    </label>
  );

  const text = (k: keyof MasterProfileView, type = 'text') => (
    <input
      type={type}
      value={v[k] ?? ''}
      onChange={(e) => set(k, type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
      onBlur={() => commit(k)}
      style={inputStyle}
    />
  );

  const pct = completion.data?.percent ?? null;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Your profile</div>
      <h1 style={{ fontSize: 26 }}>Master Profile</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0', lineHeight: 1.6 }}>
        Every hub reads from here. Change something once and Nutrition, Medical, Fitness, Beauty and
        Dating all follow — you never enter it twice.
      </p>

      {/* Completeness, from the server's own count rather than a second one
          computed here. A meter that disagrees with the nudges it drives is
          worse than no meter. */}
      {pct !== null && (
        <div style={{ marginTop: 16, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <strong style={{ fontSize: 13.5 }}>Profile {pct}% complete</strong>
            {dirty && <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>unsaved changes</span>}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          {(completion.data?.nextUp ?? []).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(completion.data?.nextUp ?? []).slice(0, 3).map((n) => (
                <Link key={n.key} to={n.href} style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600 }}>{n.label} →</Link>
              ))}
            </div>
          )}
        </div>
      )}

      <nav style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '18px 0 6px' }}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{s.label}</a>
        ))}
      </nav>

      {save.isError && (
        <p style={{ color: '#c62828', fontSize: 12.5 }}>
          That didn’t save. Your change is still here — try again, or reload if someone else edited this profile.
        </p>
      )}

      {/* ── Identity ─────────────────────────────────────────────── */}
      <Section id="identity" title="Identity">
        {field('name', 'Name', text('name'))}
        {field('dateOfBirth', 'Date of birth',
          <input type="date" max={new Date().toISOString().slice(0, 10)}
            value={(v.dateOfBirth ?? '').slice(0, 10)}
            onChange={(e) => set('dateOfBirth', e.target.value || null)}
            onBlur={() => commit('dateOfBirth')} style={inputStyle} />,
          v.age != null ? `You are ${v.age}. Age is worked out from this rather than stored, so it is never out of date.` : 'Age is worked out from this rather than stored, so it is never out of date.')}

        {/* The two-field block the ticket asks for, each with why we ask. They
            are separate because they answer different questions and only one of
            them enters a formula. */}
        {field('sexAtBirth', 'Sex at birth',
          <select aria-label="Sex at birth" value={v.sexAtBirth ?? ''} onChange={(e) => set('sexAtBirth', e.target.value || null)} onBlur={() => commit('sexAtBirth')} style={inputStyle}>
            <option value="">Not set</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="intersex">Intersex</option>
            <option value="preferNotToSay">Prefer not to say</option>
          </select>,
          WHY_WE_ASK.sexAtBirth)}

        {field('genderIdentity', 'Gender',
          <select aria-label="Gender" value={v.genderIdentity ?? ''} onChange={(e) => set('genderIdentity', e.target.value || null)} onBlur={() => commit('genderIdentity')} style={inputStyle}>
            <option value="">Not set</option>
            <option value="female">Woman</option>
            <option value="male">Man</option>
            <option value="nonBinary">Non-binary</option>
            <option value="other">Other</option>
          </select>,
          WHY_WE_ASK.genderIdentity)}

        {v.genderIdentity === 'other' && field('genderIdentityOther', 'In your words', text('genderIdentityOther'))}
        {field('occupation', 'Occupation', text('occupation'))}
      </Section>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <Section id="body" title="Body">
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 12px' }}>
          These set your calorie and nutrient targets. Leave one blank and we say so rather than
          working them out from somebody else’s body.
        </p>
        {field('heightCm', 'Height (cm)', text('heightCm', 'number'))}
        {field('weightKg', 'Weight (kg)', text('weightKg', 'number'))}
      </Section>

      {/* ── Diet ─────────────────────────────────────────────────── */}
      <Section id="diet" title="Diet">
        <Elsewhere
          what="Your diet, allergies and the foods you avoid"
          where="/nutrition/preferences"
          label="Food preferences"
        />
      </Section>

      {/* ── Medical ──────────────────────────────────────────────── */}
      <Section id="medical" title="Medical">
        <Elsewhere
          what="Your conditions, medicines and lab results"
          where="/medical/records"
          label="Medical hub"
        />
      </Section>

      {/* ── Contact ──────────────────────────────────────────────── */}
      <Section id="contact" title="Contact">
        {field('phone', 'Phone', text('phone', 'tel'))}
        {field('city', 'City', text('city'))}
        {field('state', 'State', text('state'))}
        {field('country', 'Country', text('country'))}
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 22, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>{title}</h2>
      <div className="card" style={{ padding: '16px 18px' }}>{children}</div>
    </section>
  );
}

/**
 * A field this screen shows the existence of but does not own.
 *
 * The alternative — an editable copy here as well — is precisely the problem §3
 * describes, moved one screen along. One field, one owner, one place it is
 * written.
 */
function Elsewhere({ what, where, label }: { what: string; where: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, flex: 1, minWidth: 180 }}>{what}</span>
      <Link to={where}
        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 10, border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
        {label} →
      </Link>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '9px 11px', border: '1px solid var(--line)',
  borderRadius: 10, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)',
  outline: 'none', boxSizing: 'border-box',
};
