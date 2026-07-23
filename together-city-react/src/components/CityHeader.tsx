import { useEffect, useState } from 'react';
import { useCityHeader } from '@/api/city.api';

/** Best-effort device geolocation (non-blocking). Resolves null if denied. */
function useDeviceCoords(): { lat: number; lng: number } | null {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    let done = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (!done) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { /* denied / unavailable → fall back to the saved home city */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
    return () => { done = true; };
  }, []);
  return coords;
}

/** The current date/day, re-computed automatically at midnight. */
function useLiveDate(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const next = new Date();
    next.setHours(24, 0, 0, 500); // just after midnight
    const t = window.setTimeout(() => setNow(new Date()), next.getTime() - Date.now());
    return () => window.clearTimeout(t);
  }, [now]);
  return now;
}

/**
 * Dynamic city header strip — location + date + live weather. Sits top-left over
 * the city hero, below the Together City logo. Location resolves device → home
 * city (Master Profile) → default; weather refreshes every ~20 min; the date
 * rolls over at midnight on its own.
 */
export function CityHeader({ variant = 'overlay' }: { variant?: 'overlay' | 'plain' }) {
  const coords = useDeviceCoords();
  const q = useCityHeader(coords);
  const now = useLiveDate();
  const data = q.data;

  const day = now.toLocaleDateString('en-IN', { weekday: 'short' });
  const date = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const dark = variant === 'overlay';
  const ink = dark ? '#fff' : 'var(--ink)';
  const soft = dark ? 'rgba(255,255,255,.82)' : 'var(--muted)';

  const dot = <span aria-hidden style={{ color: soft, opacity: 0.7 }}>·</span>;

  if (!data && q.isLoading) {
    return (
      <div style={wrap(dark)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: soft, letterSpacing: '.01em', whiteSpace: 'nowrap' }}>{day} · {date}</div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div style={wrap(dark)} aria-label={`${data.city}, ${day} ${date}${data.temperatureC != null ? `, ${data.temperatureC} degrees` : ''}`}>
      {/* Everything on one line: 📍 City · Thu 23 Jul · 🌧 27°C · feels 29° */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', lineHeight: 1 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, fontSize: 14.5, color: ink, letterSpacing: '-.01em' }}>
          <span aria-hidden style={{ fontSize: 13 }}>📍</span>{data.city}
        </span>
        {dot}
        <span style={{ fontSize: 13, color: soft, fontWeight: 500 }}>{day} {date}</span>
        {data.temperatureC != null && (
          <>
            {dot}
            <span aria-hidden style={{ fontSize: 16 }}>{data.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: ink }}>{data.temperatureC}°C</span>
            {data.description && <span style={{ fontSize: 12.5, color: soft }}>{data.description}</span>}
            {data.feelsLikeC != null && data.feelsLikeC !== data.temperatureC && (
              <>{dot}<span style={{ fontSize: 12.5, color: soft }}>feels {data.feelsLikeC}°</span></>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function wrap(dark: boolean): React.CSSProperties {
  return {
    display: 'inline-block', padding: '9px 15px', borderRadius: 999, maxWidth: '92vw', overflow: 'hidden',
    background: dark
      ? 'linear-gradient(150deg, rgba(28,24,18,.55), rgba(14,12,10,.42))'
      : 'var(--card)',
    backdropFilter: dark ? 'blur(14px) saturate(1.1)' : undefined,
    WebkitBackdropFilter: dark ? 'blur(14px) saturate(1.1)' : undefined,
    border: dark ? '1px solid rgba(255,255,255,.18)' : '1px solid var(--line)',
    boxShadow: dark ? '0 8px 28px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.10)' : '0 2px 12px rgba(0,0,0,.05)',
  };
}
