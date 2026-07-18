import { useEffect, useState, type FormEvent } from 'react';
import { Button, Spinner } from '@/components/ui';
import { useDatingProfile, useUpsertDatingProfile, type UpsertProfileInput } from '../api';

const field: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12,
  fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'var(--card)',
};
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', margin: '14px 0 6px' };

/** Dating Profile — birth details power the astrology-first matching. */
export function DatingProfilePage() {
  const existing = useDatingProfile();
  const upsert = useUpsertDatingProfile();

  const [form, setForm] = useState<UpsertProfileInput>({
    gender: 'male', seeking: 'any', bio: '', birthDate: '', birthPlace: '', interests: [],
  });
  const [interestsText, setInterestsText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing.data) {
      setForm({
        gender: existing.data.gender, seeking: existing.data.seeking,
        bio: existing.data.bio ?? '', birthDate: existing.data.birthDate,
        birthPlace: existing.data.birthPlace ?? '', interests: existing.data.interests,
      });
      setInterestsText(existing.data.interests.join(', '));
    }
  }, [existing.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const interests = interestsText.split(',').map((s) => s.trim()).filter(Boolean);
    upsert.mutate({ ...form, interests }, { onSuccess: () => setSaved(true) });
  };

  if (existing.isLoading) return <Spinner label="Loading your profile…" />;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Dating Hub · Your profile</div>
      <h1 style={{ fontSize: 26 }}>Tell the stars about you</h1>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
        Matching is astrology-first: your birth details and interests shape who the city curates for you.
        Only matches scoring 75% or higher are ever shown.
      </p>

      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
          <div>
            <span style={label}>I am</span>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as UpsertProfileInput['gender'] })} style={field}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="nonbinary">Non-binary</option>
            </select>
          </div>
          <div>
            <span style={label}>Seeking</span>
            <select value={form.seeking} onChange={(e) => setForm({ ...form, seeking: e.target.value as UpsertProfileInput['seeking'] })} style={field}>
              <option value="any">Anyone</option>
              <option value="male">Men</option>
              <option value="female">Women</option>
              <option value="nonbinary">Non-binary people</option>
            </select>
          </div>
          <div>
            <span style={label}>Birth date</span>
            <input type="date" required value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} style={field} />
          </div>
          <div>
            <span style={label}>Birth place</span>
            <input value={form.birthPlace ?? ''} placeholder="City" onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} style={field} />
          </div>
        </div>

        <span style={label}>About you</span>
        <textarea value={form.bio ?? ''} rows={3} placeholder="A line or two — honest beats impressive."
          onChange={(e) => setForm({ ...form, bio: e.target.value })} style={{ ...field, resize: 'vertical' }} />

        <span style={label}>Interests (comma-separated)</span>
        <input value={interestsText} placeholder="travel, food, music" onChange={(e) => setInterestsText(e.target.value)} style={field} />

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="submit" variant="accent" disabled={upsert.isPending}>
            {upsert.isPending ? 'Saving…' : existing.data ? 'Update profile' : 'Create profile'}
          </Button>
          {(saved || existing.data) && upsert.data?.sign && (
            <span className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5 }}>
              ✨ Your sign: <strong>{upsert.data.sign}</strong>
            </span>
          )}
          {!upsert.data?.sign && existing.data?.sign && (
            <span className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5 }}>
              ✨ Your sign: <strong>{existing.data.sign}</strong>
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
