import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMap } from '../api';
import { Avatar, initials } from '../shared';
import type { Post } from '../api';

/** Project a lat/lng into a 0–100% box around a Mumbai-ish bounding area. */
function project(lat: number, lng: number): { top: number; left: number } {
  const latMin = 12.9, latMax = 19.2, lngMin = 72.7, lngMax = 77.7;
  const left = Math.min(96, Math.max(4, ((lng - lngMin) / (lngMax - lngMin)) * 100));
  const top = Math.min(92, Math.max(8, (1 - (lat - latMin) / (latMax - latMin)) * 100));
  return { top, left };
}

function Pin({ p }: { p: Post }) {
  const { top, left } = project(p.lat as number, p.lng as number);
  return (
    <div
      title={p.text ?? p.author.name}
      style={{ position: 'absolute', top: `${top}%`, left: `${left}%`, transform: 'translate(-50%,-100%)', zIndex: 2 }}
    >
      <div style={{ width: 30, height: 30, borderRadius: '50% 50% 50% 0', background: 'var(--accent)', transform: 'rotate(-45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(0,0,0,.3)' }}>
        <span style={{ transform: 'rotate(45deg)', fontSize: 12 }}>📍</span>
      </div>
    </div>
  );
}

/** Social Life · City Map — outdoor posts pinned across the city (live from /social/map). */
export function CityMap() {
  const map = useMap();
  const posts = map.data ?? [];

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <div className="eyebrow">Social Life · City Map</div>
          <h1 style={{ fontSize: 'clamp(24px,3vw,34px)' }}>What's happening nearby</h1>
          <p className="lede">Outdoor posts are geo-located and pinned to the map as they're shared.</p>
        </div>
        <Link to="/social/create"><Button variant="accent" size="sm">+ Pin a post</Button></Link>
      </div>

      {map.isLoading ? <Spinner label="Loading the map…" />
        : map.isError ? <EmptyState title="Couldn't load the map" hint="Start the backend and reload." />
          : (
            <>
              <div
                className="rise d1"
                style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--line)', background: 'linear-gradient(135deg,var(--accent-soft),var(--paper))', marginBottom: 24 }}
              >
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)', backgroundSize: '48px 48px', opacity: 0.5 }} />
                {posts.map((p) => <Pin key={p.id} p={p} />)}
                {posts.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 13 }}>No outdoor posts pinned yet.</span>
                  </div>
                )}
              </div>

              <div className="blk-head rise d2"><h2>Pinned posts</h2><span className="muted" style={{ fontSize: 12 }}>{posts.length} on the map</span></div>
              {posts.length === 0 ? (
                <EmptyState icon="🗺️" title="Nothing on the map yet" hint="Share an outdoor post to drop the first pin." />
              ) : (
                <div className="rows rise d2">
                  {posts.map((p) => (
                    <Link key={p.id} className="row" to="/social/feed">
                      <Avatar label={initials(p.author.name)} />
                      <div className="grow">
                        <div className="t">{p.text ?? `${p.author.name} shared a moment`}</div>
                        <div className="m">
                          {p.author.name} · {(p.lat as number).toFixed(4)}, {(p.lng as number).toFixed(4)}
                        </div>
                      </div>
                      <span className="tag">📍 outdoor</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
    </div>
  );
}
