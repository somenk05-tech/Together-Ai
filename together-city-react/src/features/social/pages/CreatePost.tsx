import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useCreatePost } from '../api';

interface MediaItem { type: 'image' | 'video'; src: string; dur?: number }

function fmtBadge(dur: number | undefined): { text: string; eligible: boolean } {
  const d = dur || 0;
  const mm = Math.floor(d / 60);
  const ss = d % 60;
  const el = d >= 180;
  if (!d) return { text: '▶ video', eligible: false };
  return { text: `${el ? '✓ ₹100 · ' : '⏱ '}${mm}:${ss < 10 ? '0' : ''}${ss}${el ? '' : ' (need 3:00)'}`, eligible: el };
}

/** Social Life · Create — share a photo, video, plan or review; posts to the city feed. */
export function CreatePost() {
  const nav = useNavigate();
  const create = useCreatePost();
  const picker = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState<'indoor' | 'outdoor'>('indoor');
  const [placeName, setPlaceName] = useState('');
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [manual, setManual] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [geoStat, setGeoStat] = useState('📍 Location not set yet.');

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
          v.onloadedmetadata = () => {
            item.dur = Math.round(v.duration) || 0;
            setMedia((prev) => [...prev]);
          };
          v.src = src;
        }
        setMedia((prev) => [...prev, item]);
      };
      rd.readAsDataURL(f);
    });
  };

  const useLocation = () => {
    setGeoStat('📡 Getting your location…');
    if (!navigator.geolocation) { setGeoStat('⚠ Geolocation not supported. Enter coordinates manually.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStat(`✓ Located: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(pos.coords.accuracy || 0)}m)`);
      },
      (e) => setGeoStat(`⚠ Couldn't get location (${e.message || 'denied'}). Enter coordinates manually, or it'll use a city default.`),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const setManualGeo = () => {
    const la = parseFloat(lat), ln = parseFloat(lng);
    if (isFinite(la) && isFinite(ln)) {
      setGeo({ lat: la, lng: ln });
      setGeoStat(`✓ Coordinates set: ${la.toFixed(4)}, ${ln.toFixed(4)}`);
    }
  };

  const share = () => {
    const cap = caption.trim();
    if (!media.length && !cap) return;
    let g = geo;
    if (place === 'outdoor' && !g) g = { lat: 18.9430 + (Math.random() - 0.5) * 0.08, lng: 72.8238 + (Math.random() - 0.5) * 0.08 };
    create.mutate(
      {
        text: cap || undefined,
        media: media.map((m) => ({ url: m.src, kind: m.type })),
        ...(place === 'outdoor' && g ? { lat: g.lat, lng: g.lng } : {}),
      },
      { onSuccess: () => nav('/social/feed') },
    );
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow rise">Social Life · New post</div>
      <h1 className="rise" style={{ fontSize: 'clamp(24px,3vw,34px)', marginBottom: 18 }}>Share a moment</h1>
      <p className="lede rise" style={{ marginBottom: 16 }}>Post photos, videos and your write-up. Mark it outdoor to pin it on the map.</p>

      <div
        className="rise"
        style={{ background: 'linear-gradient(135deg,var(--accent),#7a4fa0)', color: '#fff', borderRadius: 'var(--radius-lg,16px)', padding: '14px 16px', marginBottom: 14 }}
      >
        <b style={{ fontSize: 13.5 }}>💰 Post &amp; Earn — up to ₹100 per video</b>
        <div style={{ fontSize: 12, opacity: 0.95, marginTop: 3, lineHeight: 1.5 }}>
          Upload an original video <b>3 min or longer</b>. Once reviewed &amp; approved you earn ₹100 — up to ₹1,500/day for 15 videos. No nudity, hate or foul language.{' '}
          <Link to="/social/profile" style={{ color: '#fff', textDecoration: 'underline' }}>See full rules →</Link>
        </div>
      </div>

      <input
        ref={picker} type="file" accept="image/*,video/*" multiple
        style={{ display: 'none' }} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
      />

      {media.length === 0 ? (
        <div
          className="rise d1" onClick={() => picker.current?.click()}
          style={{ border: '1.5px dashed var(--line)', borderRadius: 'var(--radius-lg)', aspectRatio: '1/1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', background: 'var(--card)' }}
        >
          <div style={{ fontSize: 34, color: 'var(--accent)' }}>⇪</div>
          <b>Add photos &amp; videos</b>
          <span className="muted" style={{ fontSize: 12 }}>JPG · PNG · MP4 · WEBM — add several, tap to browse</span>
        </div>
      ) : (
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
                <button
                  type="button" onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,.65)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <div
            onClick={() => picker.current?.click()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1/1', borderRadius: 12, background: 'var(--card)', border: '1.5px dashed var(--line)', cursor: 'pointer', fontSize: 24, color: 'var(--accent)' }}
          >
            +
          </div>
        </div>
      )}

      <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', margin: '16px 0 6px' }}>Caption</label>
      <textarea
        value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
        placeholder="Write a caption… use #hashtags"
        style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none', resize: 'vertical' }}
      />

      <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', margin: '16px 0 6px' }}>Where was this?</label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {(['indoor', 'outdoor'] as const).map((p) => (
          <div
            key={p} onClick={() => setPlace(p)}
            style={{ flex: 1, textAlign: 'center', border: `1px solid ${place === p ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 12, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: place === p ? 'var(--accent)' : 'transparent', color: place === p ? '#fff' : 'var(--ink)' }}
          >
            {p === 'indoor' ? '🏠 Indoor' : '📍 Outdoor'}
          </div>
        ))}
      </div>

      {place === 'outdoor' && (
        <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'var(--accent-soft)' }}>
          <b style={{ fontSize: 13 }}>Outdoor posts are geo-located &amp; shown on the map</b>
          <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', margin: '10px 0 6px' }}>Place name</label>
          <input
            value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="e.g. Marine Drive, Mumbai"
            style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-line btn-sm" onClick={useLocation}>📡 Use my current location</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManual(true)}>Enter coordinates</button>
          </div>
          {manual && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input value={lat} onChange={(e) => setLat(e.target.value)} onBlur={setManualGeo} placeholder="Latitude" inputMode="decimal" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none' }} />
              <input value={lng} onChange={(e) => setLng(e.target.value)} onBlur={setManualGeo} placeholder="Longitude" inputMode="decimal" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', outline: 'none' }} />
            </div>
          )}
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>{geoStat}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <Link className="btn btn-line" to="/social/feed" style={{ flex: 1, justifyContent: 'center' }}>Cancel</Link>
        <Button type="button" variant="accent" onClick={share} disabled={create.isPending || (!media.length && !caption.trim())} style={{ flex: 2, justifyContent: 'center' }}>
          {create.isPending ? 'Posting…' : 'Share post'}
        </Button>
      </div>
    </div>
  );
}
