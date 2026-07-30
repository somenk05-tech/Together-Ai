import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Spinner, EmptyValue } from '@/components/ui';
import { profileApi, type MasterProfileView } from '../api';

/**
 * Two questions, asked separately (review p2).
 *
 * The copy here is the promise the app makes, and the same two promises are
 * asserted server-side in `profile/sex-and-gender.spec.ts` — the clinical field
 * is never shown to anyone, the social field never enters a calculation. They
 * are written in both places because copy belongs beside the control that shows
 * it and the rule belongs beside the code that enforces it. If either promise is
 * ever softened, both should move.
 *
 * Why a card rather than one dropdown: the single `gender` field this replaces
 * was silently discarded by the nutrition and fitness engines whenever the
 * answer was not male or female, so a non-binary citizen got no clinical
 * personalisation and no explanation of why. Asking the clinical question
 * separately is what lets them have accurate targets without being misgendered.
 */

const SEX_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'intersex', label: 'Intersex' },
  { value: 'preferNotToSay', label: 'Prefer not to say' },
] as const;

const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonBinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
] as const;

const WHY = {
  sex: 'Used only for health calculations — calorie and nutrient targets, and the reference ranges on your lab results. It is never shown to anyone else.',
  gender: 'How Together City refers to you, and what your dating profile shows. It is never used in a health calculation.',
};

type Sex = MasterProfileView['sexAtBirth'];
type Gender = MasterProfileView['genderIdentity'];

export function SexAndGenderCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [sex, setSex] = useState<Sex>(null);
  const [gender, setGender] = useState<Gender>(null);
  const [otherText, setOtherText] = useState('');

  const master = useQuery({ queryKey: ['profile', 'master'], queryFn: () => profileApi.master() });

  const save = useMutation({
    mutationFn: () => profileApi.updateMaster({
      sexAtBirth: sex ?? null,
      genderIdentity: gender ?? null,
      // Only meaningful alongside "other", and cleared otherwise so a stale
      // free-text answer cannot outlive the selection that asked for it.
      genderIdentityOther: gender === 'other' ? otherText.trim() || null : null,
    }),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['profile'] }),
        // A clinical sex arriving can turn an assumed target into a real one.
        qc.invalidateQueries({ queryKey: ['nutrition'] }),
        qc.invalidateQueries({ queryKey: ['fitness'] }),
      ]);
    },
  });

  if (master.isLoading) return <Card><Spinner label="Loading your profile…" /></Card>;
  const m = master.data;

  const beginEdit = () => {
    setSex(m?.sexAtBirth ?? null);
    setGender(m?.genderIdentity ?? null);
    setOtherText(m?.genderIdentityOther ?? '');
    setEditing(true);
  };

  if (!editing) {
    return (
      <Card>
        <Header />
        <Row label="Sex at birth" value={labelFor(SEX_OPTIONS, m?.sexAtBirth)} note={WHY.sex} />
        <Row
          label="Gender"
          value={m?.genderIdentity === 'other'
            ? (m?.genderIdentityOther?.trim() || 'Other')
            : labelFor(GENDER_OPTIONS, m?.genderIdentity)}
          note={WHY.gender}
          last
        />
        <Button variant="line" size="sm" style={{ marginTop: 14 }} onClick={beginEdit}>
          {m?.sexAtBirth || m?.genderIdentity ? 'Change' : 'Add'}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <Header />
      <Field label="Sex at birth" note={WHY.sex}>
        <Choices options={SEX_OPTIONS} value={sex} onChange={(v) => setSex(v as Sex)} />
      </Field>
      <Field label="Gender" note={WHY.gender}>
        <Choices options={GENDER_OPTIONS} value={gender} onChange={(v) => setGender(v as Gender)} />
        {gender === 'other' && (
          <input
            className="tc-field"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="In your own words"
            maxLength={40}
            aria-label="Describe your gender"
            style={{
              marginTop: 10, width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit',
              borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)',
            }}
          />
        )}
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Button variant="accent" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      {save.isError && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--red, #c0392b)', margin: '10px 0 0' }}>
          Couldn&rsquo;t save that just now. Try again in a moment.
        </p>
      )}
    </Card>
  );
}

function Header() {
  return (
    <>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Sex and gender</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
        Two separate questions, because they are used for two different things.
        Either can be left blank.
      </p>
    </>
  );
}

function Row({ label, value, note, last }: { label: string; value?: string; note: string; last?: boolean }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span className="muted" style={{ fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 13.5 }}>{value ?? <EmptyValue label={label} />}</span>
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 0', lineHeight: 1.45 }}>{note}</p>
    </div>
  );
}

function Field({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 18px' }}>
      <legend style={{ fontSize: 13.5, fontWeight: 600, padding: 0, marginBottom: 4 }}>{label}</legend>
      <p className="muted" style={{ fontSize: 11.5, margin: '0 0 10px', lineHeight: 1.45 }}>{note}</p>
      {children}
    </fieldset>
  );
}

function Choices({ options, value, onChange }: {
  options: readonly { value: string; label: string }[];
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            // Pressing the current answer clears it. Nothing here is required,
            // and without this "prefer not to say" would be the only way out of
            // an answer given by accident — which is not the same statement.
            onClick={() => onChange(on ? null : o.value)}
            aria-pressed={on}
            style={{
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              padding: '9px 14px', borderRadius: 999,
              border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
              background: on ? 'var(--accent)' : 'var(--card)',
              color: on ? '#fff' : 'var(--ink-soft)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function labelFor(options: readonly { value: string; label: string }[], v?: string | null): string | undefined {
  return options.find((o) => o.value === v)?.label;
}
