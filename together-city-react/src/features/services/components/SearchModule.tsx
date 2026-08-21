import { Button, Card, Chip } from '@/components/ui';

/**
 * THE ONE THING THIS PAGE IS FOR.
 *
 * Three equal boxes said all three questions matter the same. They do not: a
 * citizen arrives knowing WHAT they need and only sometimes where, so the trade
 * gets the room and the place gets the margin. City and area stay because a
 * directory of the whole country is not a local directory — but they stay small.
 *
 * WRITTEN FOR A SENTENCE IT CANNOT YET PARSE. The field takes "AC repair in
 * Bandra today" happily and the server reads it as a name-and-trade search,
 * which finds the AC repair people and ignores the rest. That is the honest
 * half-answer: the box does not pretend to have understood the urgency, and it
 * does not refuse the sentence either. When intent parsing lands it slots in
 * behind this exact input, and nobody has to learn a new way to ask.
 */
export function SearchModule({
  q, onQ, city, onCity, area, onArea,
  near, onFindMe, onClearNear, withinKm, onWithinKm, locBusy, locErr,
  popular, onPopular,
}: {
  q: string; onQ: (v: string) => void;
  city: string; onCity: (v: string) => void;
  area: string; onArea: (v: string) => void;
  near: { lat: number; lng: number } | null;
  onFindMe: () => void; onClearNear: () => void;
  withinKm: number; onWithinKm: (km: number) => void;
  locBusy: boolean; locErr: string | null;
  popular: Array<{ group: string; count: number }>;
  onPopular: (group: string) => void;
}) {
  const small = {
    padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12,
    fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)',
    width: '100%', boxSizing: 'border-box' as const,
  };

  return (
    <Card style={{ padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ flex: '4 1 320px', minWidth: 0, display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            What do you need?
          </span>
          <input value={q} onChange={(e) => onQ(e.target.value)}
            aria-label="What do you need?"
            placeholder="Salon, doctor, plumber, photographer, gym…"
            style={{ ...small, padding: '15px 16px', fontSize: 17, borderRadius: 'var(--r-2)' }} />
        </label>
        <label style={{ flex: '1 1 140px', minWidth: 0, display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>City</span>
          <input value={city} onChange={(e) => onCity(e.target.value)} aria-label="City" placeholder="Mumbai" style={small} />
        </label>
        <label style={{ flex: '1 1 160px', minWidth: 0, display: 'grid', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>Area</span>
          <input value={area} onChange={(e) => onArea(e.target.value)} aria-label="Area or locality" placeholder="Bandra" style={small} />
        </label>
      </div>

      {/* NEAR ME. A point and a distance — a radius with no centre is a filter
          that cannot be applied, so the distances only appear once there is a
          point to measure from, and a listing that never said where it is drops
          out of this search rather than being guessed at. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {near ? (
          <>
            <Chip selected onClick={onClearNear}>📍 Near me ✕</Chip>
            {[0.5, 1, 2, 5, 10].map((km) => (
              <Chip key={km} selected={withinKm === km} onClick={() => onWithinKm(km)}>
                {km < 1 ? `${km * 1000} m` : `${km} km`}
              </Chip>
            ))}
          </>
        ) : (
          <Button variant="line" size="sm" disabled={locBusy} onClick={onFindMe}>
            {locBusy ? 'Finding you…' : '📍 Show what is near me'}
          </Button>
        )}
      </div>
      {locErr && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: 0 }} role="alert">{locErr}</p>}

      {/* POPULAR IS A COUNT, NOT AN EDITOR'S PICK. These are the groups with the
          most businesses actually listed nearby, so an empty city offers
          nothing rather than offering six doors onto empty rooms. */}
      {popular.length > 0 && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Popular near you</span>
          {popular.map((p) => (
            <Chip key={p.group} onClick={() => onPopular(p.group)}>{p.group}</Chip>
          ))}
        </div>
      )}
    </Card>
  );
}
