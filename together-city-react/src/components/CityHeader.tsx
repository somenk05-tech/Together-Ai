import { useEffect, useState } from 'react';
import { useCityHeader } from '@/api/city.api';
import { useMasterProfile } from '@/features/profile/hooks';

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
export function CityHeader() {
  const coords = useDeviceCoords();
  // When there's no device location, hint the API with the user's home city
  // (from the Master Profile) so weather still resolves to the right place.
  const master = useMasterProfile();
  const homeCity = coords ? null : (master.data?.city || master.data?.birthCity || null);
  const q = useCityHeader(coords, homeCity);
  const now = useLiveDate();
  const data = q.data;

  const day = now.toLocaleDateString('en-IN', { weekday: 'short' });
  const date = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  // IT SITS ON A PHOTOGRAPH, NOT ON THE PAGE. Near-black was chosen when the
  // hero was assumed to be pale; it is a city video, and the only ink that
  // survives every frame of it is white with a shadow underneath. This is one
  // of the three places in the application where type is not black, and all
  // three are type on an image.
  const ink = 'var(--on-accent)';
  const soft = 'var(--on-image-soft)';

  const dot = <span aria-hidden style={{ color: soft, opacity: 0.7 }}>·</span>;

  // ALWAYS render — the date shows immediately, city + weather fill in when the
  // API responds (and it degrades gracefully if the weather call ever fails).
  const hasWeather = data?.temperatureC != null;

  return (
    <div aria-label={`${data?.city ?? 'Your city'}, ${day} ${date}${hasWeather ? `, ${data.temperatureC} degrees` : ''}`}>
      {/* IT WRAPS, BECAUSE THE ROW IS LONGER THAN A SMALL PHONE. `nowrap` on
          the flex container could not wrap and the hero does not scroll, so on
          a 320px screen the line ran 50px past the viewport and "feels 30°"
          was clipped away with no way to reach it. The spans keep their own
          nowrap; only the row is allowed to fold.
          THE SHADOW IS TIGHTER AND DARKER for the same reason it exists at
          all: a 3px blur at .55 disappears against the pale sky in the top
          third of the hero, which is exactly where this strip sits. A 2px
          edge carries the letterform and the wider halo lifts it off whatever
          is behind it that day — the picture changes, the strip cannot. */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, rowGap: 2, lineHeight: 1.25, textShadow: 'var(--on-image-shadow)' }}>
        {data?.city && (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, fontSize: 12.5, color: ink, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>
              <span aria-hidden style={{ fontSize: 11 }}>📍</span>{data.city}
            </span>
            {dot}
          </>
        )}
        <span style={{ fontSize: 11.5, color: soft, fontWeight: 600, whiteSpace: 'nowrap' }}>{day} {date}</span>
        {hasWeather && (
          <>
            {dot}
            <span aria-hidden style={{ fontSize: 13 }}>{data.icon}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{data.temperatureC}°C</span>
            {data.description && <span style={{ fontSize: 11, color: soft }}>{data.description}</span>}
            {data.feelsLikeC != null && data.feelsLikeC !== data.temperatureC && (
              <>{dot}<span style={{ fontSize: 11, color: soft, whiteSpace: 'nowrap' }}>feels {data.feelsLikeC}°</span></>
            )}
          </>
        )}
      </div>
    </div>
  );
}
