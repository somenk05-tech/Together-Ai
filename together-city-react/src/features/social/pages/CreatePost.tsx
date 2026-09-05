import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation as useRouteLocation, useNavigate } from 'react-router-dom';
import { useConnections } from '@/api';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useDialog } from '@/hooks/useDialog';
import { Avatar } from '../PostCard';
import { Confirm } from '../Confirm';
import { useCreatePost } from '../api';
import { MUSIC_LIBRARY, type Track } from '../musicLibrary';

// `file` is kept for media that uploads to storage (video) — the `src` is only a
// local preview; the real post URL comes from the R2 upload on share.
/**
 * One attachment on its way into a post.
 *
 * `src` is an OBJECT URL for previewing, never a data URL. `file` is always
 * present now — photographs are re-encoded to a small JPEG File rather than a
 * base64 string, so every attachment takes the same road into the bucket.
 * `key` and `posterKey` are the upload results, kept on the item so a retry
 * after a half-failed batch does not re-upload what already landed (30 Aug
 * audit: `Promise.all` discarded the successes and orphaned them in R2).
 */
interface MediaItem {
  type: 'image' | 'video'; src: string; file: File;
  dur?: number; portrait?: boolean; poster?: File;
  key?: string; posterKey?: string;
}

/** Grab a still frame from a video as a JPEG File, to upload as its poster —
 *  so feed/profile grids show a real thumbnail and never fetch the video just
 *  to render a frame. Best-effort: resolves null if the browser can't decode. */
function genPoster(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
      const done = (f: File | null) => { URL.revokeObjectURL(url); resolve(f); };
      v.onloadedmetadata = () => { try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch { done(null); } };
      v.onseeked = () => {
        try {
          const w = v.videoWidth, h = v.videoHeight;
          if (!w || !h) return done(null);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return done(null);
          ctx.drawImage(v, 0, 0, w, h);
          canvas.toBlob((blob) => done(blob ? new File([blob], 'poster.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.8);
        } catch { done(null); }
      };
      v.onerror = () => done(null);
    } catch { resolve(null); }
  });
}

/** Photo editor — Filters (one-tap looks) + Adjust (colour grading sliders).
 *  Applies via the canvas `filter` and bakes the result into a new JPEG that
 *  replaces the image before posting.
 *
 *  A FILE, NOT A DATA URL (4 Sep audit). It handed back a data URL, the
 *  composer wrote it into `src` — the preview — and the upload sent `file`,
 *  which was still the untouched original. Every filter and every slider was
 *  shown to the citizen and never reached the server. The edit is a File now,
 *  and the item's upload key is dropped so the edited picture is what goes. */
