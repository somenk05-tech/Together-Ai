import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFormValidation, ValidationSummary, FieldError, successToast } from '@/components/form-validation';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { SearchSelect } from '@/components/SearchSelect';
import { MultiSelect } from '@/components/MultiSelect';
import type { LookupOption } from '@/api/lookups.api';
import { useDatingProfile, useUpsertDatingProfile, useDeleteDatingProfile, useSaveSelfie, useClearSelfie, type UpsertProfileInput, type Visibility, type ProfileCompletion } from '../api';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { geoApi } from '@/api/geo.api';
import { useMasterProfile } from '@/features/profile/hooks';
import { useAuth } from '@/hooks/useAuth';
import { MasterLockedNote, masterLockedStyle } from '@/features/profile/MasterLockedField';
import { SelfieOnFile } from '../components/SelfieOnFile';

const field: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)',
  fontSize: 14, fontFamily: 'inherit', outline: 'none', background: 'var(--card)', boxSizing: 'border-box',
};
/** Something went wrong and the citizen has to know: the camera failing, the
 *  upload failing, or the write that follows the upload failing. One shape
 *  for all three — a selfie that silently did nothing IS the bug this pass
 *  was opened to fix. */
const errBox: React.CSSProperties = { background: 'var(--danger-soft)', color: 'var(--danger-ink)', borderRadius: 12, padding: '12px 14px', fontSize: 13 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', margin: '14px 0 6px' };
/** The sentence under a control that says what the control did. Same shape as
 *  the note under the distance slider, which is the one it sits beside. */
const locHint: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.5, display: 'block', marginTop: 4 };

const INTERESTS = ['Travel', 'Movies', 'Music', 'Reading', 'Cooking', 'Fitness', 'Sports', 'Photography', 'Gaming', 'Art', 'Pets', 'Technology', 'Fashion', 'Nature'];
const TRAITS = ['Funny', 'Calm', 'Ambitious', 'Romantic', 'Adventurous', 'Introvert', 'Extrovert', 'Creative', 'Family-Oriented', 'Spiritual'];
const VALUES = ['Family', 'Honesty', 'Loyalty', 'Kindness', 'Career', 'Adventure', 'Personal Growth', 'Financial Stability'];
// Every chip here is read by `hardFilterReason` on the server. 'Marriage
// Intentions' and 'Distance' were offered by this list and implemented by
// nothing — a control that lit up, saved, and removed nobody. 'Diet' and
// 'Religion' are new, and both were already collected fields the engine never
// read. If a chip is ever added here again, add the branch there in the same
// commit: this list is a promise the engine keeps.
const DEAL_BREAKERS = ['Smoking', 'Drinking', 'Marriage Intentions', 'Wants Children', 'Distance', 'Diet', 'Religion'];
// THE SEVEN THE ENGINE ACTUALLY COMPUTES, and nothing else. `factorScores` in
// the API's matching.ts returns exactly these: astrology, personality,
// relationshipGoals, values, lifestyle, interests, location. 'Numerology
// compatibility' was advertised here under "computed for every candidate" and
// is computed nowhere in dating — the same failure as the deal-breaker chips
// above, a promise with no engine behind it. 'Overall AI score' went too: it is
// the total of the seven, not an eighth thing.
const AI_DIMENSIONS = [
  'Astrology', 'Personality traits', 'What you are each looking for',
  'Values', 'Lifestyle', 'Interests', 'Where you both are',
];


/** Height options (120–220 cm) — a numeric range, generated locally. */
const HEIGHTS: LookupOption[] = Array.from({ length: 220 - 120 + 1 }, (_, i) => {
  const cm = 120 + i;
  return { code: String(cm), label: `${cm} cm`, parentCode: null };
});

const MOD: Record<string, { label: string; bg: string; c: string }> = {
  approved: { label: '● Live — matching active', bg: 'var(--ok-soft)', c: 'var(--ok-ink)' },
  pending: { label: '◌ Pending review', bg: 'var(--warn-soft)', c: 'var(--warn-ink)' },
  review: { label: '⏳ In manual review', bg: 'var(--warn-soft)', c: 'var(--warn-ink)' },
  rejected: { label: '✕ Not visible yet', bg: 'var(--danger-soft)', c: 'var(--danger-ink)' },
};

