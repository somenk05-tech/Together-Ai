import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { SlippyMap } from './SlippyMap';
import { geoApi, type Place } from '@/api/geo.api';

/**
 * "WHERE ARE YOU" — ASKED THE WAY A PERSON WOULD ASK IT.
 *
 * It was a latitude field and a longitude field. Nobody knows their latitude.
 * The button that filled them in worked, and everybody who declined the
 * permission prompt, or was sitting at a desk across town from their shop, was
 * left typing decimal degrees into two boxes with a validation message about
 * −90 to 90 underneath.
 *
 * Three ways in now, all answering the same question: search an address, drag
 * the pin, or press the button. The numbers are still there — they are still
 * what gets stored, and a business owner who knows them should not have that
 * taken away — but they are underneath, as a detail, not the interface.
 *
 * ── SEARCH IS ON SUBMIT, NOT PER KEYSTROKE, AND THAT IS A CHOICE ──
 *
 * Nominatim is free, run on donated hardware, and its usage policy asks
 * applications not to fire a request per keystroke. Autocomplete-as-you-type
 * would be nicer and would be us taking more than our share of something
 * nobody is charging for. Enter, or the button.
 */

export interface LocationValue { lat: string; lng: string; accuracy: number | null }

export function LocationPicker({ value, onChange, hint }: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  hint?: string;
}) {
  const latN = Number(value.lat);
  const lngN = Number(value.lng);
  const pinned = value.lat !== '' && value.lng !== ''
    && Number.isFinite(latN) && Number.isFinite(lngN)
    && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;

  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);

  // The address under the map follows the pin. Guarded by a token so a slow
  // reverse lookup for a pin the citizen has already dragged away from cannot
  // land afterwards and relabel the new position with the old address.
  const token = useRef(0);
  useEffect(() => {
    if (!pinned) { setAddress(null); return; }
    const mine = ++token.current;
    setAddress(null);
    geoApi.reverse(latN, lngN)
      .then((p) => { if (mine === token.current) setAddress(p?.label ?? null); })
      .catch(() => { if (mine === token.current) setAddress(null); });
  }, [pinned, latN, lngN]);

  const set = (lat: number, lng: number, accuracy: number | null = null) =>
    onChange({ lat: lat.toFixed(6), lng: lng.toFixed(6), accuracy });

  const runSearch = () => {
    const term = q.trim();
    if (term.length < 3) { setErr('Type at least three characters of an address.'); return; }
    setErr(null); setSearching(true); setResults(null);
    geoApi.search(term, pinned ? { lat: latN, lng: lngN } : undefined)
      .then((items) => {
        setResults(items);
        if (items.length === 0) setErr('No address matched that. Try a landmark, or the street and the city.');
      })
      .catch(() => setErr('The address lookup did not answer. The pin and the numbers still work.'))
      .finally(() => setSearching(false));
  };

  const locateMe = () => {
    if (!navigator.geolocation) { setErr('This browser cannot share a location.'); return; }
    setErr(null); setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocBusy(false);
        set(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy));
      },
      () => {
        setLocBusy(false);
        setErr('That did not come through. Search for the address instead, or drag the pin.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* ── search ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
          aria-label="Search for an address"
          placeholder="Search an address, landmark or area"
          maxLength={160}
          style={{
            flex: '1 1 260px', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
            border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14,
            fontFamily: 'inherit', background: 'var(--card)',
          }} />
        <Button variant="line" size="sm" disabled={searching} onClick={runSearch}>
          {searching ? 'Looking…' : 'Search'}
        </Button>
        <Button variant="line" size="sm" disabled={locBusy} onClick={locateMe}>
          {locBusy ? 'Finding you…' : '📍 Use my location'}
        </Button>
      </div>

      {results && results.length > 0 && (
        <div style={{ display: 'grid', gap: 2, border: '1px solid var(--line)', borderRadius: 'var(--r-1)', overflow: 'hidden' }}>
          {results.map((p) => (
            <button key={`${p.lat},${p.lng}`} type="button"
              onClick={() => { set(p.lat, p.lng); setResults(null); setQ(''); }}
              style={{
                display: 'block', textAlign: 'left', width: '100%', minHeight: 44,
                padding: '8px 12px', border: 0, borderBottom: '1px solid var(--line)',
                background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
              }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.short}</span>
              <span className="muted" style={{ display: 'block', fontSize: 12 }}>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── the map ── */}
      <SlippyMap
        lat={pinned ? latN : 19.076}
        lng={pinned ? lngN : 72.8777}
        zoom={pinned ? 16 : 11}
        height={280}
        onMove={(la, ln) => set(la, ln)}
        label="Drag to place the pin on your business"
      />

      <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
        {pinned
          ? <>Pinned at {latN.toFixed(5)}, {lngN.toFixed(5)}
              {value.accuracy != null && ` · accurate to about ${value.accuracy} m`}
              {address && <> · {address}</>}
              {' '}
              <button type="button" onClick={() => onChange({ lat: '', lng: '', accuracy: null })}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>Clear</button>
            </>
          : (hint ?? 'Drag the pin, search an address, or use your location. Nothing is pinned yet.')}
      </p>

      {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{err}</p>}

      {/* The numbers survive, as a detail. Somebody who has their coordinates
          from a survey or another listing should not lose the ability to paste
          them in because the map is nicer for everybody else. */}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--muted)', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          Enter coordinates instead
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 8 }}>
          <div>
            <label htmlFor="loc-lat" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Latitude</label>
            <input id="loc-lat" value={value.lat} inputMode="decimal" maxLength={12} placeholder="19.076090"
              onChange={(e) => onChange({ ...value, lat: e.target.value, accuracy: null })}
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)' }} />
          </div>
          <div>
            <label htmlFor="loc-lng" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Longitude</label>
            <input id="loc-lng" value={value.lng} inputMode="decimal" maxLength={12} placeholder="72.877426"
              onChange={(e) => onChange({ ...value, lng: e.target.value, accuracy: null })}
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)' }} />
          </div>
        </div>
      </details>
    </div>
  );
}
