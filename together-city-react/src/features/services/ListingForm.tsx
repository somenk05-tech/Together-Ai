import { useEffect, useState } from 'react';
import { Card, Button, Spinner, EmptyState , Switch} from '@/components/ui';
import { LocationPicker, type LocationValue } from '@/components/LocationPicker';
import { splitPlace } from '@/features/profile/placeParts';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { findCityIn, servicesApi, useServiceCategories, useBusinessTypes, usePlaces } from './api';
import { DynamicFields } from './DynamicFields';

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
  slug: string;
  businessType: string;
  details: Record<string, unknown>;
  categoryKey: string;
  about: string;
  city: string;
  areas: string;
  /** The exact door — building name and road name. Empty is a real answer. */
  building: string;
  street: string;
  phone: string;
  phonePublic: boolean;
  priceFrom?: number;
  photoUrls: string[];
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

/** What it starts from — the shape a listing comes back in. */
export interface ListingDraft {
  businessName?: string;
  slug?: string | null;
  businessType?: string | null;
  /** The raw answers, keyed as the schema declared them. */
  detailValues?: Record<string, unknown>;
  categoryKey?: string;
  about?: string | null;
  city?: string;
  areas?: string[];
  building?: string | null;
  street?: string | null;
  phone?: string | null;
  phonePublic?: boolean;
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
  const types = useBusinessTypes();

