import { useEffect, useState } from 'react';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useBeautyProfile, useSaveBeautyProfile } from '../api';

const SKIN_TYPES = [
  { key: 'dry', label: 'Dry' }, { key: 'oily', label: 'Oily' },
  { key: 'combination', label: 'Combination' }, { key: 'normal', label: 'Normal' },
  { key: 'sensitive', label: 'Sensitive' },
];
const HAIR_TYPES = [
  { key: 'straight', label: 'Straight' }, { key: 'wavy', label: 'Wavy' },
  { key: 'curly', label: 'Curly' }, { key: 'coily', label: 'Coily' },
];
const CONCERNS = [
  { key: 'dryness', label: 'Dryness' }, { key: 'dullness', label: 'Dullness' },
  { key: 'acne', label: 'Breakouts' }, { key: 'aging', label: 'Fine lines' },
  { key: 'pigmentation', label: 'Dark spots' }, { key: 'sensitivity', label: 'Sensitivity' },
  { key: 'hairLoss', label: 'Hair thinning' },
];

function Choice({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ cursor: 'pointer', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
        border: '1.5px solid var(--line)', background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)' }}>
      {label}
    </button>
  );
}

/** Skin & Hair Profile — what the user tells us, saved and used to personalise the market. */
export function Profile() {
  const profile = useBeautyProfile();
  const save = useSaveBeautyProfile();
  const [skinType, setSkinType] = useState('normal');
  const [hairType, setHairType] = useState('straight');
  const [concerns, setConcerns] = useState<string[]>([]);

  useEffect(() => {
    if (profile.data) {
      setSkinType(profile.data.skinType);
      setHairType(profile.data.hairType);
      setConcerns(profile.data.concerns);
    }
  }, [profile.data]);

  if (profile.isLoading) return <Spinner label="Loading your beauty profile…" />;
  if (profile.isError) return <EmptyState title="Couldn't load your profile" hint="Start the backend and reload." />;

  const toggle = (k: string) => setConcerns((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Beauty Market · Profile</div>
      <h1 style={{ fontSize: 26 }}>Your skin & hair</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        Tell us your skin type, hair type and what you'd like to work on. We'll match the shelf to you —
        and, with your consent, layer in what your blood markers suggest.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Skin type</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {SKIN_TYPES.map((s) => <Choice key={s.key} on={skinType === s.key} label={s.label} onClick={() => setSkinType(s.key)} />)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Hair type</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {HAIR_TYPES.map((h) => <Choice key={h.key} on={hairType === h.key} label={h.label} onClick={() => setHairType(h.key)} />)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="eyebrow">Concerns <span className="muted" style={{ fontWeight: 400 }}>· pick any</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {CONCERNS.map((c) => <Choice key={c.key} on={concerns.includes(c.key)} label={c.label} onClick={() => toggle(c.key)} />)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="accent" disabled={save.isPending}
          onClick={() => save.mutate({ skinType, hairType, concerns })}>
          {save.isPending ? 'Saving…' : 'Save profile'}
        </Button>
        {save.isSuccess && <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>✓ Saved — the market is now tuned to you</span>}
      </div>
    </div>
  );
}
