import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFormValidation, ValidationSummary, FieldError, successToast } from '@/components/form-validation';
import { Button, Spinner } from '@/components/ui';
import { SearchSelect } from '@/components/SearchSelect';
import { MultiSelect } from '@/components/MultiSelect';
import type { LookupOption } from '@/api/lookups.api';
import { useDatingProfile, useUpsertDatingProfile, useDeleteDatingProfile, type UpsertProfileInput, type Visibility, type ProfileCompletion } from '../api';
import { useMasterProfile } from '@/features/profile/hooks';
import { MasterLockedNote, masterLockedStyle } from '@/features/profile/MasterLockedField';

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
  photos?: string[]; selfieVerified?: boolean; selfiePhoto?: string; selfieVerifiedAt?: string;
  relationshipGoal?: string; diet?: string; smoking?: string; drinking?: string; fitnessLevel?: string; education?: string; profession?: string;
  personalityTraits?: string[]; values?: string[];
  prefAgeMin?: number | null; prefAgeMax?: number | null; prefDistanceKm?: number | null; prefHeight?: string;
  prefDiet?: string; prefSmoking?: string; prefDrinking?: string; wantsChildren?: string; religion?: string;
  partnerLocationMode?: 'any' | 'specific';
  partnerCountry?: string; partnerCountryCode?: string; partnerState?: string; partnerStateCode?: string; partnerCity?: string;
  dealBreakers?: string[];
  visibility?: Visibility; minMatchScore?: number;
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