function ImageEditor({ src, onClose, onApply }: { src: string; onClose: () => void; onApply: (edited: { src: string; file: File }) => void }) {
  const [pane, setPane] = useState<'filters' | 'adjust'>('filters');
  const [extra, setExtra] = useState('');
  const [b, setB] = useState(1);
  const [c, setC] = useState(1);
  const [s, setS] = useState(1);
  const [busy, setBusy] = useState(false);
  const filter = `${extra} brightness(${b}) contrast(${c}) saturate(${s})`.trim();

  const PRESETS: { name: string; extra: string; b: number; c: number; s: number }[] = [
    { name: 'Original', extra: '', b: 1, c: 1, s: 1 },
    { name: 'Vivid', extra: '', b: 1.03, c: 1.12, s: 1.4 },
    { name: 'Warm', extra: 'sepia(0.25)', b: 1.03, c: 1.05, s: 1.2 },
    { name: 'Cool', extra: 'hue-rotate(-12deg)', b: 1.03, c: 1.05, s: 1.1 },
    { name: 'B&W', extra: 'grayscale(1)', b: 1, c: 1.1, s: 1 },
    { name: 'Vintage', extra: 'sepia(0.4)', b: 1.05, c: 0.95, s: 1.2 },
    { name: 'Fade', extra: '', b: 1.1, c: 0.9, s: 0.82 },
    { name: 'Noir', extra: 'grayscale(1)', b: 0.95, c: 1.35, s: 1 },
  ];
  // Named applyPreset, not usePreset: it is a plain handler, and a `use`
  // prefix tells both React's lint rule and the next reader that it is a hook.
  const applyPreset = (p: (typeof PRESETS)[number]) => { setExtra(p.extra); setB(p.b); setC(p.c); setS(p.s); };

  const apply = () => {
    setBusy(true);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { onClose(); return; }
        (ctx as CanvasRenderingContext2D & { filter: string }).filter = filter;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) { onClose(); return; }
          const file = new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' });
          onApply({ src: URL.createObjectURL(file), file });
        }, 'image/jpeg', 0.9);
      } catch { onClose(); }
    };
    img.onerror = () => onClose();
    img.src = src;
  };

  const sheet = useDialog(onClose);

  const slider = (label: string, val: number, set: (n: number) => void, min: number, max: number) => (
    <label className="sl-ed-row">
      <span className="sl-ed-lab">
        <span>{label}</span><span className="muted">{Math.round(val * 100)}%</span>
      </span>
      <input type="range" min={min} max={max} step={0.01} value={val} onChange={(e) => set(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="tc-edit-photo-title" tabIndex={-1}
        onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(560px,96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <h3 id="tc-edit-photo-title" style={{ margin: '0 0 10px', fontSize: 17 }}>Edit photo</h3>
        <div className="sl-ed-stage">
          <img src={src} alt="" style={{ width: '100%', maxHeight: '46vh', objectFit: 'contain', display: 'block', filter }} />
        </div>
        <div className="sl-ed-btns">
          <button type="button" className={`pill ${pane === 'filters' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setPane('filters')}>Filters</button>
          <button type="button" className={`pill ${pane === 'adjust' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setPane('adjust')}>Adjust</button>
        </div>
        {pane === 'filters' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => {
              const pf = `${p.extra} brightness(${p.b}) contrast(${p.c}) saturate(${p.s})`.trim();
              const active = pf === filter;
              return (
                <button key={p.name} type="button" onClick={() => applyPreset(p)}
                  style={{ cursor: 'pointer', border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--r-1)', padding: 0, background: 'none', overflow: 'hidden', width: 72 }}>
                  <img src={src} alt="" style={{ width: 72, height: 54, objectFit: 'cover', display: 'block', filter: pf }} />
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 600, padding: '3px 0' }}>{p.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            {slider('Brightness', b, setB, 0.5, 1.5)}
            {slider('Contrast', c, setC, 0.5, 1.5)}
            {slider('Saturation', s, setS, 0, 2)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn btn-accent btn-sm" disabled={busy} onClick={apply}>{busy ? 'Applying…' : 'Apply'}</button>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** Pick a custom cover frame for a video before posting. The video is a local
 *  file (data URL), so capturing the current frame to a canvas has no CORS
 *  issues. Returns a JPEG File used as the post's permanent poster (thumbUrl). */
function CoverPicker({ item, onClose, onPick }: { item: MediaItem; onClose: () => void; onPick: (poster: File) => void }) {
  const vref = useRef<HTMLVideoElement>(null);
  const sheet = useDialog(onClose);
  const capture = () => {
    const v = vref.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => { if (blob) onPick(new File([blob], 'poster.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.85);
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div ref={sheet} role="dialog" aria-modal="true" aria-labelledby="tc-cover-title" tabIndex={-1}
        onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(560px,96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <h3 id="tc-cover-title" style={{ margin: '0 0 8px', fontSize: 17 }}>Choose cover frame</h3>
        <video ref={vref} src={item.src} controls playsInline muted
          style={{ width: '100%', borderRadius: 'var(--r-1)', background: 'var(--media-bg)', maxHeight: '60vh', display: 'block' }} />
        <p className="sl-said sl-said-mid">Scrub to the frame you want, pause, then set it as the cover.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-accent btn-sm" onClick={capture}>Use this frame</button>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
/** Frame ratio: 9:16 for vertical media, 16:9 for landscape. */
const frameRatio = (portrait?: boolean) => (portrait ? '9 / 16' : '16 / 9');

// Inline-media limits (until object storage is configured). A 75 MB video is
// ~100 MB as base64; the server body limit is raised to match.
/* THE TWO CAPS DISAGREED, AND THE CLIENT'S WAS THE HIGHER ONE (30 Aug audit).
   The server refuses a presign over MAX_UPLOAD_BYTES, which defaults to 50 MB,
   while this file waved through 75 — so a 60 MB clip passed the check the
   citizen could see and was refused by the one they could not, after they had
   written the caption. A client ceiling above the server's is not a limit, it
   is a trap. 50 here, and the total is what one post may carry across all ten
   attachments. */
/* UP TO AN HOUR, UP TO TWO GIGABYTES (owner, 5 Sep). The server's
   MAX_POST_VIDEO_BYTES is the same 2 GiB, signed into the upload URL, so the
   two caps still agree — the rule above stands, the number moved. The hour is
   read from the file's metadata here and refused before anything is uploaded;
   the server cannot know a clip's length without pulling the whole object. */
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // matches MAX_POST_VIDEO_BYTES on the API
const MAX_VIDEO_SECONDS = 60 * 60;
const MAX_TOTAL_BYTES = MAX_VIDEO_BYTES + 60 * 1024 * 1024; // one full-length video plus the photographs
const mb = (b: number) => Math.round(b / (1024 * 1024));
const sizeMB = (b: number) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);
/** Human format label for a picked video file, e.g. "MP4" / "MOV" / "WEBM". */
const fileFmt = (f?: File): string => {
  const t = (f?.type || '').split('/')[1] || '';
  if (t === 'quicktime') return 'MOV';
  if (t) return t.toUpperCase();
  return (f?.name.split('.').pop() || 'VIDEO').toUpperCase();
};
const VIDEO_FORMATS = 'MP4, WebM or MOV';

/** The half of a composer that can be written down: the words, not the files. */
interface Draft {
  text?: string; feeling?: string | null; placeName?: string;
  hashtags?: string[]; tagged?: Array<{ id: string; name: string; handle: string }>;
  audience?: string; category?: string;
}
const DRAFT_KEY = 'tc-post-draft';
function savedDraft(): Draft | null {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null; } catch { return null; }
}
function writeDraft(d: Draft): void {
  try {
    // An empty composer has no draft — writing one would resurrect a blank
    // "you had something here" the next time the page opens.
    const empty = !d.text?.trim() && !d.placeName?.trim() && !d.hashtags?.length && !d.tagged?.length && !d.feeling;
    if (empty) sessionStorage.removeItem(DRAFT_KEY);
    else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch { /* private mode, or full — the draft is a courtesy, not a promise */ }
}
function clearDraft(): void {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}
/* `dataUrlBytes` lived here and went with the data URLs: nothing in a post
   is base64 any more, so there is no decoded size to guess at. */
/**
 * Downscale + re-encode a photo, and hand back a FILE.
 *
 * It used to hand back `canvas.toDataURL(...)` — and that one line is where a
 * photograph stopped being an upload and became a base64 string stored in
 * Postgres, re-sent in every feed page, uncacheable by any browser or CDN, and
 * broadcast down the websocket to every follower. `toBlob` is the same
 * re-encode with a File at the end of it, and an object URL to look at while
 * you write the caption.
 */
const MAXDIM = 1600;
/**
 * ── AND A SECOND, SMALL ONE, WHICH IS WHAT THE GRIDS ACTUALLY SHOW ──────────
 *
 * A video has carried a poster frame since the composer was written, and every
 * grid in the app renders it instead of the video. An image had no equivalent:
 * the profile grid, the desktop wall and the share tiles all loaded the FULL
 * 1600px photograph to fill a box a few hundred pixels wide — eighteen of them
 * on a profile, decoded on the main thread, for perhaps a twentieth of the
 * pixels each.
 *
 * `THUMBDIM` is 640: enough for a three-across grid on a 2x phone and for a
 * wall tile on a desktop, and about a twentieth of the bytes. The full image is
 * still what the feed card and the opened post show — a thumbnail there would
 * be visibly soft, and the card is the one place the photograph is the point.
 *
 * It rides the poster machinery that already exists rather than a second
 * upload path: `item.poster` is uploaded to `posterKey` and sent as `thumbUrl`,
 * which is exactly what a video does. One shape, two kinds of media.
 */
const THUMBDIM = 640;

/** Draw `img` into a JPEG File no larger than `maxDim` on its longest edge. */
const encodeAt = (img: HTMLImageElement, maxDim: number, quality: number, name: string): Promise<File> =>
  new Promise((resolve, reject) => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext('2d');
    if (!ctx) return reject(new Error('no canvas'));
    ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return reject(new Error('encode failed'));
      resolve(new File([blob], name, { type: 'image/jpeg' }));
    }, 'image/jpeg', quality);
  });

const compressImage = (f: File): Promise<{ file: File; thumb: File; src: string; portrait: boolean }> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
  img.onload = () => {
    URL.revokeObjectURL(url);
    const stem = (f.name || 'photo').replace(/\.[^.]+$/, '');
    Promise.all([
      encodeAt(img, MAXDIM, 0.82, `${stem}.jpg`),
      // Lower quality as well as fewer pixels: at 640px on a grid tile the
      // difference is invisible and it is another third off the wire.
      encodeAt(img, THUMBDIM, 0.72, `${stem}-thumb.jpg`),
    ]).then(([file, thumb]) => {
      resolve({ file, thumb, src: URL.createObjectURL(file), portrait: img.height > img.width });
    }).catch(reject);
  };
  img.src = url;
});

const FEELINGS = ['😊 Happy', '😌 Relaxed', '🤩 Excited', '🙏 Grateful', '✨ Blessed', '❤️ Loved', '🧭 Adventurous', '🌇 Nostalgic', '🎉 Celebrating', '☕ Cosy'];

export const AUDIENCES = [
  { key: 'public', label: 'Public', icon: 'globe', hint: 'Everyone in your city network' },
  { key: 'friends', label: 'Friends', icon: 'people', hint: 'Your accepted connections' },
  { key: 'family', label: 'Family', icon: 'connection', hint: 'Connections marked Family in People' },
  { key: 'private', label: 'Only Me', icon: 'shield', hint: 'Visible only to you' },
] as const;
export type AudienceKey = typeof AUDIENCES[number]['key'];

/** Deterministic composer suggestions — hashtags, mood and places inferred
 *  from what's being typed (no API round-trip, instant). */
const TOPIC_TAGS: Array<[RegExp, string[]]> = [
  [/coffee|cafe|latte|espresso|brew/i, ['#Coffee', '#CafeLife']],
  [/sunset|evening|dusk/i, ['#Sunset', '#GoldenHour']],
  [/beach|sea|ocean|marine drive/i, ['#SeaSide', '#BeachDay']],
  [/food|dinner|lunch|breakfast|thali|biryani|pizza/i, ['#Foodie', '#GoodEats']],
  [/travel|trip|flight|paris|goa|vacation|holiday/i, ['#Travel', '#Wanderlust']],
  [/gym|workout|run|running|fitness|yoga/i, ['#Fitness', '#NoExcuses']],
  [/movie|film|show|concert|music/i, ['#Entertainment', '#ShowTime']],
  [/rain|monsoon|weather/i, ['#Monsoon', '#RainyDay']],
  [/friend|family|together|reunion/i, ['#Together', '#GoodTimes']],
  [/work|office|meeting|project/i, ['#WorkLife', '#Hustle']],
];
const MOOD_HINTS: Array<[RegExp, string]> = [
  [/amazing|great|awesome|wonderful|best/i, '🤩 Excited'],
  [/relax|calm|peace|chill|cosy|cozy/i, '😌 Relaxed'],
  [/grateful|thankful|blessed/i, '🙏 Grateful'],
  [/love|loved|❤️/i, '❤️ Loved'],
  [/coffee|tea|rain|book/i, '☕ Cosy'],
  [/trip|travel|explore|adventure/i, '🧭 Adventurous'],
];
/* PLACE_HINTS IS GONE (30 Aug audit).
   Seven regexes over seven hardcoded strings, offered under a pin icon as
   though the composer had looked something up. It had not: it matched your own
   words and handed them back with a city appended — /bandra/ → "Bandra,
   Mumbai" for anyone anywhere, and /eiffel|paris/ → "Paris" for a post about
   plaster of Paris. A place is where the citizen was; the field takes their
   words, and the pin takes a real fix from the device. Guessing between the
   two was the only part that was invented. */

function fmtBadge(dur: number | undefined): { text: string; eligible: boolean } {
  const d = dur || 0;
  const mm = Math.floor(d / 60);
  const ss = d % 60;
  const el = d >= 180;
  if (!d) return { text: 'video', eligible: false };
  // The badge used to read "✓ ₹100" past three minutes, and "(need 3:00)" below
  // it — a target for a payment that does not exist. It is a duration now,
  // because that is the only true thing it ever knew.
  return { text: `${mm}:${ss < 10 ? '0' : ''}${ss}`, eligible: el };
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-1)', padding: '11px 13px',
  fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none',
};

/** 🎵 Music picker — pick a royalty-free library track to play over a video
 *  post's reel. Tap a chip to select; tap play/pause to preview. Only one track
 *  previews at a time. Tracks whose file 404s are hidden automatically. */
function MusicPicker({ selected, onSelect, stopSignal }: { selected: Track | null; onSelect: (t: Track | null) => void; stopSignal?: boolean }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => { audioRef.current?.pause(); audioRef.current = null; setPreviewId(null); };

  // Stop the audition the moment the post starts uploading (stopSignal flips),
  // so preview music never keeps playing into the share flow.
  useEffect(() => { if (stopSignal) stop(); }, [stopSignal]);
  // Safety net: also stop if the composer unmounts (navigating away after a
  // successful post) — the detached Audio() would otherwise keep playing.
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  const preview = (t: Track) => {
    if (previewId === t.id) { stop(); return; }
    audioRef.current?.pause();
    const a = new Audio(t.url);
    a.volume = 0.8;
    a.play().then(() => { audioRef.current = a; setPreviewId(t.id); })
      .catch(() => { setMissing((m) => new Set(m).add(t.id)); });
    a.onended = () => setPreviewId((p) => (p === t.id ? null : p));
  };

  const tracks = MUSIC_LIBRARY.filter((t) => !missing.has(t.id));

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span className="sl-hint-row"><Icon name="music" size={14} />Music</span>
        {/* "COPYRIGHT-SAFE" IS A LEGAL ASSURANCE, AND THIS SCREEN CANNOT GIVE
            ONE (30 Aug audit). What the app actually knows is narrower and
            still worth saying: this list is the only audio a post can carry,
            because the API refuses any musicUrl outside /music/. That is a
            fact about the product, not a warranty about a catalogue. */}
        <span title="These are the only tracks a post can carry — you can’t attach your own audio."
          style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-full)', background: 'var(--paper)', color: 'var(--ink-soft)', border: '1px solid var(--line)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="shield" size={13} /> Built-in tracks only
        </span>
        <button type="button" onClick={() => { stop(); onSelect(null); }}
          style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 'var(--r-full)',
            border: `1.5px solid ${!selected ? 'var(--accent)' : 'var(--line)'}`,
            background: !selected ? 'var(--accent)' : 'var(--card)', color: !selected ? 'var(--on-accent)' : 'var(--ink)' }}>
          None
        </button>
      </div>
      <div className="tc-hscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {tracks.map((t) => {
          const active = selected?.id === t.id;
          return (
            <div key={t.id}
              style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12,
                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--card))' : 'var(--card)' }}>
              <button type="button" onClick={() => preview(t)}
                style={{ minWidth: 44, minHeight: 44, width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, flex: '0 0 auto' }}>
                <Icon name={previewId === t.id ? 'pause' : 'play'} size={13} />
              </button>
              <button type="button" onClick={() => { onSelect(active ? null : t); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.title}</div>
                <div className="muted" style={{ fontSize: 11 }}>{t.mood ?? t.artist ?? 'Track'}{t.license ? ` · ${t.license}` : ''}</div>
              </button>
              {active && <span style={{ color: 'var(--accent-ink)', display: 'inline-flex' }}><Icon name="accepted" size={15} /></span>}
            </div>
          );
        })}
        {tracks.length === 0 && (
          <span className="sl-hint">No tracks available yet — add MP3s to public/music/.</span>
        )}
      </div>
    </div>
  );
}

