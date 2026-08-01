import { useEffect, useState, useRef, type FormEvent } from 'react';
import { useFormValidation, ValidationSummary, FieldError, successToast } from '@/components/form-validation';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { SearchSelect } from '@/components/SearchSelect';
import { MultiSelect } from '@/components/MultiSelect';
import type { LookupOption } from '@/api/lookups.api';
import { useDatingProfile, useUpsertDatingProfile, useDeleteDatingProfile, type UpsertProfileInput, type Visibility, type ProfileCompletion } from '../api';
import { mediaApi } from '@/api/media.api';
import { useMasterProfile } from '@/features/profile/hooks';
import { MasterLockedNote, masterLockedStyle } from '@/features/profile/MasterLockedField';
import { SelfieOnFile } from '../components/SelfieOnFile';

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
  prefAgeMin?: number | null; prefAgeMax?: number | null; prefDistanceKm?: number | null;
  /** `prefHeight` was free text nothing could read (L2). Replaced by a range;
   *  the old string is kept only long enough to be offered back for confirming,
   *  and is dropped the moment the range is set. */
  prefHeight?: string; prefHeightMinCm?: number | null; prefHeightMaxCm?: number | null;
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
 * Take a selfie for the profile (H5).
 *
 * This used to say the badge was "EARNED" and that there was "no way to mark
 * yourself verified by uploading a photo". Neither held. The camera-only rule
 * lives entirely in this component; `upsertProfile` stores whatever `extras`
 * JSON it receives, so a request made outside the app sets the flag with any
 * image. And nothing anywhere compares the selfie to the profile photos — a
 * real live selfie of somebody else earns exactly the same marker.
 *
 * The capture stays: it is the raw material a face match will need, and asking
 * for it through the camera is still the right default. What changes is that
 * nothing here claims the check has happened. See components/SelfieOnFile.tsx.
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
      setErr('Your browser or device doesn’t support camera capture, so the selfie can’t be taken here.');
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
      setErr('Camera access is required to take the selfie. Please allow the camera and try again.');
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700 }}>
            <SelfieOnFile on />
            Selfie on file
          </span>
          <button type="button" onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Redo</button>
        </div>
      ) : (
        <button type="button" onClick={() => void start()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5,
            color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 999, padding: '9px 16px' }}>
          📷 Take a selfie with your camera
        </button>
      )}
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Matches see that a selfie is on file. We keep it so we can check it against your photos once that
        check is built — until then it isn’t proof of identity, and your matches are told exactly that.
      </p>

      {open && (
        <div role="dialog" aria-modal="true" style={overlay} onClick={close}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Take your selfie</h3>
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
                ? <Button variant="accent" size="sm" onClick={() => void start()}>Try again</Button>
                : <Button variant="accent" size="sm" disabled={!ready || busy} onClick={capture}>{busy ? 'Capturing…' : 'Capture selfie'}</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Photos are shown large as the profile hero (and at 2× on retina screens), so
// store them at a resolution that stays crisp when enlarged — not just as
// thumbnails. 1080px @ q0.82 keeps the hero sharp while bounding payload size.
//
// M3: this returns a BLOB now, not a data URL. The bytes go straight to a
// private bucket via a presigned PUT and only the key is saved, so a photo no
// longer rides inside the 2 MB extras blob and is no longer copied into every
// candidate card the server sends anybody.
function resizePhoto(file: File, maxDim = 1080): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); if (!ctx) { reject(new Error('no canvas')); return; }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

/**
 * Resize, then hand the bytes to the ONE place allowed to PUT them. (M3.)
 *
 * The first version did its own fetch(PUT) and upload-chokepoint.test.ts caught
 * it immediately — every direct-to-bucket upload must go through mediaApi,
 * because that is the last moment a photo's GPS coordinates can be removed
 * before they leave the device. The canvas resize below already drops EXIF as a
 * side effect of re-encoding, which is exactly the kind of accidental safety
 * that stops being true the day somebody changes the resize.
 */
async function uploadPhoto(file: File): Promise<string | null> {
  try {
    const blob = await resizePhoto(file);
    const resized = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    return await mediaApi.uploadDating(resized);
  } catch {
    return null;
  }
}

/** Dating Profile — 4-phase onboarding. Passes moderation before it's visible. */
/*
 * `masterGender()` used to live here — the same identity→dating mapping the
 * server needed, hand-rolled on the client because the server's prefill was
 * returning null. That patched the symptom and hid the cause: the mapping was
 * missing from `propagationPlan` too, where its absence was writing 'nonBinary'
 * into a column every matching comparison reads with `===`.
 *
 * The rule now lives once, in profile/sex-and-gender.ts, and the prefill
 * carries the answer. See §15.1.
 */

export function DatingProfilePage() {
  const existing = useDatingProfile();
  const upsert = useUpsertDatingProfile();
  const del = useDeleteDatingProfile();
  const master = useMasterProfile();
  const dobLocked = Boolean(master.data?.dateOfBirth);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Empty, not 'male' (p1, FE-15.1). A preselected gender is a value nobody
  // chose, recorded as though they had.
  const [form, setForm] = useState<UpsertProfileInput>({ gender: '', seeking: 'any', bio: '', birthDate: '', birthTime: '', birthPlace: '', interests: [] });
  const [dx, setDx] = useState<DX>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const d = existing.data as (typeof existing.data & { saved?: boolean; name?: string; country?: string | null; state?: string | null; city?: string | null; heightCm?: number | null; photo?: string | null }) | null;
    if (!d) return;
    const isSaved = (d as { saved?: boolean }).saved !== false; // prefill objects carry saved:false
    setForm({
      // The prefill already carries the Master Profile's answer, in this form's
      // own vocabulary — the citizen answered this once (p22, p23).
      gender: (d.gender ?? '') as UpsertProfileInput['gender'],
      seeking: d.seeking ?? 'any',
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
    // Now that the field starts empty, saving without choosing has to be
    // caught here rather than silently recording the old default.
    { key: 'gender', label: 'Gender', valid: () => Boolean(form.gender), message: 'Choose your Gender.' },
    { key: 'birthDate', label: 'Date of birth', valid: () => Boolean(form.birthDate), message: 'Enter your Date of birth.' },
    { key: 'bio', label: 'Bio', valid: () => (form.bio ?? '').trim().length >= 20, message: 'Write a short Bio (at least 20 characters).' },
    { key: 'interests', label: 'Interests', valid: () => (form.interests ?? []).length >= 3, message: 'Pick at least 3 Interests.' },
  ]);

  if (existing.isLoading) return <Spinner label="Loading your profile…" />;

  /**
   * NOT AN EMPTY FORM. The form state is seeded by a useEffect that begins
   * `if (!d) return;`, so a failed read left every field at its initial blank
   * value — and the submit button, which reads "Create profile" when nothing is
   * saved, invited the citizen to fill it in.
   *
   * Which they reasonably would: a blank profile form is a clear instruction.
   * And `upsert.mutate` does not merge. Their bio, their interests, their
   * photos, replaced by whatever they retyped in the ten minutes after the app
   * told them there was nothing there.
   *
   * That is the only failure state found in this sweep that DESTROYS something
   * rather than misreporting it, and it is why a page whose form is prefilled
   * from a read must refuse to render that form when the read failed.
   */
  if (existing.isError) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 16px' }}>
        <EmptyState
          icon="⚠️"
          title="We couldn’t load your dating profile"
          hint="Nothing has been lost. We’re not showing you the form, because an empty one would look like a profile you never made — and saving it would replace the one you have. Try again in a moment."
        />
      </div>
    );
  }

  const setD = (patch: Partial<DX>) => setDx((prev) => ({ ...prev, ...patch }));
  const num = (v: string) => (v ? parseInt(v, 10) : null);
  // The old free-text height preference, if this profile still carries one and
  // no range has been set. Offered back rather than dropped — it is the
  // citizen's own answer — but never used as a filter until they confirm it,
  // because this preference now hides people and a guess must not do that.
  const legacyHeight = (() => {
    const raw = dx.prefHeight?.trim();
    if (!raw || dx.prefHeightMinCm != null || dx.prefHeightMaxCm != null) return null;
    const found = (raw.match(/\d{2,3}/g) ?? []).map(Number).filter((n) => n >= 100 && n <= 250);
    // Exactly two plausible centimetre figures in order, or we do not guess:
    // "5'6\"–6'0\"" and "tall" both fall through to asking.
    const parsed = found.length === 2 && found[0] <= found[1] ? ([found[0], found[1]] as [number, number]) : null;
    return { parsed };
  })();
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
    const keys: string[] = [];
    let failed = 0;
    for (const f of chosen) {
      const key = await uploadPhoto(f);
      if (key) keys.push(key); else failed++;
    }
    // Said out loud. A photo that silently does not appear reads as the app
    // losing it, which is exactly the class of thing the failure-states work
    // spent a day removing.
    setPhotoError(failed ? `${failed} photo${failed === 1 ? '' : 's'} didn't upload. Your other photos are saved — try those again.` : null);
    if (keys.length) setD({ photos: [...(dx.photos ?? []), ...keys] });
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
  // What to RENDER. `photos` holds private storage keys now (M3), which are not
  // URLs; the server signs them and returns the list aligned one-for-one, so
  // remove-by-index still lines up. A photo just uploaded in this session has
  // no signed URL yet — the profile is refetched on save, which is when it
  // appears. Falling back to the raw entry keeps legacy base64 rendering.
  const photoSrcs = (data as { photoUrls?: string[] } | null)?.photoUrls ?? [];
  const srcAt = (i: number) => photoSrcs[i] || (photos[i]?.startsWith('data:') ? photos[i] : '');
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
    // "Is a selfie stored" — the only part of this the server can actually see.
    // Not identity: nothing compares it to the photos. See components/SelfieOnFile.
    const verified = Boolean(dx.selfieVerified && dx.selfiePhoto);
    const goal = dx.relationshipGoal || 'a connection';
    const location = [dx.city, dx.state, dx.country].filter(Boolean).join(', ');
    const sign = data?.sign ?? '—';
    const hero = srcAt(0);
    const rightPhotos = [srcAt(1), srcAt(2)].filter(Boolean);
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
                  <SelfieOnFile on={verified} />
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
              ? <><SelfieOnFile on size="sm" /><span className="muted">Selfie on file — matches see that, and that we haven’t checked it against your photos yet.</span></>
              : <span className="muted">No selfie yet — <button type="button" onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>take one with your camera</button>.</span>}
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
            <span className="muted">Matches also see your live compatibility score with you.</span>
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
            <label style={{ display: 'block' }}><span style={label}>First name</span><input value={dx.firstName ?? ''} onChange={(e) => setD({ firstName: e.target.value })} style={field} /></label>
            <div ref={v.reg('gender')}><span style={label}>Gender</span>
              <select aria-label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as UpsertProfileInput['gender'] })} style={field}>
                <option value="">Select…</option>
                <option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Non-binary</option>
              </select>
              <FieldError msg={v.errors.gender} />
            </div>
            <div><span style={label}>Looking for</span>
              <select aria-label="Looking for" value={form.seeking} onChange={(e) => setForm({ ...form, seeking: e.target.value as UpsertProfileInput['seeking'] })} style={field}>
                <option value="any">Anyone</option><option value="male">Men</option><option value="female">Women</option><option value="nonbinary">Non-binary people</option>
              </select>
            </div>
            <div ref={v.reg('birthDate')}><span style={label}>Date of birth</span><input type="date" aria-label="Date of birth" value={form.birthDate} disabled={dobLocked} title={dobLocked ? 'Set in your Master Profile' : undefined} onChange={(e) => { setForm({ ...form, birthDate: e.target.value }); v.clear('birthDate'); }} style={{ ...field, ...v.errStyle('birthDate'), ...(dobLocked ? masterLockedStyle : {}) }} />{dobLocked ? <MasterLockedNote label="Date of birth" /> : <FieldError msg={v.errors.birthDate} />}</div>
            <div><span style={label}>Time of birth <span style={{ textTransform: 'none' }}>(optional)</span></span><input type="time" aria-label="Time of birth" step={60} value={form.birthTime ?? ''} onChange={(e) => setForm({ ...form, birthTime: e.target.value })} style={field} /><p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>Type or pick your exact time.</p></div>
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

          <span style={label}>Photos (min 1 · 3+ recommended)</span>
          {photoError && (
            <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#b23' }}>{photoError}</p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {photos.map((_p, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {srcAt(i)
                  ? <img src={srcAt(i)} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover' }} />
                  /* Uploaded, saved, not yet signed for display. Says so rather
                     than rendering a broken image frame. */
                  : <div style={{ width: 72, height: 72, borderRadius: 10, background: 'var(--paper)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: 4 }}>Saved · reload to view</div>}
                <button type="button" onClick={() => removePhoto(i)} aria-label="Remove"
                  style={{ minWidth: 44, minHeight: 44, position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#c62828', color: '#fff', cursor: 'pointer', fontSize: 12 }}>×</button>
              </div>
            ))}
            {photos.length < 10 && (
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add a photo"
                style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed var(--line)', background: 'transparent', cursor: 'pointer', fontSize: 22, color: 'var(--muted)' }}>＋</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPhotos(e.target.files)} />
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{photos.length < 1 ? 'Add at least 1 photo to go live — 3 or more is recommended for better matches (a clear face photo first).' : photos.length < 3 ? `You’re good to go live — add ${3 - photos.length} more to reach the recommended 3+ for better matches.` : 'First photo is your primary — make it a clear face photo.'}</p>

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
            <label style={{ display: 'block' }}><span style={label}>Age from</span><input type="number" min={18} max={99} value={dx.prefAgeMin ?? ''} onChange={(e) => setD({ prefAgeMin: num(e.target.value) })} style={field} /></label>
            <label style={{ display: 'block' }}><span style={label}>Age to</span><input type="number" min={18} max={99} value={dx.prefAgeMax ?? ''} onChange={(e) => setD({ prefAgeMax: num(e.target.value) })} style={field} /></label>
            <label style={{ display: 'block' }}>
              <span style={label}>Distance (km)</span>
              <input type="number" min={1} max={5000} value={dx.prefDistanceKm ?? ''} onChange={(e) => setD({ prefDistanceKm: num(e.target.value) })} style={field} />
              {/* This does something now. shared/geo.ts resolves ~140 cities to
                  coordinates, so the distance is measured rather than guessed —
                  and a city outside that list falls back to comparing place
                  names, with the preference left out rather than applied to a
                  distance nobody measured. */}
              <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block', marginTop: 4 }}>
                Someone further away than this still appears, scored lower — it shapes your matches
                rather than hiding people. If we don’t recognise a city we leave this out rather than guess.
              </span>
            </label>
            <label style={{ display: 'block' }}><span style={label}>Height from (cm)</span>
              <input type="number" min={100} max={250} value={dx.prefHeightMinCm ?? ''}
                onChange={(e) => setD({ prefHeightMinCm: num(e.target.value), prefHeight: undefined })} style={field} /></label>
            <label style={{ display: 'block' }}><span style={label}>Height to (cm)</span>
              <input type="number" min={100} max={250} value={dx.prefHeightMaxCm ?? ''}
                onChange={(e) => setD({ prefHeightMaxCm: num(e.target.value), prefHeight: undefined })} style={field} /></label>
            <div style={{ gridColumn: '1 / -1' }}>
              {/* This one hides people, so it says so. It sits beside Age from /
                  Age to and behaves the same way — the owner's call, and the
                  difference between a filter and a nudge is not something to
                  leave a citizen to guess at. */}
              <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block', marginBottom: 4 }}>
                Unlike distance, a height range <strong>hides</strong> people outside it, the same as
                the age range above. Leave both blank for any height. Someone who hasn’t recorded
                their height is never hidden by this — we won’t rule anybody out over a figure we
                don’t have.
              </span>
              {legacyHeight && (
                <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block' }}>
                  You previously wrote “{dx.prefHeight}”, which we could never read back — so it has
                  never affected your matches.{' '}
                  {legacyHeight.parsed ? (
                    <button type="button"
                      onClick={() => setD({ prefHeightMinCm: legacyHeight.parsed![0], prefHeightMaxCm: legacyHeight.parsed![1], prefHeight: undefined })}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>
                      Use {legacyHeight.parsed[0]}–{legacyHeight.parsed[1]} cm
                    </button>
                  ) : 'Set the range above to start using it.'}
                </span>
              )}
            </div>
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
