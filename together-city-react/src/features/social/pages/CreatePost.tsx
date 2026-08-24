import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation as useRouteLocation, useNavigate } from 'react-router-dom';
import { useConnections } from '@/api';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '../PostCard';
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
        <div style={{ borderRadius: 12, overflow: 'hidden', background: 'var(--media-bg)', marginBottom: 12 }}>
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
          style={{ width: '100%', borderRadius: 'var(--r-1)', background: 'var(--media-bg)', maxHeight: '60vh', display: 'block' }} />
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
        <span className="muted" style={{ fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="music" size={14} />Music</span>
        <span title="Every track is royalty-free and cleared for use. Uploading your own (possibly copyrighted) audio is not allowed."
          style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-full)', background: 'rgba(34,197,94,.14)', color: 'var(--ok-ink)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="shield" size={13} /> Copyright-safe · Royalty-free
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
          <div className="eyebrow">Social Life · Create Post</div>
          <h1>Share with your city</h1>
          <p>A photo, a video, a place or a thought — any one of them is a post.</p>
        </div>
      </div>

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
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
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
                  <button type="button" onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
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
            onApply={(dataUrl) => { setMedia((prev) => prev.map((m, j) => (j === editPick ? { ...m, src: dataUrl } : m))); setEditPick(null); }} />
        )}

        {hashtags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {hashtags.map((h) => (
              <span key={h} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)', background: 'var(--accent-soft)', padding: '3px 10px', borderRadius: 'var(--r-full)' }}>
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
            {suggestions.place && (
              <button type="button" onClick={() => { setPlaceName(suggestions.place!); setOpen('location'); }}
                style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', border: '1px solid var(--line)', background: 'var(--paper)', marginRight: 6, color: 'var(--ink)' }}>
                <Icon name="place" size={13} /> {suggestions.place}
              </button>
            )}
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
          <Icon name="video" size={14} /> {VIDEO_FORMATS} · up to {mb(MAX_VIDEO_BYTES)} MB each.
        </p>

        <input ref={photoPicker} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        <input ref={videoPicker} type="file" accept="video/*" multiple style={{ display: 'none' }}
          onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />

        {open === 'location' && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--wash)' }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>Check in — where are you?</label>
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
              {connectionOptions.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No more connections to tag.</span>}
            </div>
            {tagged.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {tagged.map((t) => (
                  <span key={t.id} style={{ fontSize: 12, fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent-ink)', padding: '3px 10px', borderRadius: 'var(--r-full)' }}>
                    {t.name} <button type="button" onClick={() => setTagged((x) => x.filter((y) => y.id !== t.id))} aria-label={`Remove ${t.name}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'inline-flex', verticalAlign: '-.15em' }}><Icon name="close" size={12} /></button>
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
        {!busy && (
          <Link className="btn btn-line" to="/social/feed" style={{ flex: 1, justifyContent: 'center' }}>Cancel</Link>
        )}
        <button type="button" onClick={() => void share()} disabled={busy || !canShare}
          className="btn btn-accent"
          style={{
            // `width: undefined` is `auto`, and auto → 150px is not interpolable, so the
            // width leg snapped while the flex leg tweened and re-ran flex layout for the
            // whole row every frame. Stable value pair + no layout transition.
            flex: busy ? 'none' : 2, width: busy ? 150 : 'auto', minWidth: 150,
            ...(phase === 'success' ? { background: 'var(--ok-ink)', color: 'var(--on-accent)' } : {}),
          }}>
          {phase === 'sharing' && (<><span className="tc-spin" /> Sharing…</>)}
          {phase === 'success' && (<><Icon name="accepted" size={16} /> Shared</>)}
          {(phase === 'idle' || phase === 'error') && (<><Icon name="plus" size={16} /> Share with my city</>)}
        </button>
      </div>
    </div>
  );
}