/** Social Life · Create Post — ONE composer for text, photos, videos,
 *  check-ins, feelings, tagged friends, hashtags and audience. Nothing is
 *  mandatory except having SOMETHING to share: a photo alone, a video alone,
 *  a check-in alone or a thought alone all make a post. */
/** What a post may carry, as tiles. The seventh and eighth things a post has —
 *  who may read it and which shelf it belongs on — are settings rather than
 *  attachments, and they are a list below rather than a tile here. */
const ATTACH: ReadonlyArray<{ key: string; label: string; icon: IconName; tint: string }> = [
  { key: 'photos', label: 'Photos', icon: 'camera', tint: 'blue' },
  { key: 'video', label: 'Video', icon: 'video', tint: 'green' },
  { key: 'location', label: 'Location', icon: 'place', tint: 'purple' },
  { key: 'feeling', label: 'Feeling', icon: 'mood', tint: 'amber' },
  { key: 'tag', label: 'Tag people', icon: 'people', tint: 'pink' },
  { key: 'hashtags', label: 'Hashtags', icon: 'hash', tint: 'orange' },
];

/** Mirrors CreatePostSchema's `text: z.string().max(2200)`, so the counter under
 *  the box is the server's ceiling and not a number chosen to look tidy. */
const TEXT_MAX = 2200;