/** Circular completion ring + AI suggestions for what to add next. */
function CompletionCard({ completion }: { completion?: ProfileCompletion }) {
  if (!completion) return null;
  const pct = Math.max(0, Math.min(100, completion.percent));
  const ring = `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--line) 0deg)`;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 64, height: 64, flex: 'none', borderRadius: '50%', background: ring, display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800 }}>{pct}%</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Dating Profile · {pct}% Complete</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>
            {completion.complete ? 'Your profile is fully complete — great match quality.' : 'Complete your profile to improve your match quality.'}
          </p>
        </div>
      </div>
      {completion.suggestions.length > 0 && (
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {completion.suggestions.map((s) => (
            <li key={s.key} style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{s.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const VIS_OPTIONS: { key: Visibility; label: string; hint: string }[] = [
  { key: 'everyone', label: 'Visible to everyone who matches', hint: 'Anyone you score ≥75% with can see you.' },
  { key: 'threshold', label: 'Visible only above a compatibility threshold', hint: 'Only people above your chosen score see you.' },
  { key: 'paused', label: 'Pause my profile', hint: 'Temporarily hidden from matching — nothing is deleted.' },
  { key: 'hidden', label: 'Hide my profile', hint: 'Fully hidden from the matching pool.' },
];

/** Profile visibility controls + delete. */
function VisibilityCard({ visibility, minScore, onChange, onDelete, deleting }: {
  visibility: Visibility; minScore: number;
  onChange: (v: Visibility, min: number) => void; onDelete: () => void; deleting: boolean;
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>🔒 Profile visibility</h3>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>Control who can see you in the matching pool.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {VIS_OPTIONS.map((o) => {
          const active = visibility === o.key;
          return (
            <label key={o.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`, background: active ? 'var(--accent-soft)' : 'transparent' }}>
              <input type="radio" name="visibility" checked={active} onChange={() => onChange(o.key, minScore)} style={{ marginTop: 2 }} />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 600, display: 'block' }}>{o.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>{o.hint}</span>
                {o.key === 'threshold' && active && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <input type="range" min={75} max={95} step={1} value={minScore} onChange={(e) => onChange('threshold', parseInt(e.target.value, 10))} style={{ flex: 1 }} />
                    <strong style={{ fontSize: 13 }}>{minScore}%+</strong>
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <Button variant="line" size="sm" disabled={deleting}
          onClick={() => { if (window.confirm('Delete your dating profile? This removes you from all matches and cannot be undone.')) onDelete(); }}
          style={{ color: '#c62828', borderColor: '#f0b0b0' }}>
          {deleting ? 'Deleting…' : 'Delete dating profile'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Camera-only verification. The verified badge is EARNED by capturing a live
 * selfie through the device camera — there is no checkbox and no way to mark
 * yourself verified by uploading a photo. The captured selfie is stored so the
 * backend can later run a real face-match against the profile photos.
 */
function SelfieVerify({ verified, onCapture, onClear }: {
  verified: boolean; onCapture: (dataUrl: string) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  useEffect(() => () => stop(), []);

  const start = async () => {
    setErr(null); setReady(false); setOpen(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr('Your browser or device doesn’t support camera capture, so verification isn’t available here.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
        setReady(true);
      }
    } catch {
      setErr('Camera access is required to get verified. Please allow the camera and try again.');
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    const maxDim = 480;
    const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) { setBusy(false); return; }
    ctx.drawImage(v, 0, 0, w, h);
    onCapture(c.toDataURL('image/jpeg', 0.85));
    setBusy(false); stop(); setOpen(false);
  };

  const close = () => { stop(); setOpen(false); };

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(12,10,9,.62)', display: 'grid', placeItems: 'center', padding: 16 };
  const sheet: React.CSSProperties = { width: '100%', maxWidth: 380, background: 'var(--card)', borderRadius: 18, padding: 18, boxShadow: 'var(--shadow)' };

  return (
    <div style={{ marginTop: 12 }}>
      {verified ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700, color: '#2f9be6' }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 18, height: 18, borderRadius: '50%', background: '#2f9be6', color: '#fff', fontSize: 11 }}>✓</span>
            Camera verified
          </span>
          <button type="button" onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Redo</button>
        </div>
      ) : (
        <button type="button" onClick={start}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5,
            color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 999, padding: '9px 16px' }}>
          📷 Get verified with your camera
        </button>
      )}
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Take a live selfie to earn the blue verified badge. Only camera-verified members are marked verified — you can’t verify by uploading a photo.
      </p>

      {open && (
        <div role="dialog" aria-modal="true" style={overlay} onClick={close}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Camera verification</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>Center your face in the frame and capture a live selfie. This isn’t added to your photos.</p>
            {err ? (
              <div style={{ background: '#ffebee', color: '#c62828', borderRadius: 12, padding: '12px 14px', fontSize: 13 }}>{err}</div>
            ) : (
              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '3 / 4' }}>
                <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                {!ready && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13 }}>Starting camera…</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              <Button variant="line" size="sm" onClick={close}>Cancel</Button>
              {err
                ? <Button variant="accent" size="sm" onClick={start}>Try again</Button>
                : <Button variant="accent" size="sm" disabled={!ready || busy} onClick={capture}>{busy ? 'Capturing…' : 'Capture selfie'}</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const del = useDeleteDatingProfile();
  const master = useMasterProfile();
  const dobLocked = Boolean(master.data?.dateOfBirth);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<UpsertProfileInput>({ gender: 'male', seeking: 'any', bio: '', birthDate: '', birthTime: '', birthPlace: '', interests: [] });
  const [dx, setDx] = useState<DX>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const d = existing.data as (typeof existing.data & { saved?: boolean; name?: string; country?: string | null; state?: string | null; city?: string | null; heightCm?: number | null; photo?: string | null }) | null;
    if (!d) return;
    const isSaved = (d as { saved?: boolean }).saved !== false; // prefill objects carry saved:false
    setForm({
      gender: (d.gender as UpsertProfileInput['gender']) ?? 'male',
      seeking: (d.seeking as UpsertProfileInput['seeking']) ?? 'any',
      bio: d.bio ?? '', birthDate: d.birthDate ?? '', birthTime: d.birthTime ?? '',
      birthPlace: d.birthPlace ?? '', interests: d.interests ?? [],
    });
    if (isSaved) {
      let ex: DX = {}; try { ex = d.extras ? JSON.parse(d.extras) : {}; } catch { ex = {}; }
      setDx(ex);
      setCollapsed(d.moderation !== 'rejected');
    } else {
      // First-time open: seed the location/name/height fields the form shows from
      // the Master Profile prefill (spec: auto-populate, never ask twice).
      setDx((prev) => ({
        ...prev,
        firstName: prev.firstName || d.name || undefined,
        country: prev.country || d.country || undefined,
        state: prev.state || d.state || undefined,
        city: prev.city || d.city || undefined,
        heightCm: prev.heightCm || d.heightCm || undefined,
        // Reuse the Master Profile photo as the first dating photo (spec §4).
        photos: prev.photos && prev.photos.length ? prev.photos : (d.photo ? [d.photo] : prev.photos),
      }));
    }
  }, [existing.data]);

  // Date of birth is owned by the Master Profile — keep the locked field in sync.
  useEffect(() => {
    const dob = master.data?.dateOfBirth;
    if (!dob) return;
    const iso = new Date(dob).toISOString().slice(0, 10);
    if (iso && !isNaN(new Date(dob).getTime())) setForm((f) => (f.birthDate === iso ? f : { ...f, birthDate: iso }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master.data?.dateOfBirth]);

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

  // A prefill (saved:false) is NOT a saved profile — don't show status/summary for it.
  const saved = Boolean(existing.data) && (existing.data as { saved?: boolean }).saved !== false;
  const data = upsert.data ?? (saved ? existing.data : null);
  const mod = data ? MOD[data.moderation] ?? MOD.approved : null;
  const photos = dx.photos ?? [];
  const completion = upsert.data?.completion ?? (existing.data as { completion?: ProfileCompletion } | null)?.completion;
  const visibility: Visibility = dx.visibility ?? 'everyone';
  const minScore = dx.minMatchScore ?? 75;
  const onDelete = () => del.mutate(undefined, { onSuccess: () => { setCollapsed(false); setDx({}); successToast('Dating profile deleted.'); } });

  const StatusBanner = () => data && mod ? (
    <div style={{ marginTop: 14, background: mod.bg, color: mod.c, borderRadius: 12, padding: '11px 14px', fontSize: 13 }}>
      <strong>{mod.label}</strong>
      {data.notice && <div style={{ marginTop: 4 }}>{data.notice}</div>}
      {data.moderation !== 'approved' && data.moderationReasons.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{data.moderationReasons.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
    </div>
  ) : null;

  if (collapsed && saved) {
    const displayName = dx.firstName || 'Your profile';
    // The verified badge is EARNED by a live camera selfie only — a self-ticked
    // flag with no captured selfie never shows as verified.
    const verified = Boolean(dx.selfieVerified && dx.selfiePhoto);
    const goal = dx.relationshipGoal || 'a connection';
    const location = [dx.city, dx.state, dx.country].filter(Boolean).join(', ');
    const sign = data?.sign ?? '—';
    const hero = photos[0];
    const rightPhotos = photos.slice(1, 3);
    const age = form.birthDate && !isNaN(new Date(form.birthDate).getTime())
      ? Math.floor((Date.now() - new Date(form.birthDate).getTime()) / (365.25 * 86_400_000)) : null;

    // The SAME fields a match sees on your profile detail (nothing private).
    const facts = [
      dx.profession, dx.education, dx.heightCm ? `${dx.heightCm} cm` : null,
      [dx.city, dx.state].filter(Boolean).join(', ') || null,
      (dx.languages ?? []).length ? (dx.languages ?? []).join(', ') : null,
      sign !== '—' ? sign : null,
    ].filter(Boolean) as string[];
    const lifestyle = [dx.diet, dx.smoking && `${dx.smoking} smoker`, dx.drinking && `${dx.drinking} drinker`, dx.fitnessLevel].filter(Boolean) as string[];
    const traitPills = [...(dx.values ?? []), ...(dx.personalityTraits ?? []), ...lifestyle];
    const interests = form.interests ?? [];

    const photoBox: React.CSSProperties = { position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'var(--paper)' };
    const cover: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
    const sectionH: React.CSSProperties = { margin: '18px 0 8px', fontSize: 15 };
    const pill: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 999, padding: '5px 13px', fontSize: 12.5, background: 'var(--accent-soft)' };

    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 40px' }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Dating Hub · Your profile</div>
        <StatusBanner />
        {completion && !completion.complete && <CompletionCard completion={completion} />}

        {/* Preview banner — this card is exactly what a match sees */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 14, padding: '11px 14px' }}>
          <span aria-hidden style={{ fontSize: 16 }}>👁</span>
          <span style={{ fontSize: 12.8, color: 'var(--ink)', lineHeight: 1.45 }}>
            <strong>This is exactly how your matches see you.</strong> Private settings like your visibility and preferences are never shown here.
          </span>
        </div>

        <div className="card" style={{ marginTop: 12, padding: 16, borderRadius: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 19 }}>Profile preview</h3>
            <button type="button" onClick={() => setCollapsed(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5,
                color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 999, padding: '9px 18px' }}>
              Edit Profile <span aria-hidden>✎</span>
            </button>
          </div>

          {/* Photo collage + identity overlay */}
          <div style={{ display: 'grid', gridTemplateColumns: rightPhotos.length ? '1.5fr 1fr' : '1fr', gap: 10 }}>
            <div style={{ ...photoBox, aspectRatio: rightPhotos.length ? '3 / 4' : '16 / 10' }}>
              {hero
                ? <img src={hero} alt={displayName} style={cover} />
                : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 64, color: 'var(--accent)', background: 'var(--accent-soft)', fontFamily: 'var(--serif)' }}>{displayName.slice(0, 1)}</div>}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(12,10,9,.86) 0%, rgba(12,10,9,.22) 46%, transparent 72%)' }} />
              <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16, color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 700, lineHeight: 1.05, textShadow: '0 2px 14px rgba(0,0,0,.5)' }}>
                  <span>{displayName}{age ? `, ${age}` : ''}</span>
                  {verified && <span aria-label="Verified" title="Camera-verified" style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: '#2f9be6', color: '#fff', fontSize: 13, flex: 'none' }}>✓</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, marginTop: 4, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
                  Looking for <strong style={{ color: '#f4a9b2', fontWeight: 700 }}>{goal}</strong>
                  <span aria-hidden style={{ color: '#f4a9b2' }}>♥</span>
                </div>
                {location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600, marginTop: 7, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>
                    <span aria-hidden>📍</span>{location}
                  </div>
                )}
              </div>
            </div>

            {rightPhotos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateRows: rightPhotos.length > 1 ? '1fr 1fr' : '1fr', gap: 10 }}>
                {rightPhotos.map((p, i) => (
                  <div key={i} style={{ ...photoBox, minHeight: 120 }}>
                    <img src={p} alt="" style={cover} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Verification status line (mirrors what a match sees on the tick) */}
          <div style={{ marginTop: 12, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7 }}>
            {verified
              ? <><span style={{ display: 'inline-grid', placeItems: 'center', width: 16, height: 16, borderRadius: '50%', background: '#2f9be6', color: '#fff', fontSize: 10 }}>✓</span><span className="muted">Camera-verified — matches see the blue badge on your name.</span></>
              : <span className="muted">Not verified yet — <button type="button" onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>get the blue badge with a live camera selfie</button>.</span>}
          </div>

          {/* Facts line — same as the match-detail header */}
          {facts.length > 0 && (
            <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '12px 0 0', lineHeight: 1.5 }}>{facts.join('  ·  ')}</p>
          )}

          {/* About / bio */}
          {form.bio && form.bio.trim() && (
            <>
              <h4 style={sectionH}>About {displayName}</h4>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: 0 }}>{form.bio}</p>
            </>
          )}

          {/* Interests */}
          {interests.length > 0 && (
            <>
              <h4 style={sectionH}>Interests</h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {interests.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            </>
          )}

          {/* Values & lifestyle */}
          {traitPills.length > 0 && (
            <>
              <h4 style={sectionH}>Values &amp; lifestyle</h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {traitPills.map((vv, k) => <span key={`${vv}-${k}`} style={pill}>{vv}</span>)}
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{ marginTop: 18, background: 'var(--paper)', borderRadius: 14, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
            <span aria-hidden style={{ color: 'var(--accent)' }}>✨</span>
            <span className="muted">Matches also see your live compatibility score with you. This profile also appears on your <Link to="/profile" style={{ color: 'var(--accent)', fontWeight: 700 }}>main profile</Link>.</span>
          </div>
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
      <CompletionCard completion={completion} />

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
            <div ref={v.reg('birthDate')}><span style={label}>Date of birth</span><input type="date" value={form.birthDate} disabled={dobLocked} title={dobLocked ? 'Set in your Master Profile' : undefined} onChange={(e) => { setForm({ ...form, birthDate: e.target.value }); v.clear('birthDate'); }} style={{ ...field, ...v.errStyle('birthDate'), ...(dobLocked ? masterLockedStyle : {}) }} />{dobLocked ? <MasterLockedNote label="Date of birth" /> : <FieldError msg={v.errors.birthDate} />}</div>
            <div><span style={label}>Time of birth <span style={{ textTransform: 'none' }}>(optional)</span></span><input type="time" step={60} value={form.birthTime ?? ''} onChange={(e) => setForm({ ...form, birthTime: e.target.value })} style={field} /><p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>Type or pick your exact time.</p></div>
            <div><span style={label}>Place of birth <span style={{ textTransform: 'none' }}>(optional)</span></span><input value={form.birthPlace ?? ''} placeholder="City" onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} style={field} /></div>

            <div style={{ gridColumn: '1 / -1', margin: '10px 0 -2px' }}>
              <span style={{ ...label, margin: 0 }}>📍 Your current location</span>
              <p className="muted" style={{ fontSize: 11.5, margin: '2px 0 0', textTransform: 'none', letterSpacing: 0 }}>Mention your current location — where you live right now.</p>
            </div>
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

          <SelfieVerify
            verified={Boolean(dx.selfieVerified && dx.selfiePhoto)}
            onCapture={(dataUrl) => setD({ selfieVerified: true, selfiePhoto: dataUrl, selfieVerifiedAt: new Date().toISOString() })}
            onClear={() => setD({ selfieVerified: false, selfiePhoto: undefined, selfieVerifiedAt: undefined })}
          />
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

          <span style={label}>Where to find your partner</span>
          <p className="muted" style={{ fontSize: 11.5, margin: '0 0 8px', textTransform: 'none', letterSpacing: 0 }}>Choose the location you'd like your partner to be from. This can be anywhere.</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <Chip on={(dx.partnerLocationMode ?? 'any') === 'any'} onClick={() => setD({ partnerLocationMode: 'any' })}>🌍 Anywhere</Chip>
            <Chip on={dx.partnerLocationMode === 'specific'} onClick={() => setD({ partnerLocationMode: 'specific' })}>📍 Specific location</Chip>
          </div>
          {dx.partnerLocationMode === 'specific' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px', marginTop: 8 }}>
              <div><span style={label}>Country</span>
                <SearchSelect category="country" value={dx.partnerCountry ?? ''} clearable clearLabel="Any" placeholder="Any country"
                  onChange={(o) => setD({ partnerCountry: o?.label, partnerCountryCode: o?.code, partnerState: undefined, partnerStateCode: undefined, partnerCity: undefined })} />
              </div>
              <div><span style={label}>State</span>
                <SearchSelect category="state" parent={dx.partnerCountryCode} value={dx.partnerState ?? ''} clearable clearLabel="Any" placeholder="Any state"
                  onChange={(o) => setD({ partnerState: o?.label, partnerStateCode: o?.code, partnerCity: undefined })} />
              </div>
              <div><span style={label}>City</span>
                <SearchSelect category="city" parent={dx.partnerStateCode} value={dx.partnerCity ?? ''} disabled={!dx.partnerStateCode} clearable clearLabel="Any"
                  placeholder={dx.partnerStateCode ? 'Any city' : 'Pick a state first'}
                  onChange={(o) => setD({ partnerCity: o?.label })} />
              </div>
            </div>
          )}

          <span style={label}>Deal breakers (optional)</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{DEAL_BREAKERS.map((v) => <Chip key={v} on={(dx.dealBreakers ?? []).includes(v)} onClick={() => setD({ dealBreakers: capToggle(dx.dealBreakers, v, 5) })}>{v}</Chip>)}</div>
        </div>

        {/* AI auto-calculated — no user input */}
        <div className="card" style={{ marginTop: 16, background: 'var(--accent-soft)', border: 'none' }}>
          <div className="eyebrow">✨ The AI calculates automatically</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>No input needed — from your details we compute your compatibility for every candidate:</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{AI_DIMENSIONS.map((d) => <span key={d} className="tag">{d}</span>)}</div>
        </div>

        {/* Visibility + delete — only meaningful once a profile exists, but the
            controls are always available so the user can set them up-front. */}
        <VisibilityCard visibility={visibility} minScore={minScore}
          onChange={(vv, min) => setD({ visibility: vv, minMatchScore: min })}
          onDelete={onDelete} deleting={del.isPending} />

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button type="submit" variant="accent" disabled={upsert.isPending}>{upsert.isPending ? 'Saving…' : saved ? 'Save profile' : 'Create profile'}</Button>
          {data?.sign && <span className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '6px 14px', fontSize: 12.5 }}>✨ Your sign: <strong>{data.sign}</strong></span>}
        </div>
      </form>
    </div>
  );
}
