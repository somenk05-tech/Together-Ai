import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Hero, Tag } from '@/components/ui';
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
const KIND_LABEL: Record<Kind, string> = { house: 'Houses', office: 'Offices', shop: 'Shops' };

interface Listing { id: string; kind: Kind; fields: Record<string, string>; desc: string; asking: string; perSqft: string; photos: Photo[] }

const inputS = { width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' } as const;
const digits = (s: string) => Number(String(s).replace(/[^\d]/g, '')) || 0;

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
  // Homes (except plots) must carry a BHK configuration — the backend rejects bedroom-less
  // apartment/villa listings, and a rejected listing never reaches Explore.
  const bhkOk = kind !== 'house' || fields.ptype === 'Plot' || !!fields.config?.trim();
  const photoOk = true; // photos are optional for now (product decision 2026-07-27)
  const priceOk = !!asking.trim();
  const currentStep = !titleOk || !areaOk ? 0 : !photoOk ? 1 : !priceOk ? 2 : 3;

  const addProperty = () => {
    if (!titleOk) { setWarn('Add the name / building first'); return; }
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
      title: f[SCHEMA[l.kind].titleKey] || KIND_LABEL[l.kind], city: 'Pune', locality: f[SCHEMA[l.kind].titleKey] || 'Pune',
      priceInr: digits(l.asking), areaSqft: digits(f.carpet),
      bedrooms: l.kind === 'house' ? digits(f.config) : 0, bathrooms: l.kind === 'house' ? digits(f.bath) : 0,
      furnishing: f.furnish, floor: f.floor ? digits(f.floor) : undefined, facing: f.facing,
      amenities: [], description: l.desc.trim() || undefined, photos: l.photos,
    };
  };

  const publishAll = async () => {
    if (!list.length) { setWarn('Add a property first'); return; }
    try {
      const results = [];
      for (const l of list) { try { results.push(await post.mutateAsync(toInput(l))); } catch { results.push(null); } }
      const approved = results.filter((r) => r?.moderation === 'approved').length;
      const review = results.filter((r) => r?.moderation === 'review').length;
      const rejected = results.filter((r) => r?.moderation === 'rejected');
      setList([]);
      const parts: string[] = [];
      if (approved) parts.push(`${approved} live in Explore now`);
      if (review) parts.push(`${review} in manual review`);
      if (rejected.length) parts.push(`${rejected.length} not published`);
      const rej = rejected.length
        ? ` Rejected: ${rejected.map((r) => r?.moderationResult?.reasons?.join(' ')).filter(Boolean).join(' | ')} — edit & resubmit from My Listings.`
        : '';
      setNote(`Submitted for review — ${parts.join(' · ')}.${rej} Every listing passes an automated safety & quality check before going live. Track status in My Listings.`);
    } catch {
      setNote('Couldn’t submit — start the backend and try again.');
    }
  };

  const summaryOf = (l: Listing) => {
    const f = l.fields;
    if (l.kind === 'house') return [f.ptype, f.config, f.carpet && `${f.carpet} sq.ft`, f.furnish].filter(Boolean).join(' · ');
    if (l.kind === 'office') return [f.otype, f.carpet && `${f.carpet} sq.ft`, f.seats && `${f.seats} seats`].filter(Boolean).join(' · ');
    return [f.stype, f.carpet && `${f.carpet} sq.ft`, f.frontage && `${f.frontage}ft front`].filter(Boolean).join(' · ');
  };

  const checklist = useMemo(() => ([
    { ok: titleOk, txt: 'Name / building' },
    ...(kind === 'house' ? [{ ok: bhkOk, txt: 'Configuration (BHK)' }] : []),
    { ok: areaOk, txt: 'Carpet area' },
    { ok: photos.length > 0, txt: photos.length > 0 ? `${photos.length} live photo${photos.length === 1 ? '' : 's'}` : 'Live photos (optional)' },
    { ok: priceOk, txt: 'Asking price' },
  ]), [titleOk, bhkOk, kind, areaOk, photoOk, priceOk, photos.length, schema.min]);

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px 40px' }}>
      <Hero image="/assets/img/realestate-2.webp" eyebrow="Real Estate · 02" title="List Your Property"
        sub="Houses, offices and shops — capture live photos, add accurate details, and list as many properties as you like." />

      <div className="tabrow" style={{ marginBottom: 8 }}>
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <a key={k} href="#sell" className={kind === k ? 'on' : undefined}
            onClick={(e) => { e.preventDefault(); switchKind(k); }}>{KIND_LABEL[k]}</a>
        ))}
      </div>

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
            {schema.fields.map((f) => (
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
          {warn && <p style={{ fontSize: 12.5, color: '#c62828', fontWeight: 600 }}>{warn}</p>}

          {list.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 6 }}>Your properties ({list.length})</h3>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Review your listings, then publish them all together.</p>
              {list.map((l) => (
                <div key={l.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
                  {l.photos[0]?.url
                    ? <img className="thumb" src={l.photos[0].url} alt="" style={{ width: 74, height: 56, borderRadius: 9, objectFit: 'cover', flex: '0 0 auto', background: '#222' }} />
                    : <div style={{ width: 74, height: 56, borderRadius: 9, flex: '0 0 auto', background: 'var(--line)', display: 'grid', placeItems: 'center', fontSize: 18 }}>🏠</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', padding: '2px 8px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)' }}>{l.kind}</span>
                      <b style={{ fontSize: 14 }}>{l.fields[SCHEMA[l.kind].titleKey] || KIND_LABEL[l.kind]}</b>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{summaryOf(l)}</div>
                    <div style={{ fontSize: 12, marginTop: 3 }}>₹{l.asking || '—'}{l.photos.length > 0 && <span style={{ color: '#2e9e57' }}> · {l.photos.length} live photo{l.photos.length === 1 ? '' : 's'} ✓</span>}</div>
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
                  <span style={{ color: c.ok ? '#2e9e57' : 'var(--muted)' }}>{c.ok ? '✓' : '○'}</span>
                  <span style={{ color: c.ok ? 'var(--ink)' : 'var(--muted)' }}>{c.txt}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="eyebrow">Before it goes live</div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Every listing is checked automatically — photos, pricing sanity and description — and goes live once it clears review. You'll see the outcome the moment you submit.</p>
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
