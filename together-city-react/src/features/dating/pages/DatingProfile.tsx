import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFormValidation, ValidationSummary, FieldError, successToast } from '@/components/form-validation';
import { Button, Spinner } from '@/components/ui';
import { SearchSelect } from '@/components/SearchSelect';
import { MultiSelect } from '@/components/MultiSelect';
import type { LookupOption } from '@/api/lookups.api';
import { useDatingProfile, useUpsertDatingProfile, type UpsertProfileInput } from '../api';

const field: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 10,
  fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', boxSizing: 'border-box',
};
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', margin: '14px 0 6px' };

const INTERESTS = ['Travel', 'Movies', 'Music', 'Reading', 'Cooking', 'Fitness', 'Sports', 'Photography', 'Gaming', 'Art', 'Pets', 'Technology', 'Fashion', 'Nature'];
const TRAITS = ['Funny', 'Calm', 'Ambitious', 'Romantic', 'Adventurous', 'Introvert', 'Extrovert', 'Creative', 'Family-Oriented', 'Spiritual'];
const VALUES = ['Family', 'Honesty', 'Loyalty', 'Kindness', 'Career', 'Adventure', 'Personal Growth', 'Financial Stability'];
const DEAL_BREAKERS = ['Smoking', 'Drinking', 'Marriage Intentions', 'Wants Children', 'Distance'];
const AI_DIMENSIONS = ['Astrology compatibility', 'Numerology compatibility', 'Personality compatibility', 'Lifestyle compatibility', 'Interest match', 'Values match', 'Overall AI score'];

/** Height options (120–220 cm) — a numeric range, generated locally. */
const HEIGHTS: LookupOption[] = Array.from({ length: 220 - 120 + 1 }, (_, i) => {
  const cm = 120 + i;
  return { code: String(cm), label: `${cm} cm`, parentCode: null };
});

const MOD: Record<string, { label: string; bg: string; c: string }> = {
  approved: { label: '● Live — matching active', bg: '#e8f5e9', c: '#2e7d32' },
  pending: { label: '◌ Pending review', bg: '#fff8e1', c: '#9a7b2e' },
  review: { label: '⏳ In manual review', bg: '#fff8e1', c: '#9a7b2e' },
  rejected: { label: '✕ Not visible yet', bg: '#ffebee', c: '#c62828' },
};

interface DX {
  firstName?: string; country?: string; countryCode?: string; state?: string; stateCode?: string; city?: string;
  heightCm?: number | null; languages?: string[];
  photos?: string[]; selfieVerified?: boolean;
  relationshipGoal?: string; diet?: string; smoking?: string; drinking?: string; fitnessLevel?: string; education?: string; profession?: string;
  personalityTraits?: string[]; values?: string[];
  prefAgeMin?: number | null; prefAgeMax?: number | null; prefDistanceKm?: number | null; prefHeight?: string;
  prefDiet?: string; prefSmoking?: string; prefDrinking?: string; wantsChildren?: string; religion?: string;
  dealBreakers?: string[];
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)',
    }}>{children}</button>
  );
}

