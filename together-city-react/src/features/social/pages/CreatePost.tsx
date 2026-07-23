import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConnections } from '@/api';
import { useCreatePost } from '../api';

interface MediaItem { type: 'image' | 'video'; src: string; dur?: number }

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
  const [open, setOpen] = useState<string | null>(null);
  // Share lifecycle: idle → sharing → success (→ navigate) | error
  const [phase, setPhase] = useState<'idle' | 'sharing' | 'success' | 'error'>('idle');
  const busy = phase === 'sharing' || phase === 'success';

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const isVid = /^video\//.test(f.type);
      const rd = new FileReader();
      rd.onload = () => {
        const src = String(rd.result);
        const item: MediaItem = { type: isVid ? 'video' : 'image', src };
        if (isVid) {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.onloadedmetadata = () => { item.dur = Math.round(v.duration) || 0; setMedia((prev) => [...prev]); };
          v.src = src;
        }
        setMedia((prev) => [...prev, item].slice(0, 10));
      };
      rd.readAsDataURL(f);
    });
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

  const share = () => {
    if (busy || !canShare) return; // prevent duplicate submissions
    setPhase('sharing');
    const finalText = [text.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n');
    create.mutate(
      {
        text: finalText || undefined,
        media: media.length ? media.map((m) => ({ url: m.src, kind: m.type })) : undefined,
        feeling: feeling ?? undefined,
        placeName: placeName.trim() || undefined,
        ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
        audience,
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
        onError: () => setPhase('error'), // stay on page, restore the button
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12 }}>
            {media.map((m, i) => {
              const badge = m.type === 'video' ? fmtBadge(m.dur) : null;
              return (
                <div key={i} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                  {m.type === 'video'
                    ? <video src={m.src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <img src={m.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  {badge && (
                    <span style={{ position: 'absolute', bottom: 6, left: 6, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: badge.eligible ? 'rgba(46,125,70,.92)' : 'rgba(180,105,31,.92)' }}>
                      {badge.text}
                    </span>
                  )}
                  <button type="button" onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,.65)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
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

      {phase === 'error' && (
        <div role="alert" style={{ background: '#fdecea', color: '#b3261e', border: '1px solid #f4c7c3', borderRadius: 12, padding: '11px 14px', margin: '0 0 12px', fontSize: 13, fontWeight: 500 }}>
          Upload failed. Please check your connection and try again.
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
