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
        <div style={{ fontSize: 12.5, color: soft }}>{day} · {date}</div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div style={wrap(dark)} aria-label={`${data.city}, ${day} ${date}${data.temperatureC != null ? `, ${data.temperatureC} degrees` : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 15, color: ink, lineHeight: 1.1 }}>
        <span aria-hidden>📍</span> {data.city}
      </div>
      <div style={{ fontSize: 12.5, color: soft, marginTop: 2 }}>{day} · {date}</div>
      {data.temperatureC != null && (
        <div style={{ fontSize: 13, color: ink, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ fontSize: 15 }}>{data.icon}</span>
          <strong>{data.temperatureC}°C</strong>
          {data.description && <span style={{ color: soft }}>· {data.description}</span>}
          {data.feelsLikeC != null && data.feelsLikeC !== data.temperatureC && (
            <span style={{ color: soft }}>· feels {data.feelsLikeC}°</span>
          )}
        </div>
      )}
    </div>
  );
}

function wrap(dark: boolean): React.CSSProperties {
  return {
    display: 'inline-block', padding: '10px 14px', borderRadius: 14,
    background: dark ? 'rgba(18,16,12,.42)' : 'var(--card)',
    backdropFilter: dark ? 'blur(8px)' : undefined,
    WebkitBackdropFilter: dark ? 'blur(8px)' : undefined,
    border: dark ? '1px solid rgba(255,255,255,.16)' : '1px solid var(--line)',
    boxShadow: dark ? '0 6px 24px rgba(0,0,0,.25)' : 'none',
  };
}