interface DX {
  firstName?: string; country?: string; countryCode?: string; state?: string; stateCode?: string; city?: string;
  heightCm?: number | null; languages?: string[];
  photos?: string[];
  relationshipGoal?: string; diet?: string; smoking?: string; drinking?: string; fitnessLevel?: string; education?: string; profession?: string;
  personalityTraits?: string[]; values?: string[];
  prefAgeMin?: number | null; prefAgeMax?: number | null; prefDistanceKm?: number | null;
  /** The preferred-height range is NO LONGER COLLECTED (owner decision, 2 Aug).
   *  The two inputs and the offer of the old free-text answer came off this
   *  form. These three keys stay declared because a range somebody already
   *  saved is STILL READ by the API's hard filter, so a save has to round-trip
   *  it rather than quietly clear it — a filter that switches itself off for
   *  whoever edits their profile and stays on for everyone else is one setting
   *  behaving two ways.
   *
   *  THIS IS A ONE-WAY DOOR, and a deliberate one. Anybody holding a stored
   *  range keeps being filtered by it with no screen left to see or change it
   *  on, and the person it removes is not told either. The pool fixture prices
   *  a typical range at about a third of the city. Written down here rather
   *  than found later. */
  prefHeight?: string; prefHeightMinCm?: number | null; prefHeightMaxCm?: number | null;
  prefDiet?: string; prefSmoking?: string; prefDrinking?: string; wantsChildren?: string; religion?: string;
  /** Who they seek, precisely — see the Looking for control (P3, 26 Aug). */
  seekingList?: string[];
  /** When the citizen agreed to religion and who-they-seek being used for matching (26 Aug). */
  sensitiveConsentAt?: string;
  /** Anywhere, or the citizen's current location — which is the default. The
   *  country/state/city trio that used to sit here wrote three keys no server
   *  code ever read; it was a control that did nothing, and it is gone. */
  partnerLocationMode?: 'any' | 'around';
  searchLat?: number | null; searchLng?: number | null; searchPlace?: string;
  dealBreakers?: string[];
  visibility?: Visibility; minMatchScore?: number;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '7px 14px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-soft)',
    }}>{children}</button>
  );
}

