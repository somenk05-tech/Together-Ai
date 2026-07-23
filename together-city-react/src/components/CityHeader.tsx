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

  if (!data && q.isLoading) {
    // Reserve space with just the date so the strip never pops in jarringly.
    return (
      <div style={wrap(dark)}>
        <div style={{ fontSize: 12.5, color: soft, letterSpacing: '.01em' }}>{day} · {date}</div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div style={wrap(dark)} aria-label={`${data.city}, ${day} ${date}${data.temperatureC != null ? `, ${data.temperatureC} degrees` : ''}`}>
      {/* Line 1 — location */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 17, color: ink, lineHeight: 1.05, letterSpacing: '-.01em' }}>
        <span aria-hidden style={{ fontSize: 14 }}>📍</span> {data.city}
      </div>
      {/* Line 2 — day + date */}
      <div style={{ fontSize: 12.5, color: soft, marginTop: 3, fontWeight: 500, letterSpacing: '.01em' }}>{day} · {date}</div>

      {/* Weather — two lines: temp + condition, then "feels like" */}
      {data.temperatureC != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 9, paddingTop: 9, borderTop: `1px solid ${dark ? 'rgba(255,255,255,.14)' : 'var(--line)'}` }}>
          <span aria-hidden style={{ fontSize: 27, lineHeight: 1 }}>{data.icon}</span>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: ink, letterSpacing: '-.01em' }}>
              {data.temperatureC}°C
              {data.description && <span style={{ fontSize: 12.5, fontWeight: 500, color: soft, marginLeft: 7 }}>{data.description}</span>}
            </div>
            {data.feelsLikeC != null && data.feelsLikeC !== data.temperatureC && (
              <div style={{ fontSize: 12, color: soft, marginTop: 1 }}>Feels like {data.feelsLikeC}°</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function wrap(dark: boolean): React.CSSProperties {
  return {
    display: 'inline-block', padding: '13px 17px', borderRadius: 18, minWidth: 172,
    background: dark
      ? 'linear-gradient(150deg, rgba(28,24,18,.58), rgba(14,12,10,.44))'
      : 'var(--card)',
    backdropFilter: dark ? 'blur(14px) saturate(1.1)' : undefined,
    WebkitBackdropFilter: dark ? 'blur(14px) saturate(1.1)' : undefined,
    border: dark ? '1px solid rgba(255,255,255,.18)' : '1px solid var(--line)',
    boxShadow: dark ? '0 10px 34px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.10)' : '0 2px 12px rgba(0,0,0,.05)',
  };
}
