import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConnections } from '@/api';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useCreatePost } from '../api';
import { MUSIC_LIBRARY, type Track } from '../musicLibrary';

// `file` is kept for media that uploads to storage (video) — the `src` is only a
// local preview; the real post URL comes from the R2 upload on share.
interface MediaItem { type: 'image' | 'video'; src: string; file?: File; dur?: number; portrait?: boolean; poster?: File }

/** Grab a still frame from a video as a JPEG File, to upload as its poster —
 *  so feed/profile grids show a real thumbnail and never fetch the video just
 *  to render a frame. Best-effort: resolves null if the browser can't decode. */
function genPoster(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; (v as HTMLVideoElement).playsInline = true; v.src = url;
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
 *  Applies via the canvas `filter` and bakes the result into a new JPEG data
 *  URL that replaces the image before posting. */
function ImageEditor({ src, onClose, onApply }: { src: string; onClose: () => void; onApply: (dataUrl: string) => void }) {
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
  const usePreset = (p: (typeof PRESETS)[number]) => { setExtra(p.extra); setB(p.b); setC(p.c); setS(p.s); };

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
        onApply(canvas.toDataURL('image/jpeg', 0.9));
      } catch { onClose(); }
    };
    img.onerror = () => onClose();
    img.src = src;
  };

  const slider = (label: string, val: number, set: (n: number) => void, min: number, max: number) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
        <span>{label}</span><span className="muted">{Math.round(val * 100)}%</span>
      </span>
      <input type="range" min={min} max={max} step={0.01} value={val} onChange={(e) => set(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(560px,96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 17 }}>Edit photo</h3>
        <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', marginBottom: 12 }}>
          <img src={src} alt="" style={{ width: '100%', maxHeight: '46vh', objectFit: 'contain', display: 'block', filter }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className={`pill ${pane === 'filters' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setPane('filters')}>Filters</button>
          <button type="button" className={`pill ${pane === 'adjust' ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setPane('adjust')}>Adjust</button>
        </div>
        {pane === 'filters' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => {
              const pf = `${p.extra} brightness(${p.b}) contrast(${p.c}) saturate(${p.s})`.trim();
              const active = pf === filter;
              return (
                <button key={p.name} type="button" onClick={() => usePreset(p)}
                  style={{ cursor: 'pointer', border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 0, background: 'none', overflow: 'hidden', width: 72 }}>
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
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 'min(560px,96vw)', maxHeight: '92vh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>Choose cover frame</h3>
        <video ref={vref} src={item.src} controls playsInline muted
          style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: '60vh', display: 'block' }} />
        <p className="muted" style={{ fontSize: 12.5, margin: '10px 0' }}>Scrub to the frame you want, pause, then set it as the cover.</p>
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
const MAX_VIDEO_BYTES = 75 * 1024 * 1024;   // 75 MB per video
const MAX_TOTAL_BYTES = 105 * 1024 * 1024;  // total encoded payload ceiling
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
/** Approx decoded byte size of a base64 data URL. */
const dataUrlBytes = (src: string): number => {
  const i = src.indexOf(',');
  const b64 = i >= 0 ? src.slice(i + 1) : src;
  return Math.ceil(b64.length * 0.75);
};
const readAsDataURL = (f: File): Promise<string> =>
  new Promise((res, rej) => { const rd = new FileReader(); rd.onerror = () => rej(new Error('read failed')); rd.onload = () => res(String(rd.result)); rd.readAsDataURL(f); });
/** Downscale + re-encode a photo so it posts as a small JPEG (never a raw 8 MB
 *  phone photo). Keeps aspect ratio; caps the long edge at 1600 px. */
const compressImage = (f: File): Promise<{ src: string; portrait: boolean }> => new Promise((resolve, reject) => {
  const rd = new FileReader();
  rd.onerror = () => reject(new Error('read failed'));
  rd.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('decode failed'));
    img.onload = () => {
      const MAXDIM = 1600;
      const scale = Math.min(1, MAXDIM / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('no canvas'));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve({ src: c.toDataURL('image/jpeg', 0.82), portrait: img.height > img.width });
    };
    img.src = String(rd.result);
  };
  rd.readAsDataURL(f);
});

const FEELINGS = ['😊 Happy', '😌 Relaxed', '🤩 Excited', '🙏 Grateful', '✨ Blessed', '❤️ Loved', '🧭 Adventurous', '🌇 Nostalgic', '🎉 Celebrating', '☕ Cosy'];

export const AUDIENCES = [
  { key: 'public', label: 'Public', emoji: '🌍', hint: 'Everyone in your city network' },
  { key: 'friends', label: 'Friends', emoji: '👥', hint: 'Your accepted connections' },
  { key: 'family', label: 'Family', emoji: '👨‍👩‍👧', hint: 'Connections marked Family in People' },
  { key: 'private', label: 'Only Me', emoji: '🔒', hint: 'Visible only to you' },
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
const PLACE_HINTS: Array<[RegExp, string]> = [
  [/marine drive/i, 'Marine Drive, Mumbai'], [/blue tokai/i, 'Blue Tokai Coffee'],
  [/starbucks/i, 'Starbucks'], [/eiffel|paris/i, 'Paris'], [/bandra/i, 'Bandra, Mumbai'],
  [/juhu/i, 'Juhu Beach'], [/gateway/i, 'Gateway of India'],
];

function fmtBadge(dur: number | undefined): { text: string; eligible: boolean } {
  const d = dur || 0;
  const mm = Math.floor(d / 60);
  const ss = d % 60;
  const el = d >= 180;
  if (!d) return { text: '▶ video', eligible: false };
  return { text: `${el ? '✓ ₹100 · ' : '⏱ '}${mm}:${ss < 10 ? '0' : ''}${ss}${el ? '' : ' (need 3:00)'}`, eligible: el };
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px',
  fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none',
};

/** 🎵 Music picker — pick a royalty-free library track to play over a video
 *  post's reel. Tap a chip to select; tap ▶/⏸ to preview. Only one track
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
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>🎵 Music:</span>
        <span title="Every track is royalty-free and cleared for use. Uploading your own (possibly copyrighted) audio is not allowed."
          style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(34,197,94,.14)', color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          🛡 Copyright-safe · Royalty-free
        </span>
        <button type="button" onClick={() => { stop(); onSelect(null); }}
          style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
            border: `1.5px solid ${!selected ? 'var(--accent)' : 'var(--line)'}`,
            background: !selected ? 'var(--accent)' : 'var(--card)', color: !selected ? '#fff' : 'var(--ink)' }}>
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
                style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: 'var(--accent)', color: '#fff', fontSize: 13, flex: '0 0 auto' }}>
                {previewId === t.id ? '⏸' : '▶'}
              </button>
              <button type="button" onClick={() => { onSelect(active ? null : t); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)', fontFamily: 'inherit' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.title}</div>
                <div className="muted" style={{ fontSize: 11 }}>{t.mood ?? t.artist ?? 'Track'}{t.license ? ` · ${t.license}` : ''}</div>
              </button>
              {active && <span style={{ fontSize: 13, color: 'var(--accent)' }}>✓</span>}
            </div>
          );
        })}
        {tracks.length === 0 && (
          <span className="muted" style={{ fontSize: 12 }}>No tracks available yet — add MP3s to public/music/.</span>
        )}
      </div>
    </div>
  );
}

/** Social Life · Create Post — ONE composer for text, photos, videos,
 *  check-ins, feelings, tagged friends, hashtags and audience. Nothing is
 *  mandatory except having SOMETHING to share: a photo alone, a video alone,
 *  a check-in alone or a thought alone all make a post. */
export function CreatePost() {
  const nav = useNavigate();
  const create = useCreatePost();
  const connections = useConnections('accepted');
  const photoPicker = useRef<HTMLInputElement>(null);
  const videoPicker = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStat, setGeoStat] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagged, setTagged] = useState<Array<{ id: string; name: string; handle: string }>>([]);
  const [audience, setAudience] = useState<AudienceKey>('public');
  const [category, setCategory] = useState<'' | 'work' | 'personal'>('');
  const [music, setMusic] = useState<Track | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Share lifecycle: idle → sharing → success (→ navigate) | error
  const [phase, setPhase] = useState<'idle' | 'sharing' | 'success' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [coverPick, setCoverPick] = useState<number | null>(null);
  const [editPick, setEditPick] = useState<number | null>(null);
  const busy = phase === 'sharing' || phase === 'success';

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setMediaError(null);
    for (const f of Array.from(files)) {
      const isVid = /^video\//.test(f.type);
      try {
        if (isVid) {
          if (f.size > MAX_VIDEO_BYTES) {
            setMediaError(`"${f.name}" is ${mb(f.size)} MB — videos must be under ${mb(MAX_VIDEO_BYTES)} MB.`);
            continue;
          }
          const src = await readAsDataURL(f);
          // Keep the File — the video uploads to storage on share (a data-URL
          // video won't stream/play reliably in the feed).
          const item: MediaItem = { type: 'video', src, file: f };
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.onloadedmetadata = () => {
            item.dur = Math.round(v.duration) || 0;
            item.portrait = v.videoHeight > v.videoWidth;
            setMedia((prev) => [...prev]);
          };
          v.src = src;
          // Capture a permanent poster frame now (from the local file — no CORS),
          // so the grid shows a stored thumbnail forever and never fetches the video.
          void genPoster(f).then((poster) => { if (poster) { item.poster = poster; setMedia((prev) => [...prev]); } });
          setMedia((prev) => [...prev, item].slice(0, 10));
        } else {
          // Photos are downscaled + re-encoded so they always post as small JPEGs.
          const { src, portrait } = await compressImage(f);
          const item: MediaItem = { type: 'image', src, portrait };
          setMedia((prev) => [...prev, item].slice(0, 10));
        }
      } catch {
        setMediaError(`Couldn't process "${f.name}". Try a different file.`);
      }
    }
  };

  const useLocation = () => {
    setGeoStat('📡 Getting your location…');
    if (!navigator.geolocation) { setGeoStat('⚠ Geolocation not supported — type the place name instead.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStat(`✓ Pinned: ${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`); },
      () => setGeoStat('⚠ Couldn’t get a fix — the place name still shows on your post.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const suggestions = useMemo(() => {
    const tags = new Set<string>();
    let mood: string | null = null;
    let place: string | null = null;
    for (const [re, ts] of TOPIC_TAGS) if (re.test(text)) ts.forEach((t) => tags.add(t));
    for (const [re, m] of MOOD_HINTS) if (!mood && re.test(text)) mood = m;
    for (const [re, p] of PLACE_HINTS) if (!place && re.test(text)) place = p;
    return {
      tags: [...tags].filter((t) => !hashtags.includes(t)).slice(0, 4),
      mood: mood && mood !== feeling ? mood : null,
      place: place && place !== placeName ? place : null,
    };
  }, [text, hashtags, feeling, placeName]);
  const hasSuggestions = suggestions.tags.length > 0 || suggestions.mood || suggestions.place;

  const canShare = Boolean(text.trim()) || media.length > 0 || Boolean(placeName.trim());

  const share = async () => {
    if (busy || !canShare) return; // prevent duplicate submissions
    // Only inline media (image data-URLs) counts toward the post-body limit —
    // videos upload to storage and travel as a short URL.
    const inlineBytes = media.filter((m) => !m.file).reduce((s, m) => s + dataUrlBytes(m.src), 0);
    if (inlineBytes > MAX_TOTAL_BYTES) {
      setMediaError(`These files total ${mb(inlineBytes)} MB — that's over the ${mb(MAX_TOTAL_BYTES)} MB limit for one post. Remove one or use a smaller file.`);
      return;
    }
    setMediaError(null);
    setErrMsg(null);
    setPhase('sharing');
    // Upload any file-backed media (video) to storage; images stay inline.
    let uploaded: { url: string; kind: 'image' | 'video'; thumbUrl?: string }[];
    try {
      uploaded = await Promise.all(
        media.map(async (m) => {
          if (!m.file) return { url: m.src, kind: m.type };
          const url = await mediaApi.upload(m.file);
          // Upload the captured poster too (best-effort) → stored as thumbUrl forever.
          const thumbUrl = m.poster ? await mediaApi.upload(m.poster).catch(() => undefined) : undefined;
          return { url, kind: m.type, ...(thumbUrl ? { thumbUrl } : {}) };
        }),
      );
    } catch (e) {
      setErrMsg(uploadErrorMessage(e));
      setPhase('error');
      return;
    }
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
        ...(music ? { musicUrl: music.url, musicTitle: music.title } : {}),
        tagged: tagged.length ? tagged : undefined,
      },
      {
        onSuccess: (post) => {
          // Brief success confirmation, then auto-return to the City Feed with
          // the new post highlighted at the top (Instagram/X-style flow).
          setPhase('success');
          window.setTimeout(() => {
            nav('/social/feed', { state: { newPostId: post.id, justShared: true } });
          }, 550);
        },
        onError: (e: unknown) => {
          // Surface the REAL error so the banner is honest (never a generic
          // "upload failed" when the server actually returned a reason).
          const ax = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
          const status = ax?.response?.status;
          setErrMsg(
            status === 413
              ? 'That video is too large to post right now. Try a shorter clip.'
              : ax?.response?.data?.message || ax?.message || 'Something went wrong publishing your post. Please try again.',
          );
          setPhase('error'); // stay on page, restore the button
        },
      },
    );
  };

  const tool = (key: string, label: string, active = false) => (
    <button key={key} type="button"
      onClick={() => {
        if (key === 'photos') { photoPicker.current?.click(); return; }
        if (key === 'video') { videoPicker.current?.click(); return; }
        setOpen(open === key ? null : key);
      }}
      style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '8px 12px',
        borderRadius: 999, border: `1.5px solid ${open === key || active ? 'var(--accent)' : 'var(--line)'}`,
        background: open === key || active ? 'var(--accent-soft)' : 'var(--card)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );

  const audDef = AUDIENCES.find((a) => a.key === audience)!;
  const connectionOptions = (connections.data ?? [])
    .filter((c) => !tagged.some((t) => t.id === c.user.id))
    .filter((c) => !tagInput.trim() || c.user.name.toLowerCase().includes(tagInput.toLowerCase()) || c.user.handle.includes(tagInput.toLowerCase()));

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow rise">Social Life · Create Post</div>
      <h1 className="rise" style={{ fontSize: 'clamp(24px,3vw,34px)', marginBottom: 14 }}>Share with your city</h1>

      <div className="card rise" style={{ padding: '16px 18px', opacity: busy ? 0.55 : 1, pointerEvents: busy ? 'none' : 'auto', transition: 'opacity .2s' }}>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={4} disabled={busy}
          placeholder="What's happening today? Share a thought, photo, video or moment with your city."
          style={{ ...inputStyle, border: 'none', padding: 0, resize: 'vertical', fontSize: 15, lineHeight: 1.6, background: 'transparent' }}
        />

        {(feeling || placeName || tagged.length > 0) && (
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            {feeling && <>feeling {feeling}&nbsp;&nbsp;</>}
            {placeName && <>📍 {placeName}&nbsp;&nbsp;</>}
            {tagged.length > 0 && <>with {tagged.map((t) => t.name.split(' ')[0]).join(', ')}</>}
          </p>
        )}

        {media.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 12 }}>
            {media.map((m, i) => {
              const badge = m.type === 'video' ? fmtBadge(m.dur) : null;
              return (
                <div key={i} style={{ position: 'relative', aspectRatio: frameRatio(m.portrait), maxHeight: 320, borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                  {m.type === 'video'
                    ? <video src={m.src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <img src={m.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {m.type === 'video' && m.file && (
                    <span style={{ position: 'absolute', top: 6, left: 6, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(0,0,0,.6)' }}>
                      {fileFmt(m.file)} · {sizeMB(m.file.size)} MB
                    </span>
                  )}
                  {badge && (
                    <span style={{ position: 'absolute', bottom: 6, left: 6, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: badge.eligible ? 'rgba(46,125,70,.92)' : 'rgba(180,105,31,.92)' }}>
                      {badge.text}
                    </span>
                  )}
                  <button type="button" onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,.65)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
                    ✕
                  </button>
                  {m.type === 'video' && (
                    <button type="button" onClick={() => setCoverPick(i)}
                      style={{ position: 'absolute', bottom: 6, right: 6, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(0,0,0,.65)', border: 'none', cursor: 'pointer' }}>
                      {m.poster ? '✓ Cover set' : '🖼 Choose cover'}
                    </button>
                  )}
                  {m.type === 'image' && (
                    <button type="button" onClick={() => setEditPick(i)}
                      style={{ position: 'absolute', bottom: 6, right: 6, color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(0,0,0,.65)', border: 'none', cursor: 'pointer' }}>
                      ✎ Edit
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
            onApply={(dataUrl) => { setMedia((prev) => prev.map((m, j) => (j === editPick ? { ...m, src: dataUrl } : m))); setEditPick(null); }} />
        )}

        {hashtags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {hashtags.map((h) => (
              <span key={h} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '3px 10px', borderRadius: 999 }}>
                {h} <button type="button" onClick={() => setHashtags((x) => x.filter((y) => y !== h))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 2 }}>✕</button>
              </span>
            ))}
          </div>
        )}

        {hasSuggestions && (
          <div style={{ marginTop: 12, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginRight: 8 }}>Suggested</span>
            {suggestions.tags.map((t) => (
              <button key={t} type="button" onClick={() => setHashtags((x) => [...x, t])}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)', marginRight: 6, color: 'var(--ink)' }}>
                {t}
              </button>
            ))}
            {suggestions.place && (
              <button type="button" onClick={() => { setPlaceName(suggestions.place!); setOpen('location'); }}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)', marginRight: 6, color: 'var(--ink)' }}>
                📍 {suggestions.place}
              </button>
            )}
            {suggestions.mood && (
              <button type="button" onClick={() => setFeeling(suggestions.mood!)}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)' }}>
                {suggestions.mood}
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {tool('photos', '📷 Photos', media.some((m) => m.type === 'image'))}
          {tool('video', '🎥 Video', media.some((m) => m.type === 'video'))}
          {tool('location', placeName ? `📍 ${placeName.slice(0, 18)}` : '📍 Location', Boolean(placeName))}
          {tool('feeling', feeling ? feeling : '😊 Feeling', Boolean(feeling))}
          {tool('tag', tagged.length ? `👥 ${tagged.length} tagged` : '👥 Tag People', tagged.length > 0)}
          {tool('hashtags', '# Hashtags', hashtags.length > 0)}
          {tool('audience', `${audDef.emoji} ${audDef.label}`, audience !== 'public')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Category:</span>
          {([['', 'None'], ['personal', '🏖 Personal'], ['work', '💼 Work']] as const).map(([key, label]) => (
            <button key={key || 'none'} type="button" onClick={() => setCategory(key)}
              style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999,
                border: `1.5px solid ${category === key ? 'var(--accent)' : 'var(--line)'}`,
                background: category === key ? 'var(--accent)' : 'var(--card)', color: category === key ? '#fff' : 'var(--ink)' }}>
              {label}
            </button>
          ))}
        </div>

        {media.some((m) => m.type === 'video') && (
          <MusicPicker selected={music} onSelect={setMusic} stopSignal={phase !== 'idle'} />
        )}

        <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
          🎥 Video: {VIDEO_FORMATS} · up to {mb(MAX_VIDEO_BYTES)} MB each (MP4 plays on every device). 📷 Photos are optimised automatically.
        </p>

        <input ref={photoPicker} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        <input ref={videoPicker} type="file" accept="video/*" multiple style={{ display: 'none' }}
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />

        {open === 'location' && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--accent-soft)' }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>Check in — where are you?</label>
            <input value={placeName} onChange={(e) => setPlaceName(e.target.value)}
              placeholder="e.g. Blue Tokai Coffee · Marine Drive · Paris" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-line btn-sm" onClick={useLocation}>📡 Pin my current location</button>
              {geoStat && <span className="muted" style={{ fontSize: 11.5 }}>{geoStat}</span>}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Pinned posts also appear on the City Map.</p>
          </div>
        )}
        {open === 'feeling' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {FEELINGS.map((f) => (
              <button key={f} type="button" onClick={() => setFeeling(feeling === f ? null : f)}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: '6px 12px', borderRadius: 999,
                  border: `1.5px solid ${feeling === f ? 'var(--accent)' : 'var(--line)'}`,
                  background: feeling === f ? 'var(--accent)' : 'var(--card)', color: feeling === f ? '#fff' : 'var(--ink)' }}>
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
                  style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, padding: '6px 12px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)' }}>
                  + {c.user.name}
                </button>
              ))}
              {connectionOptions.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No more connections to tag.</span>}
            </div>
            {tagged.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {tagged.map((t) => (
                  <span key={t.id} style={{ fontSize: 12, fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent)', padding: '3px 10px', borderRadius: 999 }}>
                    {t.name} <button type="button" onClick={() => setTagged((x) => x.filter((y) => y.id !== t.id))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {open === 'hashtags' && (
          <div style={{ marginTop: 12 }}>
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
        {open === 'audience' && (
          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0 }}>🌍 Who can see this?</p>
            {AUDIENCES.map((a) => (
              <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px',
                borderRadius: 10, border: `1.5px solid ${audience === a.key ? 'var(--accent)' : 'var(--line)'}`,
                background: audience === a.key ? 'var(--accent-soft)' : 'transparent' }}>
                <input type="radio" name="aud" checked={audience === a.key} onChange={() => setAudience(a.key)} style={{ accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.emoji} {a.label}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{a.hint}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="rise d1" style={{ background: 'linear-gradient(135deg,var(--accent),#7a4fa0)', color: '#fff', borderRadius: 14, padding: '12px 16px', margin: '14px 0' }}>
        <b style={{ fontSize: 13 }}>💰 Post &amp; Earn — up to ₹100 per video</b>
        <div style={{ fontSize: 11.5, opacity: 0.95, marginTop: 2 }}>
          Original videos 3 min+ earn ₹100 after review (max 15/day). <Link to="/social/profile" style={{ color: '#fff', textDecoration: 'underline' }}>Rules →</Link>
        </div>
      </div>

      {(phase === 'error' || mediaError) && (
        <div role="alert" style={{ background: '#fdecea', color: '#b3261e', border: '1px solid #f4c7c3', borderRadius: 12, padding: '11px 14px', margin: '0 0 12px', fontSize: 13, fontWeight: 500 }}>
          {mediaError ?? errMsg ?? 'Something went wrong publishing your post. Please try again.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: busy ? 'center' : 'stretch' }}>
        {!busy && (
          <Link className="btn btn-line" to="/social/feed" style={{ flex: 1, justifyContent: 'center' }}>Cancel</Link>
        )}
        <button type="button" onClick={share} disabled={busy || !canShare}
          className="btn"
          style={{
            flex: busy ? 'none' : 2, width: busy ? 150 : undefined, justifyContent: 'center',
            display: 'flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '11px 18px',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: busy || !canShare ? 'default' : 'pointer',
            border: 'none', color: '#fff',
            background: phase === 'success' ? '#2e7d4f' : 'var(--accent)',
            opacity: !busy && !canShare ? 0.5 : 1,
            transition: 'flex .35s ease, width .35s ease, background .25s ease',
          }}>
          {phase === 'sharing' && (<><span className="tc-spin" /> Sharing…</>)}
          {phase === 'success' && (<>✓ Shared</>)}
          {(phase === 'idle' || phase === 'error') && (<>Share {audDef.emoji}</>)}
        </button>
      </div>
    </div>
  );
}
