import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Tag } from '@/components/ui';
import { Masthead } from '../components/Masthead';
import { usePostProperty, type Photo, type PostPropertyInput } from '../api';
import { PhotoCapture } from '../PhotoCapture';

type Kind = 'house' | 'office' | 'shop';
type Field = { key: string; label: string; type: 'text' | 'number' | 'select'; opts?: string[] };
interface Schema { heading: string; min: number; titleKey: string; fields: Field[] }

const SCHEMA: Record<Kind, Schema> = {
  house: {
    heading: 'Basic details — House', min: 3, titleKey: 'society',
    fields: [
      { key: 'ptype', label: 'Property type', type: 'select', opts: ['Apartment', 'Villa', 'Independent House', 'Builder Floor', 'Plot'] },
      { key: 'society', label: 'Society / Building', type: 'text' },
      { key: 'config', label: 'Configuration', type: 'select', opts: ['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '4+ BHK'] },
      { key: 'bath', label: 'Bathrooms', type: 'select', opts: ['1', '2', '3', '4+'] },
      { key: 'parking', label: 'Parking', type: 'select', opts: ['None', '1 Open', '1 Covered', '2 Covered'] },
      { key: 'furnish', label: 'Furnishing', type: 'select', opts: ['Unfurnished', 'Semi Furnished', 'Fully Furnished'] },
      { key: 'carpet', label: 'Carpet area (sq.ft)', type: 'number' },
      { key: 'floor', label: 'Floor (e.g. 5 of 12)', type: 'text' },
      { key: 'facing', label: 'Facing', type: 'select', opts: ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'] },
      { key: 'age', label: 'Age of property', type: 'select', opts: ['Under construction', 'New', '1-5 yrs', '5-10 yrs', '10+ yrs'] },
    ],
  },
  office: {
    heading: 'Basic details — Office', min: 3, titleKey: 'park',
    fields: [
      { key: 'otype', label: 'Office type', type: 'select', opts: ['Bare shell', 'Warm shell', 'Fully furnished', 'Co-working seats'] },
      { key: 'park', label: 'Business park / Building', type: 'text' },
      { key: 'carpet', label: 'Carpet area (sq.ft)', type: 'number' },
      { key: 'seats', label: 'Seats / Workstations', type: 'number' },
      { key: 'cabins', label: 'Cabins', type: 'number' },
      { key: 'meet', label: 'Meeting rooms', type: 'number' },
      { key: 'wash', label: 'Washrooms', type: 'select', opts: ['Shared', '1', '2', '3+'] },
      { key: 'pantry', label: 'Pantry', type: 'select', opts: ['Yes', 'No'] },
      { key: 'floor', label: 'Floor', type: 'text' },
      { key: 'power', label: 'Power backup', type: 'select', opts: ['Full DG backup', 'Partial', 'None'] },
    ],
  },
  shop: {
    heading: 'Basic details — Shop / Retail', min: 3, titleKey: 'market',
    fields: [
      { key: 'stype', label: 'Shop type', type: 'select', opts: ['High-street shop', 'Mall unit', 'Showroom', 'Kiosk', 'Warehouse'] },
      { key: 'market', label: 'Market / Building', type: 'text' },
      { key: 'carpet', label: 'Carpet area (sq.ft)', type: 'number' },
      { key: 'frontage', label: 'Frontage (ft)', type: 'number' },
      { key: 'floor', label: 'Floor', type: 'select', opts: ['Basement', 'Ground', 'Upper', 'Mezzanine'] },
      { key: 'wash', label: 'Washroom', type: 'select', opts: ['Yes', 'No'] },
      { key: 'parking', label: 'Parking', type: 'select', opts: ['None', 'Street', 'Dedicated'] },
      { key: 'footfall', label: 'Location grade', type: 'select', opts: ['Prime high-street', 'Neighbourhood', 'Mall', 'Industrial'] },
      { key: 'power', label: 'Power load (kW)', type: 'number' },
    ],
  },
};

const STEPS = ['Property details', 'Live photos', 'Pricing', 'Add property'];

/**
 * WHERE THE PROPERTY IS, ASKED ONCE.
 *
 * This form never asked. Every listing published through it went to the API as
 * `city: 'Pune'` with the BUILDING NAME as the locality — so a flat in Indore
 * was filed in Pune, and "search by locality" searched a list of society names.
 * Explore filters on city, which means a seller anywhere else published into a
 * city their buyers were not looking at.
 *
 * It belongs outside `SCHEMA` because it is the same question for a house, an
 * office and a shop, and a field duplicated into three schemas is a field that
 * gets fixed in two of them.
 */
const PLACE: Field[] = [
  { key: 'city', label: 'City', type: 'text' },
  { key: 'locality', label: 'Locality / Area', type: 'text' },
];
const KIND_LABEL: Record<Kind, string> = { house: 'Houses', office: 'Offices', shop: 'Shops' };

interface Listing { id: string; kind: Kind; fields: Record<string, string>; desc: string; asking: string; perSqft: string; photos: Photo[] }

const inputS = { width: '100%', border: '1px solid var(--line)', borderRadius: 'var(--r-1)', padding: '12px 14px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' } as const;
const digits = (s: string) => Number(String(s).replace(/[^\d]/g, '')) || 0;

// The form speaks in labels ("Semi Furnished", "North-East"); the API speaks
// in enum keys ("semi", "north-east"). Sending the label 400'd the whole POST
// — silently, so the listing never existed, My Listings stayed empty, and the
// seller was told "Submitted for review". Same family as the Pune constant:
// values the seller chose, translated wrongly on the way out.
const FURNISH_API: Record<string, 'unfurnished' | 'semi' | 'furnished'> = {
  'Unfurnished': 'unfurnished', 'Semi Furnished': 'semi', 'Fully Furnished': 'furnished',
};
const facingApi = (s?: string) => (s ? s.toLowerCase() : undefined);
// "5 of 12" is a floor and a total, not the number 512 (which the API rejects
// outright — floors max out at 200).
const floorNums = (s?: string) => (s?.match(/\d+/g) ?? []).map(Number).filter((n) => n <= 200);

/** List Your Property — schema-driven multi-property seller flow with live photos; publishes to the real listings API. */
export function Sell() {
  const post = usePostProperty();
  const [kind, setKind] = useState<Kind>('house');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [desc, setDesc] = useState('');
  const [asking, setAsking] = useState('');
  const [perSqft, setPerSqft] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [list, setList] = useState<Listing[]>([]);
  const [note, setNote] = useState('');
  const [warn, setWarn] = useState('');

  const schema = SCHEMA[kind];
  const resetDraft = () => { setFields({}); setDesc(''); setAsking(''); setPerSqft(''); setPhotos([]); };

  const switchKind = (k: Kind) => {
    if (k === kind) return;
    if (photos.length || Object.keys(fields).length) {
      if (!window.confirm(`Switch to ${KIND_LABEL[k]}? Your current unsaved form will reset.`)) return;
    }
    resetDraft(); setKind(k); setWarn('');
  };

  const setField = (key: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const titleOk = !!fields[schema.titleKey]?.trim();
  const areaOk = !!fields.carpet?.trim();
  // A listing with no city cannot be found by anybody, so it is not a listing.
  const cityOk = !!fields.city?.trim();
  // Homes (except plots) must carry a BHK configuration — the backend rejects bedroom-less
  // apartment/villa listings, and a rejected listing never reaches Explore.
  const bhkOk = kind !== 'house' || fields.ptype === 'Plot' || !!fields.config?.trim();
  const photoOk = true; // photos are optional for now (product decision 2026-07-27)
  const priceOk = !!asking.trim();
  const currentStep = !titleOk || !areaOk || !cityOk ? 0 : !photoOk ? 1 : !priceOk ? 2 : 3;

  const addProperty = () => {
    if (!titleOk) { setWarn('Add the name / building first'); return; }
    if (!cityOk) { setWarn('Add the city — buyers search by it'); return; }
    if (!bhkOk) { setWarn('Select the configuration (BHK) first'); return; }
    if (!priceOk) { setWarn('Add an asking price'); return; }
    setWarn('');
    setList((a) => [...a, { id: 're' + Date.now(), kind, fields: { ...fields }, desc, asking, perSqft, photos: [...photos] }]);
    resetDraft();
  };

  const toInput = (l: Listing): PostPropertyInput => {
    const f = l.fields;
    const pt = l.kind === 'house'
      ? (f.ptype === 'Villa' ? 'villa' : f.ptype === 'Plot' ? 'plot' : 'apartment')
      : 'commercial';
    return {
      listingType: 'sale', propertyType: pt, status: 'ready',
      title: f[SCHEMA[l.kind].titleKey] || KIND_LABEL[l.kind],
      // The seller's own city and area. The API requires both non-empty, and
      // the locality falls back to the city rather than to the building name —
      // a society is not an area, and filing it as one made locality search
      // meaningless.
      city: f.city?.trim() || '', locality: f.locality?.trim() || f.city?.trim() || '',
      priceInr: digits(l.asking), areaSqft: digits(f.carpet),
      bedrooms: l.kind === 'house' ? digits(f.config) : 0, bathrooms: l.kind === 'house' ? digits(f.bath) : 0,
      furnishing: FURNISH_API[f.furnish], floor: floorNums(f.floor)[0], totalFloors: floorNums(f.floor)[1], facing: facingApi(f.facing),
      amenities: [], description: l.desc.trim() || undefined, photos: l.photos,
    };
  };

  const errText = (e: unknown) => {
    const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    return Array.isArray(m) ? m.join(' · ') : m;
  };

  const publishAll = async () => {
    if (!list.length) { setWarn('Add a property first'); return; }
    // Every failure used to become a silent `null`: the note then said
    // "Submitted for review — ." and setList([]) threw away everything typed.
    // A listing that never reached the server is not "submitted" — it stays on
    // the list, and the server's actual reason is read out.
    const outcomes: { l: Listing; r: Awaited<ReturnType<typeof post.mutateAsync>> | null; err?: string }[] = [];
    for (const l of list) {
      try { outcomes.push({ l, r: await post.mutateAsync(toInput(l)) }); }
      catch (e) { outcomes.push({ l, r: null, err: errText(e) }); }
    }
    const approved = outcomes.filter((x) => x.r?.moderation === 'approved').length;
    const review = outcomes.filter((x) => x.r?.moderation === 'review').length;
    const rejected = outcomes.filter((x) => x.r?.moderation === 'rejected');
    const failed = outcomes.filter((x) => !x.r);
    // The server accepted the rest (whatever moderation said) — they live in
    // My Listings now, so they leave the draft list.
    setList(failed.map((x) => x.l));
    if (failed.length === outcomes.length) {
      setNote(`Couldn’t submit${failed[0].err ? ` — ${failed[0].err}` : ' — that didn’t reach us'}. Your ${failed.length === 1 ? 'property is' : 'properties are'} still listed below; nothing you’ve typed has been lost.`);
      return;
    }
    const parts: string[] = [];
    if (approved) parts.push(`${approved} live in Explore now`);
    if (review) parts.push(`${review} in manual review`);
    if (rejected.length) parts.push(`${rejected.length} not published`);
    const rej = rejected.length
      ? ` Rejected: ${rejected.map((x) => x.r?.moderationResult?.reasons?.join(' ')).filter(Boolean).join(' | ')} — edit & resubmit from My Listings.`
      : '';
    const fail = failed.length
      ? ` ${failed.length} didn’t reach us${failed[0].err ? ` (${failed[0].err})` : ''} — still in your list below, try again.`
      : '';
    setNote(`Submitted for review — ${parts.join(' · ')}.${rej}${fail} Every listing passes an automated safety & quality check before going live. Track status in My Listings.`);
  };

  const summaryOf = (l: Listing) => {
    const f = l.fields;
    if (l.kind === 'house') return [f.ptype, f.config, f.carpet && `${f.carpet} sq.ft`, f.furnish].filter(Boolean).join(' · ');
    if (l.kind === 'office') return [f.otype, f.carpet && `${f.carpet} sq.ft`, f.seats && `${f.seats} seats`].filter(Boolean).join(' · ');
    return [f.stype, f.carpet && `${f.carpet} sq.ft`, f.frontage && `${f.frontage}ft front`].filter(Boolean).join(' · ');
  };

  const checklist = useMemo(() => ([
    { ok: cityOk, txt: 'City' },
    { ok: titleOk, txt: 'Name / building' },
    ...(kind === 'house' ? [{ ok: bhkOk, txt: 'Configuration (BHK)' }] : []),
    { ok: areaOk, txt: 'Carpet area' },
    { ok: photos.length > 0, txt: photos.length > 0 ? `${photos.length} live photo${photos.length === 1 ? '' : 's'}` : 'Live photos (optional)' },
    { ok: priceOk, txt: 'Asking price' },
  ]), [cityOk, titleOk, bhkOk, kind, areaOk, photoOk, priceOk, photos.length, schema.min]);

  return (
    <div>
      {/* THE MASTHEAD, AND NOTHING ELSE FROM THE REFERENCE.
          Emptiness is the reference's argument and it is the wrong argument
          for a form: the whole job here is to fill in eleven fields, and a
          page that leaves its middle blank to make a point is a page that
          makes you scroll to work. So this takes the masthead and the small
          tracked scale, and the stepper below is untouched.

          The property-type tabs move into the masthead's nav column, which is
          where every other page in this hub now keeps its switches. */}
      <Masthead mark={['List a Property']} title="Houses, offices and shops"
        nav={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({
          label: KIND_LABEL[k], onSelect: () => switchKind(k), on: kind === k,
        }))}>
        Capture live photos, add accurate details, and list as many properties
        as you like. Everything you post is checked before it appears in
        Explore, and you can see exactly why in My Listings.
      </Masthead>

      <div id="sell" />

      <div className="stepper" id="sell">
        {STEPS.map((s, i) => (
          <div key={s} className={`step${i === currentStep ? ' on' : ''}`}><span className="dot">{i + 1}</span>{s}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 28, alignItems: 'start' }}>
        <section>
          <div className="card" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>📸</span>
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              <b>Authentic photos only.</b> Pictures should be taken <b>live through your camera</b> so every buyer can trust the listing.
            </div>
          </div>

          <h3 style={{ marginBottom: 16 }}>{schema.heading}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {[...PLACE, ...schema.fields].map((f) => (
              <div key={f.key} style={{ marginBottom: 16 }}>
                <label style={labelS}>{f.label}</label>
                {f.type === 'select'
                  ? (
                    <select aria-label={f.label} value={fields[f.key] ?? ''} onChange={setField(f.key)} style={inputS}>
                      <option value="">Select…</option>
                      {f.opts?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )
                  : <input aria-label={f.label} type={f.type === 'number' ? 'number' : 'text'} value={fields[f.key] ?? ''} onChange={setField(f.key)} style={inputS} />}
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelS}>Description</label>
            <textarea aria-label="Description" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Highlight light, layout, connectivity and anything special." style={inputS} />
          </div>

          <div className="rule" />

          <h3 style={{ marginBottom: 6 }}>Capture live photos</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Photos are optional for now — listings with photos get far more interest.</p>
          <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
            <PhotoCapture photos={photos} onChange={setPhotos} />
          </div>

          <div className="rule" />

          <h3 style={{ marginBottom: 16 }}>Pricing</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelS}>Asking price (₹)</label>
              <input inputMode="numeric" value={asking} onChange={(e) => setAsking(e.target.value)} placeholder="e.g. 95,00,000" style={inputS} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelS}>Price per sq.ft (₹)</label>
              <input inputMode="numeric" value={perSqft} onChange={(e) => setPerSqft(e.target.value)} placeholder="auto / e.g. 9,047" style={inputS} />
            </div>
          </div>

          <div className="rule" />

          <h3 style={{ marginBottom: 12 }}>Add this property</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Add it to your submission list, then capture the next one.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <Button variant="gold" onClick={addProperty}>＋ Add property to list</Button>
            <Button variant="line" onClick={resetDraft}>Reset form</Button>
          </div>
          {warn && <p style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600 }}>{warn}</p>}

          {list.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 6 }}>Your properties ({list.length})</h3>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Review your listings, then publish them all together.</p>
              {list.map((l) => (
                <div key={l.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
                  {l.photos[0]?.url
                    ? <img className="thumb" src={l.photos[0].url} alt="" style={{ width: 74, height: 56, borderRadius: 9, objectFit: 'cover', flex: '0 0 auto', background: 'var(--ink-soft)' }} />
                    : <div style={{ width: 74, height: 56, borderRadius: 9, flex: '0 0 auto', background: 'var(--line)', display: 'grid', placeItems: 'center', fontSize: 17 }}>🏠</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', padding: '2px 8px', borderRadius: 'var(--r-full)', background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>{l.kind}</span>
                      <b style={{ fontSize: 14 }}>{l.fields[SCHEMA[l.kind].titleKey] || KIND_LABEL[l.kind]}</b>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{summaryOf(l)}</div>
                    <div style={{ fontSize: 12, marginTop: 3 }}>₹{l.asking || '—'}{l.photos.length > 0 && <span style={{ color: 'var(--ok-ink)' }}> · {l.photos.length} live photo{l.photos.length === 1 ? '' : 's'} ✓</span>}</div>
                  </div>
                  <Button variant="line" size="sm" onClick={() => setList((a) => a.filter((x) => x.id !== l.id))}>Remove</Button>
                </div>
              ))}
              <Button variant="gold" disabled={post.isPending} onClick={() => void publishAll()} style={{ marginTop: 6 }}>{post.isPending ? 'Publishing…' : 'Publish all →'}</Button>
            </div>
          )}

          {note && (
            <div className="note" style={{ marginTop: 16 }}>
              {note} {note.startsWith('✓') && <Link to="/realestate/mine" style={{ fontWeight: 700, textDecoration: 'underline', color: 'inherit' }}>See My Listings →</Link>}
            </div>
          )}

          <p className="muted" style={{ fontSize: 12, marginTop: 20 }}>◈ Safe &amp; Secure Listings — your contact details stay private until you approve an enquiry.</p>
        </section>

        <aside style={{ position: 'sticky', top: 'calc(var(--header-h) + 20px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <h4 style={{ marginBottom: 10 }}>Listing checklist</h4>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              {checklist.map((c) => (
                <div key={c.txt} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: c.ok ? 'var(--ok-ink)' : 'var(--muted)' }}>{c.ok ? '✓' : '○'}</span>
                  <span style={{ color: c.ok ? 'var(--ink)' : 'var(--muted)' }}>{c.txt}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="eyebrow">Before it goes live</div>
            {/* This list used to begin with "photos", and post() says in as many words
                that photos are optional and enforced by nothing. The other two were
                real, which is what made the third easy to miss. Named here as what
                moderate() actually runs: required fields, an AI read of the text, a
                duplicate check against this seller's other listings, and price
                against the peer median per sq ft. */}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Every listing is checked automatically before it goes live — the required details, the description, whether it duplicates one of your others, and how the price compares with similar homes nearby. You'll see the outcome the moment you submit. Photos aren't checked yet, so nothing here depends on them.</p>
          </div>
        </aside>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0 0' }}>
        <Tag tone="green">✓ Verified Properties</Tag>
        <Tag tone="green">✓ Live-photo Authenticity</Tag>
        <Tag>✓ Automated review & moderation</Tag>
        <Tag>✓ Safe &amp; Secure</Tag>
      </div>
    </div>
  );
}

const labelS = { display: 'block', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 6 } as const;