  const [businessName, setName] = useState(str(initial?.businessName));
  const [slug, setSlug] = useState(str(initial?.slug));
  const [slugCheck, setSlugCheck] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [group, setGroup] = useState('');
  const [businessType, setBusinessType] = useState(str(initial?.businessType));
  const [details, setDetails] = useState<Record<string, unknown>>(initial?.detailValues ?? {});
  const [categoryKey, setCategory] = useState(str(initial?.categoryKey));
  const [about, setAbout] = useState(str(initial?.about));
  const [city, setCity] = useState(str(initial?.city));
  const [areas, setAreas] = useState((initial?.areas ?? []).join(', '));
  /* The pickers' own state. `city` above stays the stored truth; this is only
     which drawers are open. Derived once from the saved city when the tree
     arrives (an alias or a geocoder district lands on its canonical city). */
  const places = usePlaces();
  const [pick, setPick] = useState<{ country: string; state: string; city: string }>({ country: 'India', state: '', city: '' });
  const [pickDerived, setPickDerived] = useState(false);
  const countries = places.data?.countries ?? [];
  useEffect(() => {
    if (pickDerived || countries.length === 0) return;
    setPickDerived(true);
    const hit = findCityIn(countries, city);
    if (hit) {
      setPick({ country: hit.country, state: hit.state, city: hit.city.name });
      if (city.trim() && city.trim() !== hit.city.name) setCity(hit.city.name);
    } else if (city.trim()) {
      // A saved city the tree has never heard of: keep the typed box open,
      // but the country stays India — that is not a question any more.
      setPick({ country: 'India', state: '', city: '__other' });
    }
  }, [pickDerived, countries, city]);
  const statesOf = countries.find((c) => c.name === pick.country)?.states ?? [];
  const citiesOf = statesOf.find((st) => st.name === pick.state)?.cities ?? [];
  const typedPlace = pick.city === '__other';
  const knownCity = findCityIn(countries, city);
  const areaParts = areas.split(',').map((a) => a.trim()).filter(Boolean);
  const areaList = areaParts.map((a) => a.toLowerCase());
  const toggleArea = (name: string) => {
    const parts = areas.split(',').map((a) => a.trim()).filter(Boolean);
    const next = parts.some((a) => a.toLowerCase() === name.toLowerCase())
      ? parts.filter((a) => a.toLowerCase() !== name.toLowerCase())
      : [...parts, name];
    setAreas(next.join(', '));
  };
  const [building, setBuilding] = useState(str(initial?.building));
  const [street, setStreet] = useState(str(initial?.street));
  const [phone, setPhone] = useState(str(initial?.phone));
  const [phonePublic, setPhonePublic] = useState(initial?.phonePublic ?? false);
  const [priceFrom, setPrice] = useState(str(initial?.priceFrom));
  const [lat, setLat] = useState(str(initial?.lat));
  const [lng, setLng] = useState(str(initial?.lng));
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [radiusKm, setRadius] = useState(str(initial?.radiusKm));
  const [photos, setPhotos] = useState<string[]>((initial?.photos ?? []).map((p) => p.url));
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  /**
   * ASK AS THEY TYPE, BUT ONLY ONCE THEY HAVE STOPPED.
   *
   * A web address is the one field where finding out at save time is too late:
   * the owner has already told somebody the name. So the answer arrives while
   * they are still deciding — 400ms after the last keystroke, and never for an
   * address that is already theirs.
   */
  useEffect(() => {
    const v = slug.trim();
    if (!v || v === (initial?.slug ?? '')) { setSlugCheck(null); return; }
    let live = true;
    const t = setTimeout(() => {
      servicesApi.slugAvailable(v)
        .then((r) => { if (live) setSlugCheck({ available: r.available, reason: r.reason }); })
        // Silence beats a red line the citizen cannot act on: the address is
        // checked again on save, by the server, which is the one that decides.
        .catch(() => { if (live) setSlugCheck(null); });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [slug, initial?.slug]);

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

  // locateMe and its two pieces of state moved into LocationPicker. The
  // permission prompt, the accuracy and the refusal message belong with the
  // control that asks for them, not with the form around it.
  const latN = Number(lat), lngN = Number(lng);
  const pinned = lat !== '' && lng !== '' && Number.isFinite(latN) && Number.isFinite(lngN)
    && latN >= -90 && latN <= 90 && lngN >= -180 && lngN <= 180;

  /**
   * The types offered for the group they picked, and the one they chose.
   *
   * Derived, never stored on this screen: the schema is the server's, and a
   * copy of it here is a copy that goes stale the day a trade is added.
   */
  const offeredTypes = (types.data?.types ?? []).filter((t) => t.group === group || t.key === 'general');
  const chosenType = (types.data?.types ?? []).find((t) => t.key === businessType) ?? null;

  /** A live preview of what the address will be if they leave it blank. */
  const normalisedName = businessName.trim().toLowerCase()
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

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
      slug: slug.trim(),
      businessType,
      details,
      categoryKey,
      about: about.trim(),
      city: city.trim(),
      areas: areas.trim(),
      building: building.trim(),
      street: street.trim(),
      phone: phone.trim(),
      // A number with nowhere to be shown cannot be public. Otherwise an owner
      // who clears the field leaves a tick behind that publishes nothing and
      // will publish the next number they type without being asked again.
      phonePublic: phone.trim() ? phonePublic : false,
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
            /* NO INVENTED COMPANY IN THE FIELD (owner, 24 Aug). "Sharma
               Plumbing" was a placeholder, but a plausible proper name in a
               form reads as somebody's data already in it — the same failure
               class as the jobs CV printing its specimen letterhead. A
               placeholder may say what KIND of thing goes here; it may not
               look like the thing itself. */
            placeholder="Your business name" maxLength={90} />
        </div>

        {/*
          THE ADDRESS THEY WILL PRINT ON A CARD.

          togethercity.app/services/sharma-plumbing reads like a shop's own
          site; the same page addressed by its id reads like a database row the
          citizen was not meant to see. It is shown as a whole URL rather than a
          bare field, because what the owner is choosing is the thing they will
          say down a phone and paint on a shutter.

          Left blank on a new listing, one is derived from the business name.
          Nobody's first link should be a UUID.
        */}
        <div>
          <label htmlFor="svc-slug" style={label}>
            Your web address <span className="muted" style={{ fontWeight: 400 }}>(people can type this straight in)</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>togethercity.app/services/</span>
            <input id="svc-slug" style={{ ...field, width: 'auto', flex: '1 1 180px', minWidth: 0 }}
              value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder={normalisedName || 'your-business-name'} maxLength={40}
              autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          </div>
          {slugCheck && (
            <p style={{ fontSize: 12.5, margin: '6px 0 0',
              color: slugCheck.available ? 'var(--ok-ink)' : 'var(--danger-ink)' }}
              role={slugCheck.available ? undefined : 'alert'}>
              {slugCheck.available ? 'That address is free.' : slugCheck.reason}
            </p>
          )}
          {!slug.trim() && (
            <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
              Leave it blank and we will make one from your business name. You can change it later
              — but anyone who has your old address will stop finding you, so change it early.
            </p>
          )}
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

        {/*
          THE QUESTION THAT CHANGES THE REST OF THE FORM.

          A category says where a business is filed. A TYPE says what it
          actually does, and that is what decides which questions are worth
          asking — a restaurant is asked about cuisines and covers, a plumber
          about emergencies and call-out charges, and neither ever sees the
          other's fields. Everything below this select is generated.
        */}
        {group && (
          <div>
            <label htmlFor="svc-type" style={label}>What sort of business is it</label>
            <select id="svc-type" style={field} value={businessType}
              onChange={(e) => {
                setBusinessType(e.target.value);
                // The answers do not survive a change of type. Keeping them
                // would leave a salon quietly holding a restaurant's cuisines,
                // invisible until somebody switched back.
                setDetails({});
              }}>
              <option value="">Choose…</option>
              {offeredTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {chosenType && (
              <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>{chosenType.blurb}</p>
            )}
          </div>
        )}

        <DynamicFields type={chosenType} values={details} onChange={setDetails} />

        {/* ── WHERE, AS DROPDOWNS — AND THE COUNTRY IS INDIA (owner, 24 Aug:
            "lock india"). The country select stays visible but answers itself;
            every state and union territory is in the tree, so the state drawer
            needs no typed hatch any more. Only the CITY keeps its "Somewhere
            else…" escape, because a town the tree has never heard of must stay
            listable the minute its owner arrives. What is STORED is unchanged:
            `city` and the csv of areas, exactly as before. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <div>
            <label htmlFor="svc-country" style={label}>Country</label>
            <select id="svc-country" style={field} value="India" disabled aria-readonly="true">
              <option value="India">India</option>
            </select>
          </div>
          <div>
            <label htmlFor="svc-state" style={label}>State</label>
            <select id="svc-state" style={field} value={pick.state}
              onChange={(e) => setPick((v) => ({ ...v, state: e.target.value, city: '' }))}>
              <option value="">Choose…</option>
              {statesOf.map((st) => <option key={st.name} value={st.name}>{st.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="svc-city" style={label}>City</label>
            {typedPlace ? (
              <input id="svc-city" style={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city" maxLength={60} />
            ) : (
              <select id="svc-city" style={field} value={pick.city}
                onChange={(e) => {
                  const v = e.target.value;
                  setPick((p) => ({ ...p, city: v }));
                  setCity(v === '__other' || v === '' ? '' : v);
                }}>
                <option value="">Choose…</option>
                {citiesOf.map((ct) => <option key={ct.name} value={ct.name}>{ct.name}</option>)}
                <option value="__other">Somewhere else…</option>
              </select>
            )}
          </div>
        </div>

        {/* ── THE EXACT DOOR (owner, 24 Aug: "make sure we get the exact
            address — road name and building name"). The pin answers "how
            far"; these answer "which shutter". Both optional — a travelling
            trade has no shutter — and public like the pin when given. */}
        <div className="mpaper-addr">
          <div>
            <label htmlFor="svc-building" style={label}>Building name</label>
            <input id="svc-building" style={field} value={building} onChange={(e) => setBuilding(e.target.value)}
              placeholder="Shop 4, Sea View House" maxLength={90} />
          </div>
          <div>
            <label htmlFor="svc-street" style={label}>Road / street</label>
            <input id="svc-street" style={field} value={street} onChange={(e) => setStreet(e.target.value)}
              placeholder="Juhu Tara Road" maxLength={120} />
          </div>
        </div>

        {/* ── AREAS AS A DROPDOWN (owner, 24 Aug: "add a detailed drop down
            menu for all areas"). Thirty-four Mumbai chips was a wall, not a
            choice; the drawer lists only what is not yet picked, each pick
            becomes a removable chip, and the typed box stays for the locality
            no list ever has. */}
        <div className="svo-gap6">
          <label htmlFor="svc-area-add" style={label}>Areas you cover</label>
          {knownCity && (
            <select id="svc-area-add" style={field} value=""
              onChange={(e) => { if (e.target.value) toggleArea(e.target.value); }}>
              <option value="">Add an area…</option>
              {knownCity.city.areas
                .filter((a) => !areaList.includes(a.toLowerCase()))
                .map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {areaParts.length > 0 && (
            <div className="svo-row is-chips">
              {areaParts.map((a) => (
                <Button key={a.toLowerCase()} type="button" variant="accent" size="sm"
                  aria-label={`Remove ${a}`} onClick={() => toggleArea(a)}>
                  {a} ✕
                </Button>
              ))}
            </div>
          )}
          <input id="svc-areas" style={field} value={areas} onChange={(e) => setAreas(e.target.value)}
            aria-label="Areas you cover, comma-separated"
            placeholder={knownCity ? 'Or type your own, comma-separated' : 'Bandra, Khar, Santacruz'} maxLength={300} />
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
          <div style={{ marginTop: 8 }}>
            <LocationPicker
              value={{ lat, lng, accuracy }}
              onChange={(v: LocationValue) => { setLat(v.lat); setLng(v.lng); setAccuracy(v.accuracy); }}
              hint="Drag the pin to your door, search the address, or use your location. Optional — a listing with no pin is still found by area."
              /* ── THE PIN FILLS THE BOXES (owner, 24 Aug) ─────────────────
                 One press of "Use my location" and the city, the locality and
                 a 5 km radius land in their fields — the same answer the
                 address line under the map prints, so what the machine
                 thought is always visible. EMPTY FIELDS ONLY: a name the
                 owner already typed is their answer, not a suggestion box,
                 and nothing here overwrites it. All three stay editable. */
              onPlace={(p) => {
                const parts = splitPlace(p.label, p.short);
                const bits = p.label.split(',').map((b) => b.trim()).filter(Boolean);
                // The geocoder often answers with the district — the tree
                // knows "Mumbai Suburban District" IS Mumbai, and sets the
                // pickers to the canonical drawer.
                const hit = bits.map((b) => findCityIn(countries, b)).find(Boolean) ?? (parts.city ? findCityIn(countries, parts.city) : null);
                const canonical = hit?.city.name ?? parts.city ?? null;
                const cityAt = canonical ? bits.findIndex((b) => findCityIn(countries, b)?.city.name === canonical || b === canonical) : -1;
                // The locality is the segment just before the city in
                // Nominatim's local→global run ("…, Powai, Mumbai, …").
                const area = cityAt > 0 ? bits[cityAt - 1] : null;
                // And the segment before THAT is usually the road ("Juhu Tara
                // Road, Juhu, Mumbai, …") — offered to an empty Road box only,
                // same rule as everything else here: a name the owner typed is
                // their answer, never overwritten.
                const road = cityAt > 1 ? bits[cityAt - 2] : null;
                setCity((v) => (v.trim() ? v : canonical ?? v));
                if (hit) setPick({ country: hit.country, state: hit.state, city: hit.city.name });
                setAreas((v) => (v.trim() ? v : (area && area !== canonical ? area : v)));
                setStreet((v) => (v.trim() ? v : (road && road !== area ? road : v)));
                setRadius((v) => (v.trim() ? v : '5'));
              }}
            />
          </div>
          <div style={{ marginTop: 10, maxWidth: 220 }}>
            <label htmlFor="svc-radius" style={{ ...label, fontWeight: 500, fontSize: 12 }}>How far you travel (km)</label>
            <input id="svc-radius" style={field} value={radiusKm} onChange={(e) => setRadius(e.target.value)}
              inputMode="numeric" placeholder="5" maxLength={3} />
          </div>
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
                    style={{ objectFit: 'cover', borderRadius: 'var(--r-1)', display: 'block', border: '1px solid var(--line)' }} />
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
                    <span aria-hidden style={{ width: 22, height: 22, borderRadius: 'var(--r-full)', border: '1px solid var(--line)', background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 12, lineHeight: 1 }}>×</span>
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
            {/*
              THE ONE FIELD WHERE THE DEFAULT IS THE PROMISE.

              This number is private unless the owner says otherwise, and the
              tick is the only thing that changes that. Nothing publishes it for
              them, and clearing the field un-publishes it — otherwise a stale
              tick would publish the next number typed into an empty box.
            */}
            <div style={{ marginTop: 8 }}>
              <Switch checked={phonePublic && !!phone.trim()} disabled={!phone.trim()}
                onChange={setPhonePublic}
                label={<>
                  Show this number on my page so people can ring me
                  <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>
                    Leave it off and people reach you only through the message room, where they
                    stay anonymous and so does your number.
                  </span>
                </>} />
            </div>
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
