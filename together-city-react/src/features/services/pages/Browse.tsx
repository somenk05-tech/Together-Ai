import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Chip, EmptyState, Spinner, Button } from '@/components/ui';
import { useBrowseServices, useServiceCategories, useServiceFacets, useEnquire, useToggleRegular, rupees, humanDistance, currentPosition, type ServiceCard } from '../api';

/**
 * FIND A SERVICE.
 *
 * The directory is empty on the day this ships, because every row in it is a
 * citizen who chose to put themselves there. That is not a bug to paper over
 * with a seeded catalogue — it is the honest state of a two-sided market on day
 * one, and the screen says so and points at the door that fixes it.
 *
 * The category counts come from the server rather than from the page, so an
 * empty category reads as "nobody here yet" rather than as a filter that
 * returned nothing.
 */
function Tile({ s, onChat, busy, saved, onKeep, keeping }: {
  s: ServiceCard; onChat: (id: string) => void; busy: boolean;
  saved: boolean; onKeep: (id: string, saved: boolean) => void; keeping: boolean;
}) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 16 }}>{s.businessName}</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{s.categoryLabel}</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>
        {s.distanceKm != null && <strong style={{ color: 'var(--accent-ink)' }}>{humanDistance(s.distanceKm)} away · </strong>}
        {s.areas.length ? s.areas.join(' · ') : s.city}
        {s.priceFrom != null && <> · from {rupees(s.priceFrom)}</>}
        {s.homeVisit && <> · comes to you</>}
        {s.onlineOk && <> · online too</>}
      </div>
      {s.about && (
        <p style={{ fontSize: 13.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {s.about}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <Button variant="accent" size="sm" disabled={busy} onClick={() => onChat(s.id)}>Chat</Button>
        {/* "Keep" rather than a heart. A heart means liked; this means "I will
            want this person again", which is a different and more useful thing
            for the list it builds. */}
        <Button variant="line" size="sm" disabled={keeping} onClick={() => onKeep(s.id, saved)}>
          {saved ? '✓ Kept' : 'Keep'}
        </Button>
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
        They will see you as a neighbour, not by name.
      </p>
    </Card>
  );
}

export function ServicesBrowse() {
  const [group, setGroup] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  // "Near me" is off until somebody asks for it. The permission prompt is the
  // cost of this feature and it is only worth paying when it was requested.
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [withinKm, setWithinKm] = useState(2);
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const cats = useServiceCategories();
  const facets = useServiceFacets(city || undefined);
  const list = useBrowseServices({
    category: category || undefined, city: city || undefined, area: area || undefined, q: q || undefined,
    ...(near ? { near: `${near.lat},${near.lng}`, withinKm } : {}),
  });

  const findMe = async () => {
    setLocBusy(true); setLocErr(null);
    try { const p = await currentPosition(); setNear({ lat: p.lat, lng: p.lng }); }
    catch (e) { setLocErr((e as Error).message); }
    finally { setLocBusy(false); }
  };
  const enquire = useEnquire();
  const keep = useToggleRegular();
  const [openedThread, setOpenedThread] = useState<string | null>(null);

  const onChat = (id: string) => {
    enquire.mutate({ id }, { onSuccess: (t) => setOpenedThread(t.id) });
  };

  const groups = cats.data?.groups ?? [];
  const counts = facets.data ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%' }}>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>Find a service</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '64ch' }}>
        Everyone here listed themselves. Message any of them without giving your name —
        the conversation stays in this hub and never reaches your Chats.
      </p>

      {openedThread && (
        <Card style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5 }}>Your message room is open.</span>
          <Link to={`/services/messages/${openedThread}`}><Button variant="accent" size="sm">Go to it</Button></Link>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search by name or what they do"
          aria-label="Search local services"
          style={{ flex: '1 1 240px', minWidth: 0, padding: '11px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)' }} />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" aria-label="City"
          style={{ flex: '0 1 150px', minWidth: 0, padding: '11px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)' }} />
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area or locality" aria-label="Area"
          style={{ flex: '0 1 180px', minWidth: 0, padding: '11px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)' }} />
      </div>

      {/* NEAR ME. A point and a distance — a radius with no centre is a filter
          that cannot be applied, so the distances only appear once there is a
          point to measure from. A listing that has not said where it is drops
          out of this search rather than being guessed at. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {near ? (
          <>
            <Chip selected onClick={() => setNear(null)}>📍 Near me ✕</Chip>
            {[0.5, 1, 2, 5, 10].map((km) => (
              <Chip key={km} selected={withinKm === km} onClick={() => setWithinKm(km)}>
                {km < 1 ? `${km * 1000} m` : `${km} km`}
              </Chip>
            ))}
          </>
        ) : (
          <Button variant="line" size="sm" disabled={locBusy} onClick={() => void findMe()}>
            {locBusy ? 'Finding you…' : '📍 Show what is near me'}
          </Button>
        )}
      </div>
      {locErr && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '0 0 10px' }} role="alert">{locErr}</p>}

      {/* GROUPS FIRST, THEN TRADES.
          There are a hundred and forty categories. A hundred and forty chips is
          not a filter, it is a wall — nobody scans past about twenty. So the
          first row is the eighteen groups, and the trades inside one appear
          only once a group is chosen. Each group carries the count of what is
          actually listed under it, so an empty corner says "nobody here yet"
          rather than looking like a filter that failed. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <Chip selected={group === '' && category === ''} onClick={() => { setGroup(''); setCategory(''); }}>Everything</Chip>
        {groups.map((g) => {
          const n = g.items.reduce((sum, c) => sum + (counts[c.key] ?? 0), 0);
          return (
            <Chip key={g.group} selected={group === g.group}
              onClick={() => { setGroup(group === g.group ? '' : g.group); setCategory(''); }}>
              {g.group}{n ? ` ${n}` : ''}
            </Chip>
          );
        })}
      </div>

      {group && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, paddingLeft: 2 }}>
          <Chip selected={category === ''} onClick={() => setCategory('')}>All of {group.toLowerCase()}</Chip>
          {(groups.find((g) => g.group === group)?.items ?? []).map((c) => (
            <Chip key={c.key} selected={category === c.key} onClick={() => setCategory(c.key)}>
              {c.label}{counts[c.key] ? ` ${counts[c.key]}` : ''}
            </Chip>
          ))}
        </div>
      )}

      {list.isLoading ? <Spinner label="Looking…" />
        : list.isError ? <EmptyState title="Couldn't load the directory" hint="Nothing is lost — try again in a moment." />
        : (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title={total === 0 ? 'Nobody has listed a business yet' : 'Nothing in this corner yet'}
            hint={total === 0
              ? 'This directory fills up from the people who live here. If you run something — a trade, a class, a kitchen — you can be the first.'
              : 'Try another category, or widen the area.'}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {list.data?.items.map((s) => (
              <Tile key={s.id} s={s} onChat={onChat} busy={enquire.isPending}
                saved={(list.data?.saved ?? []).includes(s.id)}
                onKeep={(id, isSaved) => keep.mutate({ id, saved: isSaved })}
                keeping={keep.isPending} />
            ))}
          </div>
        )}

      {total === 0 && !list.isLoading && (
        <div style={{ marginTop: 18 }}>
          <Link to="/services/list"><Button variant="accent">List your business</Button></Link>
        </div>
      )}
    </div>
  );
}