const Phase = ({ n, title }: { n: number; title: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 2px' }}>
    <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{n}</span>
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
          <div style={{ fontWeight: 700, fontSize: 15 }}>Dating Profile · {pct}% Complete</div>
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

/* THE COMPATIBILITY FILTER IS GONE (owner, 27 Aug: "remove this filter all
   together and show the profile to everyone from 100 percent to 1 percent
   matches"). Two things left with it: the threshold option — a per-profile
   score gate on who could see you — and the "≥75%" claim on the everyone
   option, which had stopped being true when the browse floor was removed and
   was by now simply wrong. What remains is not a filter: visible, paused and
   hidden are three states of one switch, and pause's promise (an existing
   match keeps chatting) has its own spec. Profiles that stored 'threshold'
   render and save as visible — the server no longer reads the gate. */
const VIS_OPTIONS: { key: Visibility; label: string; hint: string }[] = [
  { key: 'everyone', label: 'Visible to everyone who matches', hint: 'Every match can see you — from 100% right down to 1%.' },
  { key: 'paused', label: 'Pause my profile', hint: 'Temporarily hidden from matching — nothing is deleted.' },
  { key: 'hidden', label: 'Hide my profile', hint: 'Fully hidden from the matching pool.' },
];

/** Profile visibility controls. Leaving is its own card, below. */
function VisibilityCard({ visibility, onChange }: {
  visibility: Visibility;
  onChange: (v: Visibility) => void;
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>🔒 Profile visibility</h3>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>Control whether you appear in the matching pool.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {VIS_OPTIONS.map((o) => {
          const active = visibility === o.key;
          return (
            <label key={o.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--r-1)', cursor: 'pointer',
              border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`, background: active ? 'var(--accent-soft)' : 'transparent' }}>
              <input type="radio" name="visibility" checked={active} onChange={() => onChange(o.key)} style={{ marginTop: 2 }} />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 600, display: 'block' }}>{o.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>{o.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Leaving Dating — its own card, not a link at the foot of another one
 * (owner, 27 Aug: "add delete dating profile section").
 *
 * It used to sit under the visibility radios, one line below "temporarily
 * hidden, nothing is deleted". Two different decisions under one heading. This
 * is the destructive one, given its own room and a plain sentence about what
 * actually goes — and a pointer to Pause for the person who only wants a break.
 */
// Hoisted, and the spacing quoted, so this card adds nothing to the inline-style
// or raw-spacing ceilings that scripts/size-system-ceiling.mjs holds.
const delCard: React.CSSProperties = { marginTop: '16px' };
const delHead: React.CSSProperties = { margin: '0', fontSize: 16 };
const delBody: React.CSSProperties = { fontSize: 12.5, margin: '6px 0 4px', lineHeight: 1.6 };
const delBodyLast: React.CSSProperties = { fontSize: 12.5, margin: '0 0 12px', lineHeight: 1.6 };
const delBtn: React.CSSProperties = { color: 'var(--danger-ink)', borderColor: 'var(--danger-line)' };
function DeleteProfileCard({ onDelete, deleting }: { onDelete: () => void; deleting: boolean }) {
  return (
    <div className="card" style={delCard}>
      <h3 style={delHead}>Delete your dating profile</h3>
      <p className="muted" style={delBody}>
        Your dating profile, your dating photos and your verification selfie are
        deleted, and every match ends. Your Together City account is untouched —
        this is the Dating Hub only, and you can start a new profile later.
      </p>
      <p className="muted" style={delBodyLast}>
        Only want a break? Use <strong>Pause my profile</strong> above instead — it keeps
        everything and just takes you out of matching.
      </p>
      <Button variant="line" size="sm" disabled={deleting}
        onClick={() => { if (window.confirm('Delete your dating profile? Your photos and matches go with it, and it cannot be undone.')) onDelete(); }}
        style={delBtn}>
        {deleting ? 'Deleting…' : 'Delete dating profile'}
      </Button>
    </div>
  );
}

/**
 * Take a selfie for the profile (H5).
 *
 * IT NEVER STUCK, AND THAT WAS THE BUG (owner, 27 Aug: "fix self verification
 * for getting that verified profile tab"). The capture wrote `selfieVerified`
 * into the `extras` blob, and `upsertProfile` deleted it on every save —
 * correctly, because a badge the client can write is a badge anyone can forge.
 * Nothing wrote it anywhere else, so the page said "No selfie yet" forever.
 *
 * NOW THE PICTURE GOES WHERE THE PROFILE PHOTOS GO — the private bucket, by
 * presigned PUT — and the KEY is handed to an endpoint that writes the mark
 * server-side. Nothing about the state is inferred here: `onFile` comes back
 * from the profile read, so the button and the preview cannot disagree.
 *
 * The camera-only rule still lives in this component and is still not a proof
 * of anything, and nothing here claims the check has happened. What the mark
 * means is stated wherever it is drawn — see components/SelfieOnFile.tsx.
 */
function SelfieVerify({ onFile, onSaved, onClear, saving, clearing, failed }: {
  onFile: boolean; onSaved: (key: string) => void; onClear: () => void;
  saving: boolean; clearing: boolean; failed: string | null;
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

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true); setErr(null);
    const maxDim = 480;
    const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) { setBusy(false); return; }
    ctx.drawImage(v, 0, 0, w, h);
    // The frame goes to the bucket before anything is claimed about it: a mark
    // written for bytes that never arrived would be the old bug with a longer
    // journey. The camera stays on until the upload lands, so a failure can be
    // retried from the same open sheet.
    //
    // uploadDatingSelfie, NOT uploadDating: the selfie writes into a namespace
    // of its own, which is what makes "never shown on your profile" a fact
    // about the key rather than a promise about the code around it.
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) { setErr('The camera frame could not be read. Please try again.'); setBusy(false); return; }
    try {
      const key = await mediaApi.uploadDatingSelfie(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }));
      onSaved(key);
      stop(); setOpen(false);
    } catch (e) {
      setErr(uploadErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => { stop(); setOpen(false); };

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 60, background: 'var(--scrim-deep)', display: 'grid', placeItems: 'center', padding: 16 };
  const sheet: React.CSSProperties = { width: '100%', maxWidth: 380, background: 'var(--card)', borderRadius: 18, padding: 18, boxShadow: 'var(--shadow)' };

  return (
    <div style={{ marginTop: 12 }}>
      {onFile ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700 }}>
            <SelfieOnFile on />
            Selfie on file
          </span>
          <button type="button" onClick={() => void start()} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>Retake</button>
          <button type="button" onClick={onClear} disabled={clearing} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>{clearing ? 'Removing…' : 'Remove'}</button>
        </div>
      ) : (
        <button type="button" onClick={() => void start()} disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5,
            color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '9px 16px' }}>
          {saving ? 'Saving your selfie…' : '📷 Take a selfie with your camera'}
        </button>
      )}
      {failed && (
        <div style={{ ...errBox, margin: '10px 0 0' }}>{failed}</div>
      )}
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Matches see that a selfie is on file — the mark on your name beside the confirmed-email one. It is
        kept so it can be checked against your photos once that check is built; until then it isn’t proof of
        identity, and your matches are told exactly that. It is never added to your photos.
      </p>

      {open && (
        <div role="dialog" aria-modal="true" style={overlay} onClick={close}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Take your selfie</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>Center your face in the frame and capture a live selfie. This isn’t added to your photos.</p>
            {err ? (
              <div style={errBox}>{err}</div>
            ) : (
              <div style={{ position: 'relative', borderRadius: 'var(--r-2)', overflow: 'hidden', background: 'var(--media-bg)', aspectRatio: '3 / 4' }}>
                <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                {!ready && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--on-accent)', fontSize: 13 }}>Starting camera…</div>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              <Button variant="line" size="sm" onClick={close}>Cancel</Button>
              {err
                ? <Button variant="accent" size="sm" onClick={() => void start()}>Try again</Button>
                : <Button variant="accent" size="sm" disabled={!ready || busy} onClick={() => void capture()}>{busy ? 'Saving…' : 'Capture selfie'}</Button>}
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

const nameOption: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', fontSize: 13.5, margin: '6px 0 0', cursor: 'pointer',
};
/** The form's own field, plus the gap above it. Hand-copying the shape here
 *  is what the size ratchet exists to catch: my first version wrote
 *  `borderRadius: 8` where `field` uses `var(--r-1)`, which is one more raw
 *  radius and one more way for this input to drift away from every other. */
const aliasField: React.CSSProperties = { ...field, margin: '8px 0 0' };
const nameNote: React.CSSProperties = { fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.55 };
const distanceSlider: React.CSSProperties = { width: '100%', accentColor: 'var(--accent)', marginTop: '6px' };

/**
 * What the server will actually show, computed here so the form can say it.
 *
 * MIRRORS `shownName` in dating/matching.ts — trim, collapse the spaces, cap
 * at 40, fall back to the account name, stand the first letter up. Duplicated
 * deliberately: the alternative is a preview that disagrees with the product,
 * which is worse than a copy somebody has to keep in step. `a-name-of-your-own
 * .test.ts` fails if the two drift.
 */
function shownAsPreview(alias: string | undefined, cityName: string): string {
  const trimmed = typeof alias === 'string' ? alias.replace(/\s+/g, ' ').trim().slice(0, 40).trim() : '';
  const out = trimmed || cityName;
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

export function DatingProfilePage() {
  // The account name is what the SERVER falls back to (cand.user.name), so it
  // is the one the preview must quote — not the Master Profile's copy of it.
  const { user: authUser } = useAuth();
  const existing = useDatingProfile();
  const upsert = useUpsertDatingProfile();
  const del = useDeleteDatingProfile();
  // The selfie has its own two endpoints because it is the ONE thing on this
  // form the client may not author: a mark the browser can write is a mark
  // anyone can forge, so `upsertProfile` strips it and these write it.
  const saveSelfie = useSaveSelfie();
  const clearSelfie = useClearSelfie();
  const master = useMasterProfile();
  const dobLocked = Boolean(master.data?.dateOfBirth);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Empty, not 'male' (p1, FE-15.1). A preselected gender is a value nobody
  // chose, recorded as though they had.
  const [form, setForm] = useState<UpsertProfileInput>({ gender: '', seeking: 'any', bio: '', birthDate: '', birthTime: '', birthPlace: '', interests: [] });
  const [dx, setDx] = useState<DX>({});
  const [collapsed, setCollapsed] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);

  const existingData = existing.data;
  useEffect(() => {
    const d = existingData as (typeof existing.data & { saved?: boolean; name?: string; country?: string | null; state?: string | null; city?: string | null; heightCm?: number | null; photo?: string | null; diet?: string | null }) | null;
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
      let ex: DX = {};
      try {
        const parsed: unknown = d.extras ? JSON.parse(d.extras) : {};
        ex = typeof parsed === 'object' && parsed !== null ? (parsed as DX) : {};
      } catch { ex = {}; }
      setDx(ex);
      setCollapsed(d.moderation !== 'rejected');
    } else {
      // First-time open: seed the location/name/height fields the form shows from
      // the Master Profile prefill (spec: auto-populate, never ask twice).
      setDx((prev) => ({
        ...prev,
        // NOT firstName. It used to be seeded from the Master Profile name,
        // which meant a citizen opened this form with their real city name
        // already sitting in the box, having chosen nothing. Leaving it unset
        // shows the same name (the server falls back to the account name) —
        // the difference is that the choice is now VISIBLE and theirs.

        country: prev.country || d.country || undefined,
        state: prev.state || d.state || undefined,
        city: prev.city || d.city || undefined,
        heightCm: prev.heightCm || d.heightCm || undefined,
        // The diet the citizen already gave Nutrition, as this form's label.
        // One question, asked once, in whichever hub they opened first.
        diet: prev.diet || d.diet || undefined,
        // NO LONGER SEEDED FROM THE ACCOUNT PHOTO (27 Aug, second audit,
        // blocker 04). The master photo is an http URL — an unreviewed remote
        // image that skipped the safety pipeline and, shown on the card,
        // leaked every viewer's IP. Dating photos are uploaded to the private
        // bucket and reviewed; the citizen adds at least one deliberately.
        photos: prev.photos,
      }));
    }
    /* The dependency is the DATUM, not the query object that carries it.
       `existing` changes identity on every fetch state transition; its `.data`
       changes when the answer does, which is the only thing this prefill
       cares about. Named here so the rule can see what the effect reads. */
  }, [existingData]);

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
      <div>
        <EmptyState
          icon="⚠️"
          title="We couldn’t load your dating profile"
          hint="Nothing has been lost — we’ve kept the form closed so a blank one can’t overwrite what you saved. Try again in a moment."
        />
      </div>
    );
  }

  const setD = (patch: Partial<DX>) => setDx((prev) => ({ ...prev, ...patch }));
  // The thumb needs a position even before the citizen touches it; 100 km is a
  // sensible city radius. The stored value stays whatever they last saved.
  const distanceKm = typeof dx.prefDistanceKm === 'number' && dx.prefDistanceKm > 0 ? dx.prefDistanceKm : 100;

  // CURRENT LOCATION IS THE DEFAULT (owner, 27 Aug). Only an explicit 'any'
  // means Anywhere — which also lands the profiles that saved the retired
  // 'specific' mode on the setting that survived, rather than on neither.
  const locationMode = dx.partnerLocationMode === 'any' ? 'any' : 'around';
  const useMyLocation = () => {
    setD({ partnerLocationMode: 'around' });
    if (!navigator.geolocation) { setLocErr('This browser cannot share a location — the city on your profile is used instead.'); return; }
    setLocErr(null); setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setD({ searchLat: lat, searchLng: lng });
        /* Best effort, and only to name the spot back to them. The distance is
           measured from the coordinates whether or not this answers. */
        geoApi.reverse(lat, lng)
          .then((place) => { if (place) setD({ searchPlace: place.short || place.label }); })
          .catch(() => undefined)
          .finally(() => setLocBusy(false));
      },
      () => { setLocErr('We could not read your location — the city on your profile is used instead.'); setLocBusy(false); },
      { timeout: 10_000 },
    );
  };

  // THE NAME QUESTION (owner, 27 Aug: the dating name can differ from the city
  // one — let the citizen decide). `undefined` means "use my city name" and is
  // what the server falls back on; a string, even an empty one, means they
  // chose to type their own. The distinction has to survive an empty box, or
  // clearing the field would silently switch them back.
  const cityName = (authUser?.name ?? '').trim();
  const usingAlias = typeof dx.firstName === 'string';
  const shownAs = shownAsPreview(dx.firstName, cityName);
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
  // THE MARK IS READ OFF THE LIVE PROFILE, not off `data`. `data` prefers the
  // save response, which is a snapshot of the moment a form was submitted and
  // so can predate a selfie taken after it — the read below is refetched by
  // both selfie mutations, which is what makes the button and the preview
  // agree. Nothing about it is inferred on this side.
  const selfieOnFile = Boolean(existing.data?.selfieOnFile ?? data?.selfieOnFile);
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
  // 'threshold' no longer exists as a choice; a profile that stored it is
  // simply visible now, and the next save writes 'everyone'.
  const visRaw: Visibility = dx.visibility ?? 'everyone';
  const visibility: Visibility = visRaw === 'threshold' ? 'everyone' : visRaw;
  const onDelete = () => del.mutate(undefined, { onSuccess: () => { setCollapsed(false); setDx({}); successToast('Dating profile deleted.'); } });

  // What each photo's review says, in one sentence, on the banner the owner
  // already reads. A photo shows to other people only once it is approved.
  const photoReviewNote = (() => {
    const statuses = Object.values(data?.photoReview ?? {});
    const pending = statuses.filter((x) => x === 'pending').length;
    const held = statuses.filter((x) => x === 'held').length;
    const rejected = statuses.filter((x) => x === 'rejected').length;
    if (!pending && !held && !rejected) return null;
    const parts = [
      pending ? `${pending} being checked` : '',
      held ? `${held} waiting for a person to look` : '',
      rejected ? `${rejected} not allowed` : '',
    ].filter(Boolean).join(', ');
    return `Photos: ${parts}. Only photos that pass are shown to other people.`;
  })();

  const StatusBanner = () => data && mod ? (
    <div style={{ marginTop: 14, background: mod.bg, color: mod.c, borderRadius: 12, padding: '11px 14px', fontSize: 13 }}>
      <strong>{mod.label}</strong>
      {data.notice && <div style={{ marginTop: 4 }}>{data.notice}</div>}
      {data.moderation !== 'approved' && data.moderationReasons.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{data.moderationReasons.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
      {/* A decision you can argue with, from the sentence that delivered it. */}
      {(data.moderation === 'rejected' || data.moderation === 'review') && (
        <div style={{ marginTop: 6 }}>
          <Link to="/dating/safety" style={{ color: 'inherit', fontWeight: 700 }}>Think we got this wrong? Appeal in the Safety Centre.</Link>
        </div>
      )}
      {photoReviewNote && <div style={{ marginTop: 6 }}>{photoReviewNote}</div>}
    </div>
  ) : null;

  if (collapsed && saved) {
    // The first letter stands up — "somen, 41" leading a dating card reads as
    // a typo, and the server now says the name the same way (shownName). Only
    // the first character is touched: the rest of the name is theirs.
    const rawName = (dx.firstName || 'Your profile').trim();
    const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    // "Is a selfie stored" — the only part of this the server can actually see,
    // and now the only place it is said from. Not identity: nothing compares it
    // to the photos. See components/SelfieOnFile.
    const verified = selfieOnFile;
    const goal = dx.relationshipGoal || 'a connection';
    const location = [dx.city, dx.state, dx.country].filter(Boolean).join(', ');
    const sign = data?.sign ?? '—';
    const hero = srcAt(0);
    const rightPhotos = [srcAt(1), srcAt(2)].filter(Boolean);
    const age = form.birthDate && !isNaN(new Date(form.birthDate).getTime())
      ? Math.floor((Date.now() - new Date(form.birthDate).getTime()) / (365.25 * 86_400_000)) : null;

    // The SAME fields a match sees on your profile detail (nothing private).
    // "Other" and "Prefer not to say" are answers to a FORM, not facts about a
    // person — on the card they read as noise between two real facts, so the
    // line simply skips them.
    const said = (v?: string | null) => (v && v !== 'Other' && v !== 'Prefer not to say' ? v : null);
    const facts = [
      said(dx.profession), said(dx.education), dx.heightCm ? `${dx.heightCm} cm` : null,
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
    const pill: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '5px 13px', fontSize: 12.5, background: 'var(--accent-soft)' };

    return (
      <div>
        {(data?.moderation !== 'approved' || data?.notice || photoReviewNote) && <StatusBanner />}
        {completion && !completion.complete && <CompletionCard completion={completion} />}

        <div className="card" style={{ marginTop: 12, padding: 16, borderRadius: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 20 }}>Profile preview</h3>
            <button type="button" onClick={() => setCollapsed(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5,
                color: 'var(--accent-ink)', background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '9px 18px' }}>
              Edit Profile <span aria-hidden>✎</span>
            </button>
          </div>

          {/* ── THE HERO, SET LIKE THE BROWSE CARD (owner, 27 Aug: "fix the
              users dating profile design"). The old collage put the hero in a
              1.5fr column, which on a phone is ~200px wide — a 30px serif name
              wrapped onto the face, "Looking for" broke mid-phrase, and the
              overlay read as clutter on the one photograph that matters. Now
              the hero is the same shape the city draws people in everywhere
              since the redesign: full width, capped like the match card, the
              type clamped to the box, everything anchored in the scrim at the
              foot. The other photos sit in a quiet row beneath. */}
          <div className="dprev">
            {hero
              ? <img src={hero} alt={displayName} style={cover} />
              : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 64, color: 'var(--accent-ink)', background: 'var(--accent-soft)', fontFamily: 'var(--serif)' }}>{displayName.slice(0, 1)}</div>}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--scrim-deep) 0%, var(--scrim-top) 32%, var(--scrim-clear) 56%)' }} />
            <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16, color: 'var(--on-scrim)', textShadow: '0 1px 2px var(--scrim-top), 0 2px 14px var(--scrim-deep)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--serif)', fontSize: 'clamp(22px, 6vw, 30px)', fontWeight: 700, lineHeight: 1.1 }}>
                <span>{displayName}{age ? `, ${age}` : ''}</span>
                <SelfieOnFile on={verified} />
              </div>
              <div style={{ fontSize: 13.5, marginTop: 5 }}>
                Looking for <strong>{goal}</strong> <span aria-hidden>♡</span>
              </div>
              {location && (
                <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 5, opacity: 0.92 }}>
                  <span aria-hidden>📍</span> {location}
                </div>
              )}
            </div>
          </div>

          {rightPhotos.length > 0 && (
            <div className="dprev-row">
              {rightPhotos.map((p, i) => (
                <div key={i} style={{ ...photoBox, aspectRatio: '1 / 1' }}>
                  <img src={p} alt="" style={cover} />
                </div>
              ))}
            </div>
          )}

          {/* Verification status line (mirrors what a match sees on the tick) */}
          <div style={{ marginTop: 12, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7 }}>
            {verified
              ? <><SelfieOnFile on size="sm" /><span className="muted">Selfie on file — your matches see this mark beside your name. It isn’t checked against your photos, and they’re told so.</span></>
              : <span className="muted">No selfie yet — <button type="button" onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-ink)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>take one with your camera</button>.</span>}
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
          <div style={{ marginTop: 18, background: 'var(--paper)', borderRadius: 'var(--r-2)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
            <span aria-hidden style={{ color: 'var(--accent-ink)' }}>✨</span>
            <span className="muted">Matches also see their live compatibility score with you.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow">Dating Hub · Your profile</div>
      <h1 style={{ fontSize: 26 }}>Tell the stars about you</h1>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
        One page, about five minutes. Your profile and photos pass a safety check before they go live.
      </p>
      <StatusBanner />
      <CompletionCard completion={completion} />

      <form onSubmit={submit}>
        <ValidationSummary missing={v.missing} />
        {/* Phase 1 — Basic info */}
        <Phase n={1} title="Basic information" />
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            {/* THE NAME THEY DATE UNDER (owner, 26 Aug: "let the user take a
                name which is shown with the profile and the chat"). The field
                always existed; what it did was said nowhere, and the browse
                cards ignored it until today. Now the server draws this name
                everywhere a match sees you — card, profile, chat — so the
                label says exactly that. Empty falls back to the account name. */}
            <div>
              <span style={label}>Name shown to matches</span>
              <label style={nameOption}>
                <input type="radio" name="dating-name" checked={!usingAlias}
                  onChange={() => setD({ firstName: undefined })} />
                <span>My city name{cityName ? ` — ${cityName}` : ''}</span>
              </label>
              <label style={nameOption}>
                <input type="radio" name="dating-name" checked={usingAlias}
                  onChange={() => setD({ firstName: '' })} />
                <span>A different name</span>
              </label>
              {usingAlias && (
                // autoComplete="off" and a non-name field id are deliberate:
                // Safari was offering the citizen's ADDRESS BOOK here — real
                // contacts, by name (owner, 27 Aug: "remove the drop down menu")
                // — on the one field in the product whose whole job is to NOT
                // be a real name.
                <input value={dx.firstName ?? ''} maxLength={40} autoFocus type="text"
                  name="dating-shown-name" id="dating-shown-name"
                  autoComplete="off" autoCapitalize="words" autoCorrect="off" spellCheck={false}
                  aria-label="The name matches see"
                  placeholder="What should they call you?"
                  onChange={(e) => setD({ firstName: e.target.value })} style={aliasField} />
              )}
              {/* WHAT WILL ACTUALLY BE SHOWN, rather than what was typed. An
                  empty "different name" falls back to the city name on the
                  server, so a form that did not say so would let somebody
                  believe they were anonymous while their real name went out. */}
              <p className="muted" style={nameNote}>
                Matches will see <strong>{shownAs}</strong> — on your card, your profile
                and in chat. Nothing else of your city identity travels with it: not your
                @handle, not your city photo, not your real name.
              </p>
            </div>
            <div ref={v.reg('gender')}><span style={label}>Gender</span>
              <select aria-label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as UpsertProfileInput['gender'] })} style={field}>
                <option value="">Select…</option>
                <option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Non-binary</option>
              </select>
              <FieldError msg={v.errors.gender} />
            </div>
            <div><span style={label}>Looking for</span>
              {/* PRECISELY, NOT COARSELY (P3). The old control offered one
                  gender or "Anyone", so bisexual could only be said as
                  "Anyone", which it is not. Three toggles; any combination.
                  The coarse column the server narrows on is derived: one
                  selection is itself, anything else is 'any', and the exact
                  list rides in extras.seekingList for the engine. */}
              <div role="group" aria-label="Looking for" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([['male', 'Men'], ['female', 'Women'], ['nonbinary', 'Non-binary people']] as const).map(([val, lab]) => {
                  const list = dx.seekingList ?? (form.seeking === 'any' ? ['male', 'female', 'nonbinary'] : [form.seeking]);
                  const on = list.includes(val);
                  return (
                    <button key={val} type="button" aria-pressed={on}
                      onClick={() => {
                        const next = on ? list.filter((x) => x !== val) : [...list, val];
                        if (!next.length) return; // seeking nobody is not a profile
                        setD({ seekingList: next });
                        setForm({ ...form, seeking: (next.length === 1 ? next[0] : 'any') as UpsertProfileInput['seeking'] });
                      }}
                      style={{ padding: '9px 14px', borderRadius: 'var(--r-full)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                        border: on ? '1px solid var(--accent)' : '1px solid var(--line)',
                        background: on ? 'var(--accent-soft)' : 'var(--card)', color: on ? 'var(--accent-ink)' : 'inherit', fontWeight: on ? 700 : 400 }}>
                      {lab}
                    </button>
                  );
                })}
              </div>
              <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>Pick every one that's true for you.</p>
            </div>
            <div ref={v.reg('birthDate')}><span style={label}>Date of birth</span><input type="date" aria-label="Date of birth" value={form.birthDate} disabled={dobLocked} title={dobLocked ? 'Set in your Master Profile' : undefined} onChange={(e) => { setForm({ ...form, birthDate: e.target.value }); v.clear('birthDate'); }} style={{ ...field, ...v.errStyle('birthDate'), ...(dobLocked ? masterLockedStyle : {}) }} />{dobLocked ? <MasterLockedNote label="Date of birth" /> : <FieldError msg={v.errors.birthDate} />}</div>
            <div><span style={label}>Time of birth <span style={{ textTransform: 'none' }}>(optional)</span></span><input type="time" aria-label="Time of birth" step={60} value={form.birthTime ?? ''} onChange={(e) => setForm({ ...form, birthTime: e.target.value })} style={field} /><p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>Type or pick your exact time.</p></div>
            <div><span style={label}>Place of birth <span style={{ textTransform: 'none' }}>(optional)</span></span><input value={form.birthPlace ?? ''} placeholder="City" onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} style={field} /></div>

            <div style={{ gridColumn: '1 / -1', margin: '10px 0 -2px' }}>
              <span style={{ ...label, margin: 0 }}>📍 Your current location</span>
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
            <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--danger-ink)' }}>{photoError}</p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {photos.map((_p, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {srcAt(i)
                  ? <img src={srcAt(i)} alt="" style={{ width: 72, height: 72, borderRadius: 'var(--r-1)', objectFit: 'cover' }} />
                  /* Uploaded, saved, not yet signed for display. Says so rather
                     than rendering a broken image frame. */
                  : <div style={{ width: 72, height: 72, borderRadius: 'var(--r-1)', background: 'var(--paper)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: 4 }}>Saved · reload to view</div>}
                <button type="button" onClick={() => removePhoto(i)} aria-label="Remove"
                  style={{ minWidth: 44, minHeight: 44, position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--danger-ink)', color: 'var(--on-accent)', cursor: 'pointer', fontSize: 12 }}>×</button>
              </div>
            ))}
            {photos.length < 10 && (
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add a photo"
                style={{ width: 72, height: 72, borderRadius: 'var(--r-1)', border: '1.5px dashed var(--line)', background: 'transparent', cursor: 'pointer', fontSize: 22, color: 'var(--muted)' }}>＋</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPhotos(e.target.files)} />
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{photos.length < 1 ? 'Add at least 1 photo to go live — 3 or more is recommended for better matches (a clear face photo first).' : photos.length < 3 ? `You’re good to go live — add ${3 - photos.length} more to reach the recommended 3+ for better matches.` : 'First photo is your primary — make it a clear face photo.'}</p>

          <SelfieVerify
            onFile={selfieOnFile}
            onSaved={(key) => saveSelfie.mutate(key)}
            onClear={() => clearSelfie.mutate()}
            saving={saveSelfie.isPending}
            clearing={clearSelfie.isPending}
            failed={saveSelfie.isError ? 'Your selfie reached us but couldn’t be saved to your profile. Please try again.'
              : clearSelfie.isError ? 'We couldn’t remove your selfie. Please try again.' : null}
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
            <div>
              {/* NOT the fitness hub's question. That one is an ABILITY
                  TIER and it sets training days and an intensity ceiling;
                  this is how somebody describes themselves to another
                  citizen. See shared/fitness-level.ts. */}
              <span style={label}>How active you are</span>
              <SearchSelect category="exercise" value={dx.fitnessLevel ?? ''} placeholder="Select"
                onChange={(o) => setD({ fitnessLevel: o?.label })} />
              <span className="muted" style={{ fontSize: 11, lineHeight: 1.5, display: 'block', marginTop: 4 }}>
                Shown on your profile. It does not set your workout plan or your calorie target —
                the Fitness and Nutrition hubs ask those separately.
              </span>
            </div>
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
              {/* A SLIDER, NOT A STEPPER (owner, 27 Aug). A radius is a feel, not
                  a figure typed to the kilometre — the slider says that, and the
                  live readout keeps the exact number a stepper gave. 500 is the
                  top of the track and reads as "500 km or further", so the whole
                  useful range is one thumb-drag rather than fifty taps. */}
              <span style={label}>Distance — {distanceKm >= 500 ? '500+ km' : `${distanceKm} km`}</span>
              <input type="range" min={5} max={500} step={5} value={Math.min(distanceKm, 500)}
                aria-label="Maximum distance in kilometres"
                onChange={(e) => setD({ prefDistanceKm: Number(e.target.value) })} style={distanceSlider} />
              {/* shared/geo.ts resolves ~140 cities to coordinates, so the
                  distance is measured, not guessed; a city outside that list
                  falls back to place names, with the preference left out rather
                  than applied to a distance nobody measured. */}
              <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, display: 'block', marginTop: 4 }}>
                Shapes scores rather than hiding people — someone further away still appears, scored lower.
              </span>
            </label>
            <div><span style={label}>Diet</span><SearchSelect category="diet" value={dx.prefDiet ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ prefDiet: o?.label })} /></div>
            <div><span style={label}>Wants children</span><SearchSelect category="wantsChildren" value={dx.wantsChildren ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ wantsChildren: o?.label })} /></div>
            <div><span style={label}>Smoking</span><SearchSelect category="smoking" value={dx.prefSmoking ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ prefSmoking: o?.label })} /></div>
            <div><span style={label}>Drinking</span><SearchSelect category="alcohol" value={dx.prefDrinking ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ prefDrinking: o?.label })} /></div>
            <div><span style={label}>Religion <span style={{ textTransform: 'none' }}>(optional)</span></span><SearchSelect category="religion" value={dx.religion ?? ''} clearable clearLabel="Any" placeholder="Any" onChange={(o) => setD({ religion: o?.label })} /></div>
          </div>

          {/* TWO SETTINGS, AND DISTANCE IS MEASURED FROM ONE OF THEM. Tapping
              "Current location" asks the browser again, so a citizen who moved
              — or who refused the prompt the first time — has one way back. */}
          <span style={label}>Where to find your partner</span>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <Chip on={locationMode === 'around'} onClick={useMyLocation}>📍 Current location</Chip>
            <Chip on={locationMode === 'any'} onClick={() => setD({ partnerLocationMode: 'any' })}>🌍 Anywhere</Chip>
          </div>
          <span className="muted" style={locHint}>
            {locationMode === 'any'
              ? 'Distance still orders your matches — it just never rules anybody out.'
              : locBusy ? 'Asking your browser where you are…'
                : locErr ? locErr
                  : dx.searchPlace ? `Distance is measured from ${dx.searchPlace}.`
                    : typeof dx.searchLat === 'number' ? 'Distance is measured from your current location.'
                      : 'Distance is measured from the city on your profile. Tap “Current location” to use where you actually are.'}
          </span>

          <span style={label}>Deal breakers (optional)</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{DEAL_BREAKERS.map((v) => <Chip key={v} on={(dx.dealBreakers ?? []).includes(v)} onClick={() => setD({ dealBreakers: capToggle(dx.dealBreakers, v, 5) })}>{v}</Chip>)}</div>
        </div>

        {/* AI auto-calculated — no user input */}
        <div className="card" style={{ marginTop: 16, background: 'var(--accent-soft)', border: 'none' }}>
          <div className="eyebrow">✨ The AI calculates automatically</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>Computed from your details, for every candidate:</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{AI_DIMENSIONS.map((d) => <span key={d} className="tag">{d}</span>)}</div>
          {/* Not decoration: astrology is 0.90 of the weight table, so the six
              answers below it share a tenth between them. Somebody deciding
              whether to fill this form in is entitled to know that. */}
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '8px 0 0' }}>
            Astrology is nine tenths of the reading. The other six share what is left.
          </p>
        </div>

        {/* Visibility + delete — only meaningful once a profile exists, but the
            controls are always available so the user can set them up-front. */}
        <VisibilityCard visibility={visibility}
          onChange={(vv) => setD({ visibility: vv })} />

        <DeleteProfileCard onDelete={onDelete} deleting={del.isPending} />

        {/* CONSENT, SAID ONCE, WHERE IT IS TRUE. Who somebody seeks and their
            religion are special-category data; both are read by the matching
            filters. The profile does not save until the citizen has said so,
            and the time they said it is kept in the profile. */}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 18, fontSize: 13, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(dx.sensitiveConsentAt)} required
            onChange={(e) => setD({ sensitiveConsentAt: e.target.checked ? new Date().toISOString() : undefined })}
            style={{ marginTop: 3 }} />
          <span>I agree that who I&rsquo;m seeking and, if I give it, my religion are used to filter and score my matches. Neither is shown to other people; I can delete my dating profile at any time.</span>
        </label>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button type="submit" variant="accent" disabled={upsert.isPending || !dx.sensitiveConsentAt}>{upsert.isPending ? 'Saving…' : saved ? 'Save profile' : 'Create profile'}</Button>
          {data?.sign && <span className="pill" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '6px 14px', fontSize: 12.5 }}>✨ Your sign: <strong>{data.sign}</strong></span>}
        </div>
      </form>
    </div>
  );
}
