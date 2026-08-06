import { useEffect, useState } from 'react';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useServiceCategories, currentPosition } from './api';

/**
 * THE ONE FORM A LISTING HAS.
 *
 * Listing a business and editing one ask exactly the same questions, so they
 * are the same component. Two copies of a form drift: the second gains a field
 * the first never got, or loses the EXIF note, or asks for the category in one
 * flat select while the other asks in two steps — and the owner meets a
 * different application depending which door they came through.
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
const MAX_PHOTOS = 5;

/** What the form hands back. Empty strings are real answers, not absences. */
export interface ListingValues {
  businessName: string;
  categoryKey: string;
  about: string;
  city: string;
  areas: string;
  phone: string;
  priceFrom?: number;
  photoUrls: string[];
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

/** What it starts from — the shape a listing comes back in. */
export interface ListingDraft {
  businessName?: string;
  categoryKey?: string;
  about?: string | null;
  city?: string;
  areas?: string[];
  phone?: string | null;
  priceFrom?: number | null;
  photos?: Array<{ url: string }>;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
}

const str = (v: unknown): string => (v == null ? '' : String(v));

export function ListingForm({ initial, submitLabel, busyLabel, pending, error, onSubmit, onCancel }: {
  initial?: ListingDraft;
  submitLabel: string;
  busyLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (v: ListingValues) => void;
  onCancel: () => void;
}) {
  const cats = useServiceCategories();

  const [businessName, setName] = useState(str(initial?.businessName));
  const [group, setGroup] = useState('');
  const [categoryKey, setCategory] = useState(str(initial?.categoryKey));
  const [about, setAbout] = useState(str(initial?.about));
  const [city, setCity] = useState(str(initial?.city));
  const [areas, setAreas] = useState((initial?.areas ?? []).join(', '));
  const [phone, setPhone] = useState(str(initial?.phone));
  const [priceFrom, setPrice] = useState(str(initial?.priceFrom));
  const [lat, setLat] = useState(str(initial?.lat));
  const [lng, setLng] = useState(str(initial?.lng));
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [radiusKm, setRadius] = useState(str(initial?.radiusKm));
  const [photos, setPhotos] = useState<string[]>((initial?.photos ?? []).map((p) => p.url));
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  /**
   * The group is derived, not stored. A listing knows its category key; which
   * group that key sits in is the taxonomy's business, and making the owner
   * re-answer a question the data already implies is how an edit screen loses
   * somebody's category on the way through.
   */
  useEffect(() => {
    if (group || !categoryKey || !cats.data) return;
    const g = cats.data.groups.find((x) => x.items.some((i) => i.key === categoryKey));
    if (g) setGroup(g.group);
  }, [group, categoryKey, cats.data]);

  /**
   * FIVE AT MOST, AND THE STRIP HAPPENS BEFORE THE UPLOAD.
   *
   * `mediaApi.upload` scrubs the image first — a photo taken on a phone carries
   * the coordinates it was taken at, and this hub is the one place in the
   * application where a business is ALSO publishing a deliberate pin. A shop
   * that chose not to give its location must not give it away in the EXIF of
   * its own shopfront photo.
   */
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoErr(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { setPhotoErr('Five photos is the most a listing can carry.'); return; }
    setPhotoBusy(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const urls = await Promise.all(picked.map((f) => mediaApi.upload(f)));
      setPhotos((p) => [...p, ...urls]);
      if (files.length > room) setPhotoErr(`Only the first ${room} were added — five is the most a listing can carry.`);
    } catch (e) { setPhotoErr(uploadErrorMessage(e)); }
    finally { setPhotoBusy(false); }
  };

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

  const ready = businessName.trim().length >= 2 && !!categoryKey && city.trim().length >= 2;

  /**
   * Every text field travels every time, empty ones included.
   *
   * On an edit that is the difference between clearing a starting price and
   * silently keeping it: to the PATCH handler `undefined` means "do not touch",
   * so an owner who deleted the number would watch it come straight back. An
   * empty string is a real answer and is sent as one.
   */
  const submit = () => {
    onSubmit({
      businessName: businessName.trim(),
      categoryKey,
      about: about.trim(),
      city: city.trim(),
      areas: areas.trim(),
      phone: phone.trim(),
      priceFrom: priceFrom.trim() ? Number(priceFrom.replace(/[^\d]/g, '')) : undefined,
      photoUrls: photos,
      ...(pinned ? { lat: latN, lng: lngN } : {}),
      ...(radiusKm.trim() ? { radiusKm: Number(radiusKm.replace(/[^\d]/g, '')) } : {}),
    });
  };

  if (cats.isLoading) return <Spinner label="Loading categories…" />;
  if (cats.isError) return <EmptyState title="Couldn't load the categories" hint="A business has to pick one, so the form waits for them. Try again in a moment." />;

  return (
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
        </div>

        {/* A listing with no picture is a line of text competing with a
            directory of them. One is worth more than four of the rest. */}
        <div>
          <span style={label}>Photos <span className="muted" style={{ fontWeight: 400 }}>(up to five — the first one is your cover)</span></span>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {photos.map((url, i) => (
                <div key={url} style={{ position: 'relative' }}>
                  <img src={url} alt={i === 0 ? 'Cover photo' : `Photo ${i + 1}`} width={92} height={70}
                    style={{ objectFit: 'cover', borderRadius: 10, display: 'block', border: '1px solid var(--line)' }} />
                  {i === 0 && (
                    <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', background: 'var(--ink)', color: 'var(--on-accent)', borderRadius: 5, padding: '1px 5px' }}>Cover</span>
                  )}
                  {/* The TARGET is 44px and the PAINT is 22px. A 22px button is
                      a 22px button on a desktop and a miss on a phone; the
                      transparent frame around it is what the thumb actually
                      hits, which is the same trick .btn-sm uses in relief.css. */}
                  <button type="button" aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setPhotos((p) => p.filter((x) => x !== url))}
                    style={{ position: 'absolute', top: -17, right: -17, width: 44, height: 44,
                      display: 'grid', placeItems: 'center', border: 0, background: 'none',
                      cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, border: '1px solid var(--line)', background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 12, lineHeight: 1 }}>×</span>
                  </button>
                </div>
              ))}
            </div>
          )}
          <input id="svc-photos" type="file" accept="image/*" multiple
            disabled={photoBusy || photos.length >= MAX_PHOTOS}
            onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }}
            style={{ fontSize: 13, fontFamily: 'inherit' }} />
          {photoBusy && <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Uploading…</p>}
          {photoErr && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '6px 0 0' }} role="alert">{photoErr}</p>}
          <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
            Location data is stripped from every photo before it leaves your device.
          </p>
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

        {error && <p style={{ color: 'var(--danger-ink)', fontSize: 13, margin: 0 }} role="alert">{error}</p>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="accent" disabled={!ready || pending} onClick={submit}>
            {pending ? busyLabel : submitLabel}
          </Button>
          <Button variant="line" onClick={onCancel}>Cancel</Button>
        </div>
      </Card>
  );
}
