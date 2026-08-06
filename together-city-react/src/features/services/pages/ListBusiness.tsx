import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import { useCreateService, useServiceCategories, currentPosition } from '../api';

/**
 * LIST YOUR BUSINESS.
 *
 * The category is chosen from the list, never typed. Two plumbers who type
 * "plumber" and "Plumbing Services" are two categories, and a directory with
 * two hundred one-listing categories is not a directory — it is a search box
 * with extra steps.
 *
 * The phone number is asked for and then never published. It is here so the
 * owner has their own contact on file and so a future "share my number" is a
 * decision rather than a migration; what a browser gets is the anonymous
 * thread, which is the whole arrangement this hub is built on. The form says
 * that out loud, because a field that quietly does not do what people assume is
 * worse than no field.
 */
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px',
  border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit',
  background: 'var(--card)',
};
const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 };

export function ListBusiness() {
  const nav = useNavigate();
  const cats = useServiceCategories();
  const create = useCreateService();

  const [businessName, setName] = useState('');
  const [group, setGroup] = useState('');
  const [categoryKey, setCategory] = useState('');
  const [about, setAbout] = useState('');
  const [city, setCity] = useState('');
  const [areas, setAreas] = useState('');
  const [phone, setPhone] = useState('');
  const [priceFrom, setPrice] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [radiusKm, setRadius] = useState('');
  const [homeVisit, setHomeVisit] = useState(false);
  const [onlineOk, setOnlineOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const locateMe = async () => {
    setLocBusy(true); setLocErr(null);
    try {
      const p = await currentPosition();
      setLat(p.lat.toFixed(6)); setLng(p.lng.toFixed(6)); setAccuracy(p.accuracyM);
    } catch (e) { setLocErr((e as Error).message); }
    finally { setLocBusy(false); }
  };
  const latN = Number(lat), lngN = Number(lng);
  const pinned = lat !== '' && lng !== '' && Number.isFinite(latN) && Number.isFinite(lngN)
    && latN >= -90 && latN <= 90 && lngN >= -180 && lngN <= 180;

  const ready = businessName.trim().length >= 2 && categoryKey && city.trim().length >= 2;

  const submit = () => {
    setErr(null);
    create.mutate({
      businessName: businessName.trim(),
      categoryKey,
      about: about.trim() || undefined,
      city: city.trim(),
      areas: areas.trim() || undefined,
      phone: phone.trim() || undefined,
      priceFrom: priceFrom.trim() ? Number(priceFrom.replace(/[^\d]/g, '')) : undefined,
      ...(pinned ? { lat: latN, lng: lngN } : {}),
      ...(radiusKm.trim() ? { radiusKm: Number(radiusKm.replace(/[^\d]/g, '')) } : {}),
      homeVisit, onlineOk,
    }, {
      onSuccess: () => nav('/services/mine'),
      // The error the server actually gave, not a shrug. A form that says
      // "something went wrong" after somebody typed for four minutes is how a
      // listing silently never gets made.
      onError: (e: unknown) => {
        const m = e as { response?: { data?: { message?: string | string[] } } };
        const raw = m?.response?.data?.message;
        setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'Could not save that. Check the fields and try again.');
      },
    });
  };

  if (cats.isLoading) return <Spinner label="Loading categories…" />;
  if (cats.isError) return <EmptyState title="Couldn't load the categories" hint="A business has to pick one, so the form waits for them. Try again in a moment." />;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>List your business</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '60ch' }}>
        People nearby will find you by what you do and where you work. They message you
        without giving their name — you will see them as a neighbour, and the conversation
        stays inside this hub.
      </p>

      <Card style={{ display: 'grid', gap: 16 }}>
        <div>
          <label htmlFor="svc-name" style={label}>Business name</label>
          <input id="svc-name" style={field} value={businessName} onChange={(e) => setName(e.target.value)}
            placeholder="Sharma Plumbing" maxLength={90} />
        </div>

        {/*
          TWO STEPS, THE SAME TWO STEPS AS FINDING ONE.

          One select holding a hundred and forty options is a scroll, not a
          choice — and it is the wrong shape besides, because the directory
          people will browse is organised by group first. Listing and finding
          now ask the same question in the same order, so a business owner
          picking "Home Services › Plumbers" has already seen where they will
          appear.
        */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <div>
            <label htmlFor="svc-group" style={label}>What kind of business</label>
            <select id="svc-group" style={field} value={group}
              onChange={(e) => { setGroup(e.target.value); setCategory(''); }}>
              <option value="">Choose…</option>
              {(cats.data?.groups ?? []).map((g) => <option key={g.group} value={g.group}>{g.group}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="svc-cat" style={label}>What you do</label>
            <select id="svc-cat" style={field} value={categoryKey} disabled={!group}
              onChange={(e) => setCategory(e.target.value)}>
              <option value="">{group ? 'Choose…' : 'Pick a kind first'}</option>
              {(cats.data?.groups.find((g) => g.group === group)?.items ?? [])
                .map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11.5, margin: '-6px 0 0' }}>
          Nothing here fits? Choose <strong>Other → Something else</strong> and say what you do
          in About — people search that text too, so you are still findable.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <div>
            <label htmlFor="svc-city" style={label}>City</label>
            <input id="svc-city" style={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" maxLength={60} />
          </div>
          <div>
            <label htmlFor="svc-areas" style={label}>Areas you cover</label>
            <input id="svc-areas" style={field} value={areas} onChange={(e) => setAreas(e.target.value)}
              placeholder="Bandra, Khar, Santacruz" maxLength={300} />
          </div>
        </div>

        {/*
          WHERE YOU ACTUALLY ARE.

          A city and a list of locality names is how a person describes where
          they work. It is not something a map can draw, and it cannot answer
          "within 2 km" — so the pin is asked for separately and stored as real
          coordinates.

          THE BUTTON COMES FIRST AND THE NUMBERS SECOND, and both exist. A
          permission prompt is asked for once, on a press, never on page load —
          an uninvited prompt is one most people decline, and a declined one is
          hard to ask for again. Whoever declines, or is sitting at a desk
          across town from their shop, types it instead. Neither path is the
          fallback; they are two ways to answer the same question.
        */}
        <div>
          <span style={label}>Where you are <span className="muted" style={{ fontWeight: 400 }}>(optional, but it puts you on the map)</span></span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="line" size="sm" disabled={locBusy} onClick={() => void locateMe()}>
              {locBusy ? 'Finding you…' : '📍 Use my current location'}
            </Button>
            {pinned && (
              <>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Pinned at {latN.toFixed(5)}, {lngN.toFixed(5)}
                  {accuracy != null && ` · accurate to about ${accuracy} m`}
                </span>
                <button type="button" onClick={() => { setLat(''); setLng(''); setAccuracy(null); }}
                  style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>Clear</button>
              </>
            )}
          </div>
          {locErr && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '8px 0 0' }} role="alert">{locErr}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 10 }}>
            <div>
              <label htmlFor="svc-lat" style={{ ...label, fontWeight: 500, fontSize: 12 }}>Latitude</label>
              <input id="svc-lat" style={field} value={lat} onChange={(e) => { setLat(e.target.value); setAccuracy(null); }}
                inputMode="decimal" placeholder="19.076090" maxLength={12} />
            </div>
            <div>
              <label htmlFor="svc-lng" style={{ ...label, fontWeight: 500, fontSize: 12 }}>Longitude</label>
              <input id="svc-lng" style={field} value={lng} onChange={(e) => { setLng(e.target.value); setAccuracy(null); }}
                inputMode="decimal" placeholder="72.877426" maxLength={12} />
            </div>
            <div>
              <label htmlFor="svc-radius" style={{ ...label, fontWeight: 500, fontSize: 12 }}>How far you travel (km)</label>
              <input id="svc-radius" style={field} value={radiusKm} onChange={(e) => setRadius(e.target.value)}
                inputMode="numeric" placeholder="5" maxLength={3} />
            </div>
          </div>
          {lat !== '' && lng !== '' && !pinned && (
            <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '8px 0 0' }} role="alert">
              Those do not look like coordinates. Latitude runs −90 to 90, longitude −180 to 180 —
              and they are easy to swap round.
            </p>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, minHeight: 44 }}>
              <input type="checkbox" checked={homeVisit} onChange={(e) => setHomeVisit(e.target.checked)} />
              I come to you
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, minHeight: 44 }}>
              <input type="checkbox" checked={onlineOk} onChange={(e) => setOnlineOk(e.target.checked)} />
              I work online too
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="svc-about" style={label}>About</label>
          <textarea id="svc-about" style={{ ...field, minHeight: 110, resize: 'vertical' }} value={about}
            onChange={(e) => setAbout(e.target.value)} maxLength={1200}
            placeholder="Taps, leaks, geysers and bathroom fittings. Same-day for emergencies." />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <div>
            <label htmlFor="svc-price" style={label}>Starting price <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
            <input id="svc-price" style={field} value={priceFrom} onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric" placeholder="₹300" maxLength={9} />
          </div>
          <div>
            <label htmlFor="svc-phone" style={label}>Your phone <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
            <input id="svc-phone" style={field} value={phone} onChange={(e) => setPhone(e.target.value)}
              inputMode="tel" placeholder="+91…" maxLength={20} />
            <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
              Only you ever see this. It is not shown on your listing — people reach you
              through the message room.
            </p>
          </div>
        </div>

        {err && <p style={{ color: 'var(--danger-ink)', fontSize: 13, margin: 0 }} role="alert">{err}</p>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="accent" disabled={!ready || create.isPending} onClick={submit}>
            {create.isPending ? 'Listing…' : 'List my business'}
          </Button>
          <Button variant="line" onClick={() => nav('/services/browse')}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