const Phase = ({ n, title }: { n: number; title: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 2px' }}>
    <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{n}</span>
    <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
  </div>
);

function resizePhoto(file: File, maxDim = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); if (!ctx) { reject(new Error('no canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

/** Dating Profile — 4-phase onboarding. Passes moderation before it's visible. */
export function DatingProfilePage() {
  const existing = useDatingProfile();
  const upsert = useUpsertDatingProfile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<UpsertProfileInput>({ gender: 'male', seeking: 'any', bio: '', birthDate: '', birthTime: '', birthPlace: '', interests: [] });
  const [dx, setDx] = useState<DX>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (existing.data) {
      const d = existing.data;
      setForm({ gender: d.gender, seeking: d.seeking, bio: d.bio ?? '', birthDate: d.birthDate, birthTime: d.birthTime ?? '', birthPlace: d.birthPlace ?? '', interests: d.interests });
      let ex: DX = {}; try { ex = d.extras ? JSON.parse(d.extras) : {}; } catch { ex = {}; }
      setDx(ex);
      setCollapsed(d.moderation !== 'rejected');
    }
  }, [existing.data]);

  // Global validation standard — the match engine needs these to work at all.
  // NOTE: must be called before any early return — hooks can't be conditional.
  const v = useFormValidation([
    { key: 'birthDate', label: 'Date of birth', valid: () => Boolean(form.birthDate), message: 'Enter your Date of birth.' },
    { key: 'bio', label: 'Bio', valid: () => (form.bio ?? '').trim().length >= 20, message: 'Write a short Bio (at least 20 characters).' },
    { key: 'interests', label: 'Interests', valid: () => (form.interests ?? []).length >= 3, message: 'Pick at least 3 Interests.' },
  ]);

  if (existing.isLoading) return <Spinner label="Loading your profile…" />;

  const setD = (patch: Partial<DX>) => setDx((prev) => ({ ...prev, ...patch }));
  const num = (v: string) => (v ? parseInt(v, 10) : null);
  const capToggle = (list: string[] | undefined, v: string, cap: number): string[] => {
    const arr = list ?? [];
    if (arr.includes(v)) return arr.filter((x) => x !== v);
    return arr.length >= cap ? arr : [...arr, v];
  };
  // Country defaults to India so State/City work without an extra tap.
  const countryCode = dx.countryCode ?? 'IN';

  const onPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = 10 - (dx.photos?.length ?? 0);
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    const urls: string[] = [];
    for (const f of chosen) { try { urls.push(await resizePhoto(f)); } catch { /* skip */ } }
    setD({ photos: [...(dx.photos ?? []), ...urls] });
  };
  const removePhoto = (i: number) => setD({ photos: (dx.photos ?? []).filter((_, idx) => idx !== i) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!v.validate()) return; // never save an incomplete dating profile
    const extras: DX = { ...dx };
    upsert.mutate(
      { ...form, interests: (form.interests ?? []), extras: JSON.stringify(extras) },
      { onSuccess: (p) => { setCollapsed(p.moderation !== 'rejected'); successToast('Dating profile saved successfully.'); } },
    );
  };

  const data = upsert.data ?? existing.data;
  const mod = data ? MOD[data.moderation] ?? MOD.approved : null;
  const photos = dx.photos ?? [];

  const StatusBanner = () => data && mod ? (
    <div style={{ marginTop: 14, background: mod.bg, color: mod.c, borderRadius: 12, padding: '11px 14px', fontSize: 13 }}>
      <strong>{mod.label}</strong>
      {data.notice && <div style={{ marginTop: 4 }}>{data.notice}</div>}
      {data.moderation !== 'approved' && data.moderationReasons.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{data.moderationReasons.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
    </div>
  ) : null;

  if (collapsed && existing.data) {
    const rows: [string, string][] = [
      ['Name', dx.firstName || '—'],
      ['Looking for', dx.relationshipGoal || '—'],
      ['Location', [dx.city, dx.state, dx.country].filter(Boolean).join(', ') || '—'],
      ['Height', dx.heightCm ? `${dx.heightCm} cm` : '—'],
      ['Languages', (dx.languages ?? []).join(', ') || '—'],
      ['Interests', (form.interests ?? []).join(', ') || '—'],
      ['Personality', (dx.personalityTraits ?? []).join(', ') || '—'],
      ['Values', (dx.values ?? []).join(', ') || '—'],
      ['Photos', `${photos.length}`],
      ['Your sign', data?.sign ?? '—'],
    ];
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 16px' }}>
        <div className="eyebrow">Dating Hub · Your profile</div>
        <h1 style={{ fontSize: 26 }}>Tell the stars about you</h1>
        <StatusBanner />
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Your dating profile</h3>
            <Button variant="line" size="sm" onClick={() => setCollapsed(false)}>Edit</Button>
          </div>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
              {photos.slice(0, 6).map((p, i) => <img key={i} src={p} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} />)}
            </div>
          )}
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
              <span className="muted" style={{ fontSize: 12.5, flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 13, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>This also appears on your <Link to="/profile" style={{ color: 'var(--accent)', fontWeight: 600 }}>main profile</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Dating Hub · Your profile</div>
      <h1 style={{ fontSize: 26 }}>Tell the stars about you</h1>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
        Four short screens (~3–5 min). Matching is astrology-first; only matches scoring 75%+ are ever shown. Your profile passes a safety check before it goes live.
      </p>
      <StatusBanner />

      <form onSubmit={submit}>
        <ValidationSummary missing={v.missing} />
        {/* Phase 1 — Basic info */}
        <Phase n={1} title="Basic information" />
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div><span style={label}>First name</span><input value={dx.firstName ?? ''} onChange={(e) => setD({ firstName: e.target.value })} style={field} /></div>
            <div><span style={label}>Gender</span>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as UpsertProfileInput['gender'] })} style={field}>
                <option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Non-binary</option>
              </select>
            </div>
            <div><span style={label}>Looking for</span>
              <select value={form.seeking} onChange={(e) => setForm({ ...form, seeking: e.target.value as UpsertProfileInput['seeking'] })} style={field}>
                <option value="any">Anyone</option><option value="male">Men</option><option value="female">Women</option><option value="nonbinary">Non-binary people</option>
              </select>
            </div>
            <div ref={v.reg('birthDate')}><span style={label}>Date of birth</span><input type="date" value={form.birthDate} onChange={(e) => { setForm({ ...form, birthDate: e.target.value }); v.clear('birthDate'); }} style={{ ...field, ...v.errStyle('birthDate') }} /><FieldError msg={v.errors.birthDate} /></div>
            <div><span style={label}>Time of birth <span style={{ textTransform: 'none' }}>(optional)</span></span><input type="time" value={form.birthTime ?? ''} onChange={(e) => setForm({ ...form, birthTime: e.target.value })} style={field} /></div>
            <div><span style={label}>Place of birth <span style={{ textTransform: 'none' }}>(optional)</span></span><input value={form.birthPlace ?? ''} placeholder="City" onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} style={field} /></div>

            <div><span style={label}>Country</span>
              <SearchSelect category="country" value={dx.country ?? 'India'} placeholder="Select country"
                onChange={(o) => setD({ country: o?.label, countryCode: o?.code, state: undefined, stateCode: undefined, city: undefined })} />
            </div>
            <div><span style={label}>State</span>
              <SearchSelect category="state" parent={countryCode} value={dx.state ?? ''} placeholder="Select state"
                onChange={(o) => setD({ state: o?.label, stateCode: o?.code, city: undefined })} />
            </div>
            <div><span style={label}>City</span>
              <SearchSelect category="city" parent={dx.stateCode} value={dx.city ?? ''} disabled={!dx.stateCode}
                placeholder={dx.stateCode ? 'Select city' : 'Pick a state first'}
                onChange={(o) => setD({ city: o?.label })} />
            </div>
            <div><span style={label}>Height</span>
              <SearchSelect options={HEIGHTS} value={dx.heightCm ? `${dx.heightCm} cm` : ''} placeholder="Select height"
                onChange={(o) => setD({ heightCm: o ? parseInt(o.code, 10) : null })} />
            </div>
          </div>

          <span style={label}>Languages spoken</span>
          <MultiSelect category="language" values={dx.languages ?? []} onChange={(v) => setD({ languages: v })} placeholder="Add languages…" ariaLabel="Languages spoken" />

          <span style={label}>Photos (3–10)</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={p} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover' }} />
                <button type="button" onClick={() => removePhoto(i)} aria-label="Remove"
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#c62828', color: '#fff', cursor: 'pointer', fontSize: 12 }}>×</button>
              </div>
            ))}
            {photos.length < 10 && (
              <button type="button" onClick={() => fileRef.current?.click()}
                style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed var(--line)', background: 'transparent', cursor: 'pointer', fontSize: 22, color: 'var(--muted)' }}>＋</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPhotos(e.target.files)} />
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{photos.length < 3 ? `Add at least ${3 - photos.length} more — a clear face photo first.` : 'First photo is your primary — make it a clear face photo.'}</p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!dx.selfieVerified} onChange={(e) => setD({ selfieVerified: e.target.checked })} />
            Selfie verification (optional) — confirm it’s really you
          </label>
        </div>

        {/* Phase 2 — About you */}
        <Phase n={2} title="About you" />
        <div className="card">
          <span style={label}>Relationship goal</span>
          <SearchSelect category="relationshipGoal" value={dx.relationshipGoal ?? ''} placeholder="What are you looking for?"
            onChange={(o) => setD({ relationshipGoal: o?.label })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div><span style={label}>Diet</span><SearchSelect category="diet" value={dx.diet ?? ''} placeholder="Select" onChange={(o) => setD({ diet: o?.label })} /></div>
            <div><span style={label}>Fitness level</span><SearchSelect category="exercise" value={dx.fitnessLevel ?? ''} placeholder="Select" onChange={(o) => setD({ fitnessLevel: o?.label })} /></div>
            <div><span style={label}>Smoking</span><SearchSelect category="smoking" value={dx.smoking ?? ''} placeholder="Select" onChange={(o) => setD({ smoking: o?.label })} /></div>
            <div><span style={label}>Drinking</span><SearchSelect category="alcohol" value={dx.drinking ?? ''} placeholder="Select" onChange={(o) => setD({ drinking: o?.label })} /></div>
            <div><span style={label}>Education</span><SearchSelect category="education" value={dx.education ?? ''} placeholder="Select" onChange={(o) => setD({ education: o?.label })} /></div>
            <div><span style={label}>Profession</span><SearchSelect category="occupation" value={dx.profession ?? ''} placeholder="Select" onChange={(o) => setD({ profession: o?.label })} /></div>
          </div>
          <span style={label}>Short bio (max 300)</span>
          <textarea ref={(el) => v.reg('bio')(el)} value={form.bio ?? ''} rows={3} maxLength={300} placeholder="A line or two — honest beats impressive." onChange={(e) => { setForm({ ...form, bio: e.target.value }); v.clear('bio'); }} style={{ ...field, resize: 'vertical', ...v.errStyle('bio') }} />
          <FieldError msg={v.errors.bio} />
          <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>{(form.bio ?? '').length}/300 · no phone numbers, socials or links — they’re auto-rejected.</p>
        </div>

        {/* Phase 3 — Personality & interests */}
        <Phase n={3} title="Personality & interests" />
        <div className="card">
          <span ref={v.reg('interests')} style={label}>Interests (up to 10, at least 3) · {(form.interests ?? []).length}/10</span>
          <FieldError msg={v.errors.interests} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{INTERESTS.map((v) => <Chip key={v} on={(form.interests ?? []).includes(v)} onClick={() => setForm({ ...form, interests: capToggle((form.interests ?? []), v, 10) })}>{v}</Chip>)}</div>
          <span style={label}>Personality traits (up to 8) · {(dx.personalityTraits ?? []).length}/8</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{TRAITS.map((v) => <Chip key={v} on={(dx.personalityTraits ?? []).includes(v)} onClick={() => setD({ personalityTraits: capToggle(dx.personalityTraits, v, 8) })}>{v}</Chip>)}</div>
          <span style={label}>Values (up to 5) · {(dx.values ?? []).length}/5</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{VALUES.map((v) => <Chip key={v} on={(dx.values ?? []).includes(v)} onClick={() => setD({ values: capToggle(dx.values, v, 5) })}>{v}</Chip>)}</div>
        </div>

        {/* Phase 4 — Match preferences */}
        <Phase n={4} title="Match preferences" />
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div><span style={label}>Age from</span><input type="number" min={18} max={99} value={dx.prefAgeMin ?? ''} onChange={(e) => setD({ prefAgeMin: num(e.target.value) })} style={field} /></div>
            <div><span style={label}>Age to</span><input type="number" min={18} max={99} value={dx.prefAgeMax ?? ''} onChange={(e) => setD({ prefAgeMax: num(e.target.value) })} style={field} /></div>
            <div><span style={label}>Distance (km)</span><input type="number" min={1} max={5000} value={dx.prefDistanceKm ?? ''} onChange={(e) => setD({ prefDistanceKm: num(e.target.value) })} style={field} /></div>
            <div><span style={label}>Height preference <span style={{ textTransform: 'none' }}>(optional)</span></span><input value={dx.prefHeight ?? ''} placeholder="e.g. 165–185cm" onChange={(e) => setD({ prefHeight: e.target.value })} style={field} /></div>
            <div><span style={label}>Diet</span><SearchSelect category="diet" value={dx.prefDiet ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ prefDiet: o?.label })} /></div>
            <div><span style={label}>Wants children</span><SearchSelect category="wantsChildren" value={dx.wantsChildren ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ wantsChildren: o?.label })} /></div>
            <div><span style={label}>Smoking</span><SearchSelect category="smoking" value={dx.prefSmoking ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ prefSmoking: o?.label })} /></div>
            <div><span style={label}>Drinking</span><SearchSelect category="alcohol" value={dx.prefDrinking ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ prefDrinking: o?.label })} /></div>
            <div><span style={label}>Religion <span style={{ textTransform: 'none' }}>(optional)</span></span><SearchSelect category="religion" value={dx.religion ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ religion: o?.label })} /></div>
          </div>
          <span style={label}>Deal breakers (optional)</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{DEAL_BREAKERS.map((v) => <Chip key={v} on={(dx.dealBreakers ?? []).includes(v)} onClick={() => setD({ dealBreakers: capToggle(dx.dealBreakers, v, 5) })}>{v}</Chip>)}</div>
        </div>

        {/* AI auto-calculated — no user input */}
        <div className="card" style={{ marginTop: 16, background: 'var(--accent-soft)', border: 'none' }}>
          <div className="eyebrow">✨ The AI calculates automatically</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>No input needed — from your details we compute your compatibility for every candidate:</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{AI_DIMENSIONS.map((d) => <span key={d} className="tag">{d}</span>)}</div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button type="submit" variant="accent" disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : existing.data ? 'Save profile' : 'Create profile'}</Button>
          {data?.sign && <span className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5 }}>✨ Your sign: <strong>{data.sign}</strong></span>}
        </div>
      </form>
    </div>
  );
}