export function CreatePost() {
  const nav = useNavigate();
  const route = useRouteLocation();
  const { user } = useAuth();
  const create = useCreatePost();
  const connections = useConnections('accepted');
  const photoPicker = useRef<HTMLInputElement>(null);
  const videoPicker = useRef<HTMLInputElement>(null);

  /**
   * ── THE DRAFT SURVIVES LEAVING THE PAGE (30 Aug audit) ────────────────────
   *
   * Every field here was plain `useState` with nothing behind it: no storage,
   * no `beforeunload`, no route guard, and a Cancel link that was a bare
   * `<Link>`. Two thousand characters and a check-in went on a stray Back tap,
   * on a mis-tapped nav item, and whenever a phone browser killed the tab to
   * reclaim memory — which, until this commit, the composer was doing its best
   * to provoke by holding a 75 MB video in a JavaScript string.
   *
   * WHAT IS KEPT IS THE WRITING, NOT THE FILES. A File cannot be serialised and
   * an object URL does not survive a reload, so the photographs cannot come
   * back and the draft says so rather than pretending. sessionStorage and not
   * localStorage: a draft belongs to this tab and this sitting, and a stale one
   * resurfacing next week on a shared computer is its own small betrayal.
   */
  const [text, setText] = useState(() => savedDraft()?.text ?? '');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [leaving, setLeaving] = useState(false);
  /* Whether there WAS one when this page opened — so the notice can say so
     once, and say plainly that the pictures did not come back with it. */
  const [restored, setRestored] = useState(() => Boolean(savedDraft()?.text?.trim()));
  /**
   * Object URLs are handles on decoded bytes, and the browser holds them until
   * they are revoked. A composer that is opened, filled with four photographs
   * and a clip, and then left by the back button keeps all of it alive for the
   * life of the document otherwise. The ref is the live list — reading `media`
   * inside a mount-only cleanup would revoke the empty array it closed over.
   */
  const mediaRef = useRef<MediaItem[]>([]);
  mediaRef.current = media;
  useEffect(() => () => { for (const m of mediaRef.current) URL.revokeObjectURL(m.src); }, []);
  const [feeling, setFeeling] = useState<string | null>(() => savedDraft()?.feeling ?? null);
  const [placeName, setPlaceName] = useState(() => savedDraft()?.placeName ?? '');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStat, setGeoStat] = useState('');
  const [hashtags, setHashtags] = useState<string[]>(() => savedDraft()?.hashtags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [tagged, setTagged] = useState<Array<{ id: string; name: string; handle: string }>>(() => savedDraft()?.tagged ?? []);
  const [audience, setAudience] = useState<AudienceKey>(() => (savedDraft()?.audience as AudienceKey) ?? 'public');
  const [category, setCategory] = useState<'' | 'work' | 'personal'>(() => (savedDraft()?.category as '' | 'work' | 'personal') ?? '');
  const [music, setMusic] = useState<Track | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const navTimer = useRef<number | null>(null);
  useEffect(() => () => { if (navTimer.current) window.clearTimeout(navTimer.current); }, []);
  // Written on every change rather than on a timer: the tab can be killed
  // between two keystrokes and a debounce is exactly the window that loses the
  // sentence somebody was in the middle of.
  useEffect(() => {
    writeDraft({ text, feeling, placeName, hashtags, tagged, audience, category });
  }, [text, feeling, placeName, hashtags, tagged, audience, category]);
  // Share lifecycle: idle → sharing → success (→ navigate) | error
  const [phase, setPhase] = useState<'idle' | 'sharing' | 'success' | 'error'>('idle');
  // Bytes sent so far over bytes to send, across every attachment: the one
  // number a two-gigabyte upload owes the person waiting on it.
  const [sent, setSent] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [coverPick, setCoverPick] = useState<number | null>(null);
  const [editPick, setEditPick] = useState<number | null>(null);
  const busy = phase === 'sharing' || phase === 'success';

  /**
   * THE FEED'S WRITE-BOX LANDS ON THE CONTROL IT WAS TAPPED WITH.
   *
   * SocialFeed's composer is a door, not a second composer, so it arrives here
   * carrying the name of the tile it was opened from. The router state is
   * cleared straight away — a back/forward or a refresh must not re-open a
   * picker somebody has already dismissed.
   *
   * A file dialog needs the user's activation and a route change spends most of
   * it, so the click is best-effort and the tile is FOCUSED either way: if the
   * browser refuses the dialog, the control is one tap away and visibly so.
   */
  useEffect(() => {
    const tool = (route.state as { tool?: string } | null)?.tool;
    if (!tool) return;
    nav(route.pathname, { replace: true, state: null });
    if (tool === 'photos' || tool === 'video') {
      (tool === 'photos' ? photoPicker : videoPicker).current?.click();
      document.getElementById(`sl-attach-${tool}`)?.focus();
      return;
    }
    setOpen(tool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setMediaError(null);
    for (const f of Array.from(files)) {
      const isVid = /^video\//.test(f.type);
      try {
        if (isVid) {
          if (f.size > MAX_VIDEO_BYTES) {
            setMediaError(`"${f.name}" is ${mb(f.size)} MB — a video can be up to 2 GB and an hour long.`);
            continue;
          }
          /* AN OBJECT URL, NOT A 100 MB STRING (30 Aug audit). This read a
             75 MB video into a base64 data URL — a ~100 MB JavaScript string —
             purely so a <video> could preview it, and then kept it in state for
             the life of the composer. `genPoster` thirty lines up was already
             doing it the cheap way. */
          const src = URL.createObjectURL(f);
          const item: MediaItem = { type: 'video', src, file: f };
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.onloadedmetadata = () => {
            item.dur = Math.round(v.duration) || 0;
            item.portrait = v.videoHeight > v.videoWidth;
            if (item.dur > MAX_VIDEO_SECONDS) {
              // Refused here, whole, before a byte goes up: an hour is the rule.
              setMediaError(`"${f.name}" runs ${Math.round(item.dur / 60)} minutes — a video can be up to an hour long.`);
              setMedia((prev) => prev.filter((x) => x !== item));
              URL.revokeObjectURL(src);
              return;
            }
            setMedia((prev) => [...prev]);
          };
          v.src = src;
          // Capture a permanent poster frame now (from the local file — no CORS),
          // so the grid shows a stored thumbnail forever and never fetches the video.
          void genPoster(f).then((poster) => { if (poster) { item.poster = poster; setMedia((prev) => [...prev]); } });
          setMedia((prev) => [...prev, item].slice(0, 10));
        } else {
          // Photos are downscaled + re-encoded so they always post as small JPEGs.
          const { file, thumb, src, portrait } = await compressImage(f);
          // `poster` is the grid-sized copy. Same field a video's cover frame
          // uses, so the upload and the retry logic below need no second case.
          const item: MediaItem = { type: 'image', src, file, portrait, poster: thumb };
          setMedia((prev) => [...prev, item].slice(0, 10));
        }
      } catch {
        setMediaError(`Couldn't process "${f.name}". Try a different file.`);
      }
    }
  };

  const useLocation = () => {
    setGeoStat('Getting your location…');
    if (!navigator.geolocation) { setGeoStat('Geolocation is not supported here — type the place name instead.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStat(`Pinned: ${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`); },
      () => setGeoStat('Couldn’t get a fix — the place name still shows on your post.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const suggestions = useMemo(() => {
    const tags = new Set<string>();
    let mood: string | null = null;
    for (const [re, ts] of TOPIC_TAGS) if (re.test(text)) ts.forEach((t) => tags.add(t));
    for (const [re, m] of MOOD_HINTS) if (!mood && re.test(text)) mood = m;
    return {
      tags: [...tags].filter((t) => !hashtags.includes(t)).slice(0, 4),
      mood: mood && mood !== feeling ? mood : null,
    };
  }, [text, hashtags, feeling]);
  const hasSuggestions = suggestions.tags.length > 0 || Boolean(suggestions.mood);

  // `hashtags` goes into the post body a few lines down but was missing here,
  // so a post of nothing but tags could be composed and never shared.
  const canShare = Boolean(text.trim()) || media.length > 0 || Boolean(placeName.trim()) || hashtags.length > 0;

  const share = async () => {
    if (busy || !canShare) return; // prevent duplicate submissions
    // Everything uploads now, so the ceiling is the total on the wire rather
    // than "the part of it that travels inline as base64".
    const totalBytes = media.reduce((n, m) => n + m.file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      setMediaError(`These files total ${mb(totalBytes)} MB — that's over the ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024 / 1024 * 10) / 10} GB limit for one post. Remove one or use a smaller file.`);
      return;
    }
    setMediaError(null);
    setErrMsg(null);
    setPhase('sharing');
    /**
     * A HALF-FAILED BATCH IS NOT RE-UPLOADED FROM SCRATCH (30 Aug audit).
     *
     * This was one `Promise.all` whose result was a local `let` thrown away in
     * the catch. So a post of a video plus its poster where the poster failed
     * discarded the video too, the citizen tapped Share again, and sixty
     * megabytes went up a second time — leaving the first copy in the bucket
     * with nothing referencing it and nothing to clean it up.
     *
     * The key is written back onto the item, so a retry uploads only what is
     * still missing. `allSettled` means one failure no longer throws away the
     * others' keys before they can be recorded.
     */
    type Uploaded = { url: string; kind: 'image' | 'video'; thumbUrl?: string };
    const toSend = media.filter((m) => !m.key).reduce((n, m) => n + m.file.size, 0);
    const done = new Map<MediaItem, number>();
    const tally = () => { if (toSend > 0) setSent([...done.values()].reduce((a, b) => a + b, 0) / toSend); };
    setSent(toSend > 0 ? 0 : null);
    const results = await Promise.allSettled(media.map(async (m): Promise<Uploaded> => {
      if (!m.key) m.key = await mediaApi.uploadPost(m.file, (f) => { done.set(m, f * m.file.size); tally(); });
      if (m.poster && !m.posterKey) m.posterKey = await mediaApi.uploadPost(m.poster).catch(() => undefined);
      return { url: m.key, kind: m.type, ...(m.posterKey ? { thumbUrl: m.posterKey } : {}) };
    }));
    setSent(null);
    const failedAt = results.findIndex((r) => r.status === 'rejected');
    if (failedAt >= 0) {
      const why = (results[failedAt] as PromiseRejectedResult).reason as unknown;
      const name = media[failedAt]?.file.name;
      setErrMsg(`${name ? `“${name}” ` : ''}${uploadErrorMessage(why)} The others are uploaded — press Share again and only this one is retried.`);
      setPhase('error');
      return;
    }
    const uploaded: Uploaded[] = results.map((r) => (r as PromiseFulfilledResult<Uploaded>).value);
    const finalText = [text.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n');
    create.mutate(
      {
        text: finalText || undefined,
        media: uploaded.length ? uploaded : undefined,
        feeling: feeling ?? undefined,
        placeName: placeName.trim() || undefined,
        ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
        audience,
        ...(category ? { category } : {}),
        /* The picker only appears when a video is attached, so a track that
           outlives its video was posted silently onto a photo — the citizen
           chose it for a clip they then deleted, and never saw it again until
           the reel played music over nothing. */
        ...(music && media.some((m) => m.type === 'video') ? { musicUrl: music.url, musicTitle: music.title } : {}),
        tagged: tagged.length ? tagged : undefined,
      },
      {
        onSuccess: (post) => {
          clearDraft(); // it is published; there is nothing left to recover
          // Brief success confirmation, then auto-return to the City Feed with
          // the new post highlighted at the top (Instagram/X-style flow).
          setPhase('success');
          // The timer is CLEARED on unmount. It used to be a bare setTimeout,
          // so tapping Back during the 550 ms confirmation yanked the citizen
          // forward to the feed they had just chosen to leave.
          navTimer.current = window.setTimeout(() => {
            nav('/social/feed', { state: { newPostId: post.id, justShared: true } });
          }, 550);
        },
        onError: (e: unknown) => {
          // Surface the REAL error so the banner is honest (never a generic
          // "upload failed" when the server actually returned a reason).
          const ax = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
          const status = ax?.response?.status;
          /**
           * A REFUSED PHOTO IS NO LONGER IN THE BUCKET, SO THE MEMOISED KEY IS
           * A LIE (30 Aug, alongside content screening).
           *
           * Screening deletes what it refuses — a presigned PUT means the
           * bytes were already in the bucket, so a refusal that only blocks
           * the post leaves the file addressable. Which means the `key` this
           * composer memoised to avoid re-uploading now points at nothing, and
           * pressing Share again would fail on the SERVER'S ownership check
           * with "that upload did not finish" — a sentence about a network
           * problem, for a photograph that was refused on its content.
           *
           * So a permanent refusal forgets the keys. The retry re-uploads and
           * gets the same honest answer about the same picture, which is a
           * loop the citizen can actually get out of by changing the picture.
           * A 503 leaves them alone: nothing was deleted, and re-uploading
           * sixty megabytes because AWS blinked is the bug this memoisation
           * exists to prevent.
           */
          /**
           * ── AND THE SERVER SAYS SO, RATHER THAN THIS GUESSING FROM 403 ────
           *
           * This forgot every key on ANY 403 (31 Aug audit). But 403 is also
           * what a block, an audience refusal, a failed ownership check and
           * "screening isn't configured" answer with, and none of those
           * deleted anything — so a citizen who hit one of them re-uploaded
           * every photograph in the post for nothing, on a phone, on mobile
           * data. The status code means five things; only one of them is
           * "the bytes are gone".
           *
           * `mediaDiscarded` is that one thing, stated by the party that knows.
           * ABSENT MEANS KEEP, deliberately: an older API sends no flag, and
           * keeping a key that turns out to be dead costs one honest error
           * message, where discarding a live one costs the upload again.
           */
          const discarded = (ax as { response?: { data?: { mediaDiscarded?: boolean } } })
            ?.response?.data?.mediaDiscarded === true;
          if (discarded) {
            for (const m of media) { m.key = undefined; m.posterKey = undefined; }
          }
          setErrMsg(
            // 413 used to blame "that video" unconditionally, so a citizen
            // posting ten photographs and no video was told to try a shorter
            // clip.
            status === 413
              ? (media.some((m) => m.type === 'video')
                ? 'That video is too large to post right now. Try a shorter clip.'
                : 'Those files are too large to post together. Remove one and try again.')
              : ax?.response?.data?.message || ax?.message || 'Something went wrong publishing your post. Please try again.',
          );
          setPhase('error'); // stay on page, restore the button
        },
      },
    );
  };

  /** One thing a post can carry. `active` means it is already carrying it —
   *  a tile that is pressed IN says the photo is attached, not that a panel
   *  happens to be open. */
  const tile = (t: (typeof ATTACH)[number], active: boolean, label?: string) => (
    <button key={t.key} id={`sl-attach-${t.key}`} type="button"
      onClick={() => {
        if (t.key === 'photos') { photoPicker.current?.click(); return; }
        if (t.key === 'video') { videoPicker.current?.click(); return; }
        setOpen(open === t.key ? null : t.key);
      }}
      aria-pressed={open === t.key || active}
      className={`sl-tile sl-tile-${t.tint}${open === t.key || active ? ' on' : ''}`}>
      <span className="sl-tile-ic"><Icon name={t.icon} size={18} /></span>
      <span className="sl-tile-l">{label ?? t.label}</span>
    </button>
  );

  const audDef = AUDIENCES.find((a) => a.key === audience)!;
  const CATEGORIES = [
    { key: '', label: 'None' },
    { key: 'personal', label: 'Personal' },
    { key: 'work', label: 'Work' },
  ] as const;
  const connectionOptions = (connections.data ?? [])
    .filter((c) => !tagged.some((t) => t.id === c.user.id))
    .filter((c) => !tagInput.trim() || c.user.name.toLowerCase().includes(tagInput.toLowerCase()) || c.user.handle.includes(tagInput.toLowerCase()));

  return (
    <div>
      <div className="sl-head rise">
        <div className="sl-head-t">
          {/* The way back, on the page itself. This page left the hub rail
              (a verb, not a place), so it carries its own door home — and it
              goes to the FEED, deterministically, not navigate(-1): after a
              deep link or a posted post, "back" means the wall, not wherever
              the browser happens to have been. */}
          <Link to="/social/feed" className="btn btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, minHeight: 44 }}>
            <Icon name="back" size={15} /> Back to the feed
          </Link>
          <div className="eyebrow">Together City TV · Create Post</div>
          <h1>Share with your city</h1>
          <p>A photo, a video, a place or a thought — any one of them is a post.</p>
        </div>
      </div>

      {/* Said once, and said honestly: the words came back and the pictures
          did not, because a File cannot be written to sessionStorage and an
          object URL does not survive a reload. Silently restoring the text and
          leaving somebody to notice the photographs are missing would be the
          worse half of a good feature. */}
      {restored && (
        <div className="card sl-note">
          <div className="sl-note-t">Your draft is back</div>
          <p className="sl-note-p">
            The words you had written were kept. Photos and video were not — they will need attaching again.{' '}
            <button type="button" className="sl-fail-again"
              onClick={() => { clearDraft(); setText(''); setFeeling(null); setPlaceName(''); setHashtags([]); setTagged([]); setRestored(false); }}>
              Start over instead
            </button>
          </p>
        </div>
      )}

      <div className="card rise" style={{ padding: '16px 18px', opacity: busy ? 0.55 : 1, pointerEvents: busy ? 'none' : 'auto', transition: 'opacity .2s' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Avatar name={user?.name ?? 'You'} src={user?.profileImage} />
          <div className="sl-wrap" style={{ flex: '1 1 auto', minWidth: 0 }}>
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} rows={4} disabled={busy} maxLength={TEXT_MAX}
              aria-label="What's happening today?"
              placeholder="What's happening today?"
              style={{ ...inputStyle, border: 'none', padding: '6px 0 22px', resize: 'vertical', fontSize: 16, lineHeight: 1.6, background: 'none', boxShadow: 'none' }}
            />
            <span className="sl-count">{text.length}/{TEXT_MAX}</span>
          </div>
        </div>

        {(feeling || placeName || tagged.length > 0) && (
          <p className="sl-said">
            {feeling && <>feeling {feeling}&nbsp;&nbsp;</>}
            {placeName && <><Icon name="place" size={13} /> {placeName}&nbsp;&nbsp;</>}
            {tagged.length > 0 && <>with {tagged.map((t) => t.name.split(' ')[0]).join(', ')}</>}
          </p>
        )}

        {media.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 12 }}>
            {media.map((m, i) => {
              const badge = m.type === 'video' ? fmtBadge(m.dur) : null;
              return (
                <div key={i} style={{ position: 'relative', aspectRatio: frameRatio(m.portrait), maxHeight: 320, borderRadius: 12, overflow: 'hidden', background: 'var(--media-bg)' }}>
                  {m.type === 'video'
                    ? <video src={m.src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <img src={m.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {m.type === 'video' && m.file && (
                    <span style={{ position: 'absolute', top: 6, left: 6, color: 'var(--on-accent)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,.6)' }}>
                      {fileFmt(m.file)} · {sizeMB(m.file.size)} MB
                    </span>
                  )}
                  {badge && (
                    <span style={{ position: 'absolute', bottom: 6, left: 6, color: 'var(--on-accent)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,.62)' }}>
                      {badge.text}
                    </span>
                  )}
                  <button type="button" onClick={() => setMedia((prev) => { URL.revokeObjectURL(prev[i]?.src ?? ''); return prev.filter((_, j) => j !== i); })}
                    aria-label={`Remove this ${m.type === 'video' ? 'video' : 'photo'}`}
                    style={{ minWidth: 44, minHeight: 44, position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,.65)', color: 'var(--on-accent)', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
                    <Icon name="close" size={14} />
                  </button>
                  {m.type === 'video' && (
                    <button type="button" onClick={() => setCoverPick(i)}
                      style={{ position: 'absolute', bottom: 6, right: 6, color: 'var(--on-accent)', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,.65)', border: 'none', cursor: 'pointer' }}>
                      {m.poster ? <><Icon name="accepted" size={13} /> Cover set</> : <><Icon name="image" size={13} /> Choose cover</>}
                    </button>
                  )}
                  {m.type === 'image' && (
                    <button type="button" onClick={() => setEditPick(i)}
                      style={{ position: 'absolute', bottom: 6, right: 6, color: 'var(--on-accent)', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,.65)', border: 'none', cursor: 'pointer' }}>
                      <Icon name="edit" size={13} /> Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {coverPick !== null && media[coverPick] && (
          <CoverPicker item={media[coverPick]} onClose={() => setCoverPick(null)}
            onPick={(poster) => { setMedia((prev) => prev.map((m, j) => (j === coverPick ? { ...m, poster } : m))); setCoverPick(null); }} />
        )}

        {editPick !== null && media[editPick]?.type === 'image' && (
          <ImageEditor src={media[editPick].src} onClose={() => setEditPick(null)}
            onApply={({ src, file }) => {
              const at = editPick;
              setMedia((prev) => prev.map((m, j) => {
                if (j !== at) return m;
                // The old preview URL is released; the upload key is dropped so
                // the retry-safe uploader sends the edited file, not the original.
                // AND THE POSTER GOES WITH IT (5 Sep): `poster` was the grid thumb
                // of the ORIGINAL, uploaded as thumbUrl — so the grid showed the
                // unedited photo and the opened post the edited one. It is
                // dropped here and re-cut from the edited file below.
                if (m.src.startsWith('blob:')) URL.revokeObjectURL(m.src);
                return { ...m, src, file, key: undefined, poster: undefined, posterKey: undefined };
              }));
              void compressImage(file).then(({ thumb }) => {
                setMedia((prev) => prev.map((m, j) => (j === at && m.file === file ? { ...m, poster: thumb } : m)));
              }).catch(() => undefined);
              setEditPick(null);
            }} />
        )}

        {hashtags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {hashtags.map((h) => (
              <span key={h} className="sl-chipv">
                {h} <button type="button" onClick={() => setHashtags((x) => x.filter((y) => y !== h))} aria-label={`Remove ${h}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 2, display: 'inline-flex', verticalAlign: '-.15em' }}><Icon name="close" size={12} /></button>
              </span>
            ))}
          </div>
        )}

        {hasSuggestions && (
          <div style={{ marginTop: 12, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginRight: 8 }}>Suggested</span>
            {suggestions.tags.map((t) => (
              <button key={t} type="button" onClick={() => setHashtags((x) => [...x, t])}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', border: '1px solid var(--line)', background: 'var(--paper)', marginRight: 6, color: 'var(--ink)' }}>
                {t}
              </button>
            ))}
            {suggestions.mood && (
              <button type="button" onClick={() => setFeeling(suggestions.mood)}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)' }}>
                {suggestions.mood}
              </button>
            )}
          </div>
        )}

        <div className="eyebrow" style={{ margin: '18px 0 9px' }}>Add to your post</div>
        <div className="sl-grid">
          {tile(ATTACH[0], media.some((m) => m.type === 'image'))}
          {tile(ATTACH[1], media.some((m) => m.type === 'video'))}
          {tile(ATTACH[2], Boolean(placeName), placeName ? placeName.slice(0, 16) : undefined)}
          {tile(ATTACH[3], Boolean(feeling), feeling || undefined)}
          {tile(ATTACH[4], tagged.length > 0, tagged.length ? `${tagged.length} tagged` : undefined)}
          {tile(ATTACH[5], hashtags.length > 0)}
        </div>

        {media.some((m) => m.type === 'video') && (
          <MusicPicker selected={music} onSelect={setMusic} stopSignal={phase !== 'idle'} />
        )}

        <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
          <Icon name="video" size={14} /> {VIDEO_FORMATS} · up to 2 GB and an hour each.
        </p>

        <input ref={photoPicker} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        <input ref={videoPicker} type="file" accept="video/*" multiple style={{ display: 'none' }}
          onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />

        {open === 'location' && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--wash)' }}>
            <label className="sl-field-l">Check in — where are you?</label>
            <input value={placeName} onChange={(e) => setPlaceName(e.target.value)}
              placeholder="e.g. Blue Tokai Coffee · Marine Drive · Paris" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-line btn-sm" onClick={useLocation}>
                <Icon name="locating" size={14} /> Pin my current location
              </button>
              {geoStat && <span className="muted" style={{ fontSize: 11.5 }}>{geoStat}</span>}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>The location shows on your post so people nearby can find it.</p>
          </div>
        )}
        {open === 'feeling' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {FEELINGS.map((f) => (
              <button key={f} type="button" onClick={() => setFeeling(feeling === f ? null : f)}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: '6px 12px', borderRadius: 'var(--r-full)',
                  border: `1.5px solid ${feeling === f ? 'var(--accent)' : 'var(--line)'}`,
                  background: feeling === f ? 'var(--accent)' : 'var(--card)', color: feeling === f ? 'var(--on-accent)' : 'var(--ink)' }}>
                {f}
              </button>
            ))}
          </div>
        )}
        {open === 'tag' && (
          <div style={{ marginTop: 12 }}>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Search your connections…" style={inputStyle} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {connectionOptions.slice(0, 8).map((c) => (
                <button key={c.id} type="button"
                  onClick={() => setTagged((t) => [...t, { id: c.user.id, name: c.user.name, handle: c.user.handle }])}
                  style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: '6px 12px', borderRadius: 'var(--r-full)', border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)' }}>
                  + {c.user.name}
                </button>
              ))}
              {/* The seventh screen from the audit's list: this said "no more
                  connections to tag" whether the read had succeeded or not, so
                  a citizen with forty connections and a dropped request was
                  told they had none. */}
              {connections.isLoading && <span className="sl-hint">Loading your connections…</span>}
              {connections.isError && <span className="sl-note-p">Couldn’t load your connections just now — this is a connection problem, not an empty list.</span>}
              {!connections.isLoading && !connections.isError && connectionOptions.length === 0
                && <span className="sl-hint">No more connections to tag.</span>}
            </div>
            {tagged.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {tagged.map((t) => (
                  <span key={t.id} className="sl-chipv">
                    {t.name} <button type="button" onClick={() => setTagged((x) => x.filter((y) => y.id !== t.id))} aria-label={`Remove ${t.name}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'inline-flex', verticalAlign: '-.15em' }}><Icon name="close" size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {open === 'hashtags' && (
          <div style={{ marginTop: 12 }}>
            {/* WHAT A TAG ACTUALLY DOES HERE (30 Aug audit). There is no tag
                index and no tag search, so a chip that looked like a filing
                system was promising a room that does not exist. Tags are
                appended to the caption — which is useful, and is the whole of
                it. Saying so costs one line and stops the promise. */}
            <p className="sl-hint" style={{ margin: '0 0 8px' }}>
              Tags are added to the end of your caption. There’s no tag search yet — they read as words, not links.
            </p>
            <input
              placeholder="Type a tag and press Enter — e.g. sunset"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const raw = (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
                if (!raw) return;
                const tag = '#' + raw.replace(/\s+/g, '');
                if (!hashtags.includes(tag)) setHashtags((x) => [...x, tag]);
                (e.target as HTMLInputElement).value = '';
              }}
              style={inputStyle}
            />
          </div>
        )}
      </div>

      {/* POST SETTINGS. Who may read it and which shelf it belongs on are not
          attachments — nothing is added to the post by opening them, and both
          already have an answer. So they are a list that states the answer,
          rather than two more tiles that look like empty slots. */}
      <div className="eyebrow" style={{ margin: '20px 0 9px' }}>Post settings</div>
      <div className="card rise d1" style={{ padding: '2px 18px' }}>
        <div className="sl-rows" style={{ padding: 0 }}>
          <button type="button" className="sl-row" aria-expanded={open === 'category'}
            onClick={() => setOpen(open === 'category' ? null : 'category')}>
            <span className="sl-ic sm flat"><Icon name="grid" size={16} /></span>
            Category
            <span className="sl-row-v">{CATEGORIES.find((c) => c.key === category)!.label}</span>
            <Icon name="next" size={16} />
          </button>
          {open === 'category' && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '0 0 14px' }}>
              {CATEGORIES.map((c) => (
                <button key={c.key || 'none'} type="button" onClick={() => setCategory(c.key)}
                  aria-pressed={category === c.key} className={`chip${category === c.key ? ' on' : ''}`}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="sl-row" aria-expanded={open === 'audience'}
            onClick={() => setOpen(open === 'audience' ? null : 'audience')}>
            <span className="sl-ic sm flat"><Icon name={audDef.icon} size={16} /></span>
            Visibility
            <span className="sl-row-v">{audDef.label}</span>
            <Icon name="next" size={16} />
          </button>
          {open === 'audience' && (
            <div style={{ display: 'grid', gap: 6, padding: '0 0 14px' }}>
              {AUDIENCES.map((a) => (
                <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '9px 12px',
                  borderRadius: 'var(--r-1)', border: '1px solid var(--line)',
                  background: audience === a.key ? 'var(--wash)' : 'var(--card)' }}>
                  <input type="radio" name="aud" checked={audience === a.key} onChange={() => setAudience(a.key)} style={{ accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name={a.icon} size={15} />{a.label}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{a.hint}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <p className="muted" style={{ fontSize: 11.5, margin: '0 0 14px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <Icon name="shield" size={14} /> {audDef.hint}.
        </p>
      </div>

      {/* POST & EARN, TOLD THE TRUTH — the same correction already shipped on the
          profile tab, which this screen missed. It used to read "up to ₹100 per
          video · earn ₹100 after review (max 15/day)". There is no payout model
          in the schema, no route, no review queue: nothing that could ever pay
          anybody or look at a video. Of everything in the invented-data sweep,
          this was the one that asked people for work. */}
      <div className="card rise d2" style={{ padding: '16px 18px', margin: '14px 0' }}>
        <div className="sl-note">
          <span className="sl-ic"><Icon name="wallet" size={18} /></span>
          <span className="sl-note-t">
            <b>Post &amp; Earn is not open yet</b>
            <p>
              No rate, no review, no payout yet. When that changes, you’ll be told here first.
            </p>
          </span>
        </div>
      </div>

      {(phase === 'error' || mediaError) && (
        <div role="alert" style={{ background: 'var(--danger-soft)', color: 'var(--danger-ink)', border: '1px solid var(--danger-line)', borderRadius: 12, padding: '11px 14px', margin: '0 0 12px', fontSize: 13, fontWeight: 500 }}>
          {mediaError ?? errMsg ?? 'Something went wrong publishing your post. Please try again.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: busy ? 'center' : 'stretch' }}>
        {/* Cancel was a bare <Link>: a half-written post with ten photographs
            went with one tap and no question asked. It asks now, and it says
            the draft is kept — which it is, minus the files. */}
        {!busy && (
          <button type="button" className="btn btn-line sl-half"
            onClick={() => {
              const written = Boolean(text.trim() || media.length || placeName.trim() || hashtags.length || tagged.length);
              if (written) setLeaving(true); else nav('/social/feed');
            }}>Cancel</button>
        )}
        <Confirm open={leaving} title="Leave this post?"
          body="Your words are kept as a draft, but the photos and video are not."
          confirmLabel="Leave" danger onClose={() => setLeaving(false)} onConfirm={() => nav('/social/feed')} />
        <button type="button" onClick={() => void share()} disabled={busy || !canShare}
          className="btn btn-accent"
          style={{
            // `width: undefined` is `auto`, and auto → 150px is not interpolable, so the
            // width leg snapped while the flex leg tweened and re-ran flex layout for the
            // whole row every frame. Stable value pair + no layout transition.
            flex: busy ? 'none' : 2, width: busy ? 150 : 'auto', minWidth: 150,
            ...(phase === 'success' ? { background: 'var(--ok-ink)', color: 'var(--on-accent)' } : {}),
          }}>
          {phase === 'sharing' && (<><span className="tc-spin" /> {sent != null && sent < 1 ? `Uploading ${Math.round(sent * 100)}%` : 'Sharing…'}</>)}
          {phase === 'success' && (<><Icon name="accepted" size={16} /> Shared</>)}
          {(phase === 'idle' || phase === 'error') && (<><Icon name="plus" size={16} /> Share with my city</>)}
        </button>
      </div>
    </div>
  );
}
