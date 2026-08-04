import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useProperty, useUpdateProperty, useCloseProperty, type Photo, type PostPropertyInput } from '../api';
import { PhotoCapture } from '../PhotoCapture';

/**
 * Edit Listing (audit C-4). The "Edit & resubmit" link used to open a BLANK
 * Sell form — an instruction to retype everything. This page loads what the
 * seller already said, lets them change it, and sends the whole listing back
 * through moderation: a clean edit is live again immediately.
 *
 * Close lives here too (and on My Listings): sold homes leave Explore, stay
 * in the seller's history, and edit-&-save relists them.
 */

// The form speaks in labels, the API in enum keys — same maps as Sell.tsx.
const FURNISH_LABEL: Record<string, string> = { unfurnished: 'Unfurnished', semi: 'Semi Furnished', furnished: 'Fully Furnished' };
const FURNISH_API: Record<string, string> = { 'Unfurnished': 'unfurnished', 'Semi Furnished': 'semi', 'Fully Furnished': 'furnished' };
const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];
const facingLabel = (s: string | null) => (s ? s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-') : '');
const PTYPES = [
  { key: 'apartment', label: 'Apartment' }, { key: 'villa', label: 'Villa' },
  { key: 'plot', label: 'Plot' }, { key: 'commercial', label: 'Commercial' },
];
// The listing's amenity vocabulary — mirrors AMENITIES/AMENITY_LABEL in
// realestate.constants.ts on the API. A key the API doesn't know is rejected
// by its zod enum, so this list can lag the server's but never corrupt it.
const AMENITIES: Array<{ key: string; label: string }> = [
  { key: 'lift', label: 'Lift' }, { key: 'parking', label: 'Covered parking' },
  { key: 'power-backup', label: 'Power backup' }, { key: 'security', label: '24×7 security' },
  { key: 'gym', label: 'Gym' }, { key: 'pool', label: 'Swimming pool' },
  { key: 'clubhouse', label: 'Clubhouse' }, { key: 'park', label: 'Park' },
  { key: 'gas-pipeline', label: 'Gas pipeline' }, { key: 'water-supply', label: '24×7 water' },
  { key: 'kids-play', label: "Kids' play area" }, { key: 'cctv', label: 'CCTV' },
];

const inputS = { width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' } as const;
const labelS = { display: 'block', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 6 } as const;

interface Draft {
  title: string; city: string; locality: string; propertyType: string; listingType: string;
  price: string; area: string; bedrooms: string; bathrooms: string;
  furnishing: string; facing: string; floor: string; totalFloors: string; description: string;
  reraId: string;
  // Under-construction project fields — shown only when the listing is UC.
  projectName: string; developer: string; possessionDate: string; progressPct: string;
}

export function EditListing() {
  const { id = '' } = useParams();
  const q = useProperty(id);
  const update = useUpdateProperty();
  const close = useCloseProperty();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [warn, setWarn] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  // Prefill once from the loaded listing — after that the draft is the truth.
  useEffect(() => {
    const p = q.data;
    if (!p || draft) return;
    setDraft({
      title: p.title, city: p.city, locality: p.locality, propertyType: p.propertyType, listingType: p.listingType,
      price: String(p.priceInr), area: String(p.areaSqft), bedrooms: String(p.bedrooms), bathrooms: String(p.bathrooms),
      furnishing: p.furnishing ? (FURNISH_LABEL[p.furnishing] ?? '') : '', facing: facingLabel(p.facing),
      floor: p.floor != null ? String(p.floor) : '', totalFloors: p.totalFloors != null ? String(p.totalFloors) : '',
      description: p.description ?? '',
      reraId: p.reraId ?? '',
      projectName: p.projectName ?? '', developer: p.developer ?? '',
      possessionDate: p.possessionDate ?? '', progressPct: p.progressPct != null ? String(p.progressPct) : '',
    });
    setPhotos(p.photos);
    setAmenities(p.amenities.map((a) => a.key));
  }, [q.data, draft]);

  if (q.isLoading || (q.data && !draft)) return <Spinner label="Loading your listing…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load this listing" hint="It may have been removed." />;
  const p = q.data;
  if (!p.postedByYou) return <EmptyState icon="🔒" title="Not your listing" hint="Only the seller can edit a listing." />;
  if (!draft) return <Spinner label="Loading your listing…" />;

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));
  const num = (s: string) => Number(String(s).replace(/[^\d]/g, '')) || 0;

  const toInput = (): PostPropertyInput => ({
    listingType: draft.listingType, propertyType: draft.propertyType,
    // Everything this form doesn't edit is carried through unchanged — an
    // edit must never silently blank an under-construction project's fields.
    status: p.status,
    title: draft.title.trim(), city: draft.city.trim(), locality: draft.locality.trim() || draft.city.trim(),
    priceInr: num(draft.price), areaSqft: num(draft.area),
    bedrooms: num(draft.bedrooms), bathrooms: num(draft.bathrooms),
    furnishing: FURNISH_API[draft.furnishing], facing: draft.facing ? draft.facing.toLowerCase() : undefined,
    floor: draft.floor ? Math.min(num(draft.floor), 200) : undefined,
    totalFloors: draft.totalFloors ? Math.min(num(draft.totalFloors), 200) : undefined,
    amenities, description: draft.description.trim() || undefined, photos,
    reraId: draft.reraId.trim() || undefined,
    // UC project fields are editable while the listing is under construction;
    // for a ready listing they carry through untouched.
    projectName: (p.status === 'under_construction' ? draft.projectName.trim() : p.projectName ?? '') || undefined,
    developer: (p.status === 'under_construction' ? draft.developer.trim() : p.developer ?? '') || undefined,
    possessionDate: (p.status === 'under_construction' ? draft.possessionDate.trim() : p.possessionDate ?? '') || undefined,
    progressPct: p.status === 'under_construction'
      ? (draft.progressPct !== '' ? Math.min(num(draft.progressPct), 100) : undefined)
      : (p.progressPct ?? undefined),
    floorPlans: p.floorPlans.length ? p.floorPlans : undefined, milestones: p.milestones.length ? p.milestones : undefined,
  });

  const save = () => {
    if (!draft.title.trim()) { setWarn('Add the name / building'); return; }
    if (!draft.city.trim()) { setWarn('Add the city — buyers search by it'); return; }
    if (!num(draft.price)) { setWarn('Add an asking price'); return; }
    if (!num(draft.area)) { setWarn('Add the carpet area'); return; }
    if ((draft.propertyType === 'apartment' || draft.propertyType === 'villa') && !num(draft.bedrooms)) { setWarn('Bedrooms are required for homes'); return; }
    setWarn('');
    update.mutate({ id, input: toInput() }, {
      onSuccess: (r) => setNote(r.notice),
      onError: (e) => {
        const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setWarn(Array.isArray(m) ? m.join(' · ') : (m ?? 'Couldn’t save — please try again.'));
      },
    });
  };

  const doClose = () => {
    close.mutate(id, {
      onSuccess: () => navigate('/realestate/mine'),
      onError: () => { setConfirmClose(false); setWarn('Couldn’t close the listing — please try again.'); },
    });
  };

  const field = (label: string, k: keyof Draft, opts?: { numeric?: boolean; placeholder?: string }) => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelS}>{label}</label>
      <input aria-label={label} inputMode={opts?.numeric ? 'numeric' : undefined} placeholder={opts?.placeholder}
        value={draft[k]} onChange={set(k)} style={inputS} />
    </div>
  );
  const select = (label: string, k: keyof Draft, options: { key: string; label: string }[]) => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelS}>{label}</label>
      <select aria-label={label} value={draft[k]} onChange={set(k)} style={inputS}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 40px' }}>
      <Link to="/realestate/mine" style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}>← My Listings</Link>
      <div className="eyebrow" style={{ marginTop: 12 }}>Real Estate · Edit listing</div>
      <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>{p.title}</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        Change anything below and save — the listing goes through the same automated check as a new one, and a clean edit is live again immediately.
      </p>
      {p.moderation === 'removed' && (
        <div className="note" style={{ marginBottom: 12 }}>This listing is closed. Saving it relists it.</div>
      )}
      {p.moderation === 'rejected' && p.moderationReasons.length > 0 && (
        <div className="note" style={{ marginBottom: 12 }}>Why it wasn’t published: {p.moderationReasons.join(' ')}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        {field('Name / Building', 'title')}
        {select('Property type', 'propertyType', PTYPES)}
        {field('City', 'city', { placeholder: 'e.g. Mumbai' })}
        {field('Locality / Area', 'locality', { placeholder: 'e.g. Andheri West' })}
        {select('Listing type', 'listingType', [{ key: 'sale', label: 'For sale' }, { key: 'rent', label: 'For rent (monthly)' }])}
        {field(draft.listingType === 'rent' ? 'Monthly rent (₹)' : 'Asking price (₹)', 'price', { numeric: true })}
        {field('Carpet area (sq.ft)', 'area', { numeric: true })}
        {field('Bedrooms', 'bedrooms', { numeric: true })}
        {field('Bathrooms', 'bathrooms', { numeric: true })}
        {select('Furnishing', 'furnishing', Object.keys(FURNISH_API).map((l) => ({ key: l, label: l })))}
        {select('Facing', 'facing', FACINGS.map((f) => ({ key: f, label: f })))}
        {field('Floor', 'floor', { numeric: true })}
        {field('Total floors', 'totalFloors', { numeric: true })}
        {field('RERA ID (if registered)', 'reraId')}
      </div>

      {/* Under-construction listings edit their project facts here too. */}
      {p.status === 'under_construction' && (
        <>
          <h3 style={{ margin: '8px 0 10px' }}>Project status</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            {field('Project name', 'projectName')}
            {field('Developer', 'developer')}
            {field('Possession (e.g. Dec 2026)', 'possessionDate')}
            {field('Construction progress (%)', 'progressPct', { numeric: true })}
          </div>
        </>
      )}

      <h3 style={{ margin: '8px 0 6px' }}>Amenities</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {AMENITIES.map((a) => {
          const on = amenities.includes(a.key);
          return (
            <button key={a.key} type="button" aria-pressed={on}
              onClick={() => setAmenities((cur) => (on ? cur.filter((k) => k !== a.key) : [...cur, a.key]))}
              style={{
                fontSize: 12.5, borderRadius: 999, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                background: on ? 'var(--accent-soft)' : 'var(--card)',
                color: on ? 'var(--accent-ink)' : 'var(--ink)', fontWeight: on ? 700 : 400,
              }}>
              {on ? '✓ ' : ''}{a.label}
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelS}>Description</label>
        <textarea aria-label="Description" rows={3} value={draft.description} onChange={set('description')} style={inputS} />
      </div>

      <h3 style={{ margin: '8px 0 6px' }}>Photos</h3>
      <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--accent)' }}>
        <PhotoCapture photos={photos} onChange={setPhotos} />
      </div>

      {warn && <p style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600 }}>{warn}</p>}
      {note && (
        <div className="note" style={{ margin: '8px 0 12px' }}>
          {note} <Link to="/realestate/mine" style={{ fontWeight: 700, textDecoration: 'underline', color: 'inherit' }}>See My Listings →</Link>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
        <Button variant="gold" disabled={update.isPending} onClick={save}>{update.isPending ? 'Saving…' : 'Save & resubmit'}</Button>
        <Link to="/realestate/mine"><Button variant="line">Cancel</Button></Link>
        {p.moderation !== 'removed' && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {confirmClose && <span className="muted" style={{ fontSize: 12.5 }}>Buyers stop seeing it; you can relist any time.</span>}
            <Button variant="line" disabled={close.isPending}
              onClick={() => (confirmClose ? doClose() : setConfirmClose(true))}>
              {close.isPending ? 'Closing…' : confirmClose ? 'Yes — close it' : 'Close listing (sold / withdrawn)'}
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}
