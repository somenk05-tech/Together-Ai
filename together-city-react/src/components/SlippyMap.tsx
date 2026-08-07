import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * A MAP, IN ABOUT A HUNDRED LINES AND WITH NO DEPENDENCY.
 *
 * ── WHY NOT LEAFLET ──
 *
 * Because of how this repository ships. Every change reaches the deployment as
 * a self-extracting script that writes files and runs the gates; none of them
 * runs `npm install`. Adding a package means the build breaks on the Mac until
 * somebody remembers a step that is not in the script — and "it worked here"
 * is exactly the failure this whole delivery ritual exists to prevent.
 *
 * A slippy map is also genuinely small. Web Mercator is four lines of
 * arithmetic, tiles are a grid of 256px images at a URL, and panning is a
 * pointer delta. What Leaflet gives beyond this — layers, markers, popups,
 * plugins, GeoJSON — is not what a "where is your shop" field needs.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──
 *
 * No clustering, no vector tiles, no rotation, no inertia. It pans, it zooms,
 * and it reports where the middle is. When one of those absences becomes a
 * real product need, that is the moment to take the dependency — with the
 * install step written into the landing script.
 *
 * ── ATTRIBUTION IS NOT DECORATION ──
 *
 * OpenStreetMap's licence requires visible credit wherever its tiles appear.
 * It is rendered by this component rather than left to each caller, because a
 * caller who forgets has put the project in breach and nothing would say so.
 */

const TILE = 256;
const MIN_Z = 3;
const MAX_Z = 18;

/* ── Web Mercator. The whole of it. ─────────────────────────────────────── */
const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * Math.pow(2, z);
const latToY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z);
};
const xToLng = (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180;
const yToLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export interface SlippyMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  height?: number;
  /** Called with the new centre when the citizen stops dragging. Omit for a
   *  map that only shows a place rather than choosing one. */
  onMove?: (lat: number, lng: number) => void;
  /** A pin at the centre. False for a map that is only a picture of a place. */
  pin?: boolean;
  label?: string;
}

export function SlippyMap({ lat, lng, zoom = 15, height = 260, onMove, pin = true, label }: SlippyMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: height });
  const [z, setZ] = useState(Math.min(MAX_Z, Math.max(MIN_Z, zoom)));
  // While dragging, the map moves in PIXELS and does not tell anybody. The
  // coordinates change once, on release — a parent that re-rendered on every
  // pointermove would fight the drag it is being told about.
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const centre = useMemo(() => ({ x: lngToX(lng, z), y: latToY(lat, z) }), [lat, lng, z]);
  const dx = drag?.dx ?? 0;
  const dy = drag?.dy ?? 0;

  /** The tiles that cover the viewport, plus one ring so a drag never shows
   *  the ground before the tiles arrive. */
  const tiles = useMemo(() => {
    const n = Math.pow(2, z);
    const halfW = size.w / 2, halfH = size.h / 2;
    const left = centre.x - (halfW + dx) / TILE;
    const top = centre.y - (halfH + dy) / TILE;
    const right = centre.x + (halfW - dx) / TILE;
    const bottom = centre.y + (halfH - dy) / TILE;
    const out: Array<{ key: string; url: string; left: number; top: number }> = [];
    for (let tx = Math.floor(left) - 1; tx <= Math.ceil(right); tx++) {
      for (let ty = Math.floor(top) - 1; ty <= Math.ceil(bottom); ty++) {
        // Wrap east–west so panning past the date line keeps showing map;
        // clamp north–south, where there is nothing to wrap to.
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n;
        out.push({
          key: `${z}/${tx}/${ty}`,
          url: `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`,
          left: (tx - centre.x) * TILE + halfW + dx,
          top: (ty - centre.y) * TILE + halfH + dy,
        });
      }
    }
    return out;
  }, [z, size.w, size.h, centre.x, centre.y, dx, dy]);

  const settle = useCallback((ddx: number, ddy: number) => {
    if (!onMove) return;
    const nx = centre.x - ddx / TILE;
    const ny = centre.y - ddy / TILE;
    onMove(yToLat(ny, z), xToLng(nx, z));
  }, [centre.x, centre.y, z, onMove]);

  const zoomBy = (d: number) => setZ((prev) => Math.min(MAX_Z, Math.max(MIN_Z, prev + d)));

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        ref={box}
        role="application"
        aria-label={label ?? (onMove ? 'Map — drag to move the pin' : 'Map')}
        style={{
          position: 'relative', height, overflow: 'hidden', borderRadius: 12,
          border: '1px solid var(--line)', background: 'var(--wash)',
          cursor: onMove ? (drag ? 'grabbing' : 'grab') : 'default',
          touchAction: 'none', userSelect: 'none',
        }}
        onPointerDown={(e) => {
          if (!onMove) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          from.current = { x: e.clientX, y: e.clientY };
          setDrag({ dx: 0, dy: 0 });
        }}
        onPointerMove={(e) => {
          if (!from.current) return;
          setDrag({ dx: e.clientX - from.current.x, dy: e.clientY - from.current.y });
        }}
        onPointerUp={() => {
          if (!from.current) return;
          const d = drag ?? { dx: 0, dy: 0 };
          from.current = null;
          setDrag(null);
          if (d.dx || d.dy) settle(d.dx, d.dy);
        }}
        onPointerCancel={() => { from.current = null; setDrag(null); }}
      >
        {tiles.map((t) => (
          <img key={t.key} src={t.url} alt="" width={TILE} height={TILE} loading="lazy" draggable={false}
            className="no-case"
            style={{ position: 'absolute', left: t.left, top: t.top, width: TILE, height: TILE, pointerEvents: 'none' }} />
        ))}

        {pin && (
          // The pin is fixed to the centre of the frame and the map moves under
          // it. Drawing it at a projected coordinate instead would mean
          // recomputing its position on every pointermove, and it would drift
          // by a pixel or two against the tiles while doing it.
          <div aria-hidden style={{
            position: 'absolute', left: '50%', top: '50%', width: 0, height: 0,
            transform: 'translate(-50%, -100%)', pointerEvents: 'none',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)', background: 'var(--accent-ink)',
              boxShadow: '0 1px 4px rgba(0,0,0,.35)',
            }} />
          </div>
        )}

        <div style={{ position: 'absolute', right: 8, top: 8, display: 'grid', gap: 4 }}>
          {([['+', 1, 'Zoom in'], ['−', -1, 'Zoom out']] as const).map(([sign, d, aria]) => (
            <button key={aria} type="button" aria-label={aria} onClick={() => zoomBy(d)}
              style={{
                width: 44, height: 44, borderRadius: 10, cursor: 'pointer',
                border: '1px solid var(--line)', background: 'var(--card)',
                fontSize: 18, lineHeight: 1, fontFamily: 'inherit', color: 'var(--ink)',
              }}>{sign}</button>
          ))}
        </div>

        {/* OpenStreetMap's licence requires this wherever its tiles appear. */}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener"
          style={{
            position: 'absolute', right: 0, bottom: 0, padding: '2px 6px',
            background: 'rgba(255,255,255,.82)', fontSize: 10, lineHeight: 1.6,
            color: 'var(--ink-soft)', textDecoration: 'none', borderTopLeftRadius: 6,
          }}>© OpenStreetMap contributors</a>
      </div>
    </div>
  );
}
