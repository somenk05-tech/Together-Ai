import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { usePostProperty, type Photo, type FloorPlan, type Milestone } from '../api';
import { PhotoCapture } from '../PhotoCapture';

const AMENITIES = [
  ['lift', 'Lift'], ['parking', 'Covered parking'], ['power-backup', 'Power backup'], ['security', '24×7 security'],
  ['gym', 'Gym'], ['pool', 'Swimming pool'], ['clubhouse', 'Clubhouse'], ['park', 'Park'],
  ['gas-pipeline', 'Gas pipeline'], ['water-supply', '24×7 water'], ['kids-play', "Kids' play"], ['cctv', 'CCTV'],
];
const DEFAULT_MILESTONES: Milestone[] = [
  { label: 'Foundation & excavation', pct: 100 }, { label: 'Superstructure', pct: 40 },
  { label: 'MEP & finishing', pct: 0 }, { label: 'Handover', pct: 0 },
];
const inputS = { width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none' } as const;

export function PostProperty() {
  const post = usePostProperty();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'ready' | 'under_construction'>('ready');
  const [listingType, setListingType] = useState('sale');
  const [propertyType, setPropertyType] = useState('apartment');
  const [f, setF] = useState({ title: '', city: '', locality: '', priceInr: '', areaSqft: '', bedrooms: '2', bathrooms: '2', furnishing: 'semi', floor: '', totalFloors: '', facing: 'east', description: '' });
  const [amenities, setAmenities] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  // UC
  const [uc, setUc] = useState({ projectName: '', developer: '', reraId: '', possessionDate: '', progressPct: '40' });
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>(DEFAULT_MILESTONES);

  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const toggleAmenity = (k: string) => setAmenities((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  const onFloorPlans = (e: ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setFloorPlans((fp) => [...fp, { label: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || `Plan ${fp.length + 1}`, url: String(reader.result) }]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const photosOk = photos.length >= 1;
  const coreOk = f.title.trim() && f.city.trim() && f.locality.trim() && Number(f.priceInr) > 0 && Number(f.areaSqft) > 0;
  const ucOk = status === 'ready' || (uc.possessionDate.trim() && uc.progressPct !== '');
  const canPost = photosOk && coreOk && ucOk && !post.isPending;

  const submit = () => {
    const isUC = status === 'under_construction';
    post.mutate({
      listingType, propertyType, status,
      title: f.title.trim(), city: f.city.trim(), locality: f.locality.trim(),
      priceInr: Math.round(Number(f.priceInr)), areaSqft: Math.round(Number(f.areaSqft)),
      bedrooms: Number(f.bedrooms) || 0, bathrooms: Number(f.bathrooms) || 0,
      furnishing: propertyType === 'plot' ? undefined : f.furnishing,
      floor: f.floor ? Number(f.floor) : undefined, totalFloors: f.totalFloors ? Number(f.totalFloors) : undefined,
      facing: f.facing, amenities, description: f.description.trim() || undefined, photos,
      projectName: isUC ? uc.projectName.trim() || undefined : undefined,
      developer: isUC ? uc.developer.trim() || undefined : undefined,
      reraId: isUC ? uc.reraId.trim() || undefined : undefined,
      possessionDate: isUC ? uc.possessionDate.trim() : undefined,
      progressPct: isUC ? Number(uc.progressPct) : undefined,
      floorPlans: isUC && floorPlans.length ? floorPlans : undefined,
      milestones: isUC ? milestones : undefined,
    }, { onSuccess: (p) => navigate(`/realestate/property/${p.id}`) });
  };

  const Seg = ({ value, cur, onClick, children }: { value: string; cur: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} style={{ cursor: 'pointer', borderRadius: 999, padding: '7px 15px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${cur === value ? 'var(--accent)' : 'var(--line)'}`, background: cur === value ? 'var(--accent)' : 'transparent', color: cur === value ? '#fff' : 'var(--ink-soft)' }}>{children}</button>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Real Estate · Post a Property</div>
      <h1 style={{ fontSize: 26 }}>List your property</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Capture photos with your camera (required), add the details, and publish. Under-construction homes go to their own tab with plans and milestones.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Status</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Seg value="ready" cur={status} onClick={() => setStatus('ready')}>🏠 Ready to move</Seg>
          <Seg value="under_construction" cur={status} onClick={() => setStatus('under_construction')}>🏗 Under construction</Seg>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Seg value="sale" cur={listingType} onClick={() => setListingType('sale')}>For sale</Seg>
          <Seg value="rent" cur={listingType} onClick={() => setListingType('rent')}>For rent</Seg>
          <span style={{ width: 1, background: 'var(--line)' }} />
          {['apartment', 'villa', 'plot', 'commercial'].map((t) => <Seg key={t} value={t} cur={propertyType} onClick={() => setPropertyType(t)}>{t[0].toUpperCase() + t.slice(1)}</Seg>)}
        </div>
      </div>

      {/* PHOTOS — mandatory */}
      <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${photosOk ? 'var(--accent)' : '#c62828'}` }}>
        <PhotoCapture photos={photos} onChange={setPhotos} />
      </div>

      <div className="card" style={{ marginBottom: 14, display: 'grid', gap: 10 }}>
        <div className="eyebrow">Details</div>
        <input value={f.title} onChange={set('title')} placeholder="Listing title (e.g. Bright 3 BHK near the park)" style={inputS} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={f.city} onChange={set('city')} placeholder="City" style={{ ...inputS, flex: 1, minWidth: 130 }} />
          <input value={f.locality} onChange={set('locality')} placeholder="Locality" style={{ ...inputS, flex: 1, minWidth: 130 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input type="number" value={f.priceInr} onChange={set('priceInr')} placeholder={listingType === 'rent' ? 'Rent ₹/month' : 'Price ₹'} style={{ ...inputS, flex: 1, minWidth: 130 }} />
          <input type="number" value={f.areaSqft} onChange={set('areaSqft')} placeholder="Area (sqft)" style={{ ...inputS, flex: 1, minWidth: 110 }} />
        </div>
        {propertyType !== 'plot' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>BHK <input type="number" value={f.bedrooms} onChange={set('bedrooms')} style={{ ...inputS, width: 70 }} /></label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>Baths <input type="number" value={f.bathrooms} onChange={set('bathrooms')} style={{ ...inputS, width: 70 }} /></label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>Floor <input type="number" value={f.floor} onChange={set('floor')} style={{ ...inputS, width: 70 }} /></label>
            <select value={f.furnishing} onChange={set('furnishing')} style={{ ...inputS, width: 150 }}>
              <option value="unfurnished">Unfurnished</option><option value="semi">Semi-furnished</option><option value="furnished">Furnished</option>
            </select>
          </div>
        )}
        <textarea value={f.description} onChange={set('description')} rows={2} placeholder="Description (optional)" style={inputS} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Amenities</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {AMENITIES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => toggleAmenity(k)}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${amenities.includes(k) ? 'var(--accent)' : 'var(--line)'}`, background: amenities.includes(k) ? 'var(--accent)' : 'transparent', color: amenities.includes(k) ? '#fff' : 'var(--ink-soft)' }}>{l}</button>
          ))}
        </div>
      </div>

      {status === 'under_construction' && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #e65100' }}>
          <div className="eyebrow" style={{ color: '#e65100' }}>Under-construction details</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input value={uc.projectName} onChange={(e) => setUc({ ...uc, projectName: e.target.value })} placeholder="Project name" style={{ ...inputS, flex: 1, minWidth: 150 }} />
              <input value={uc.developer} onChange={(e) => setUc({ ...uc, developer: e.target.value })} placeholder="Developer" style={{ ...inputS, flex: 1, minWidth: 150 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input value={uc.reraId} onChange={(e) => setUc({ ...uc, reraId: e.target.value })} placeholder="RERA registration ID" style={{ ...inputS, flex: 1, minWidth: 150 }} />
              <input value={uc.possessionDate} onChange={(e) => setUc({ ...uc, possessionDate: e.target.value })} placeholder="Possession (e.g. Dec 2026) *" style={{ ...inputS, flex: 1, minWidth: 130 }} />
            </div>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
              Construction progress: <strong>{uc.progressPct}%</strong>
              <input type="range" min={0} max={100} value={uc.progressPct} onChange={(e) => setUc({ ...uc, progressPct: e.target.value })} style={{ flex: 1 }} />
            </label>

            <div>
              <div className="eyebrow" style={{ margin: '4px 0' }}>Floor plans</div>
              <label style={{ display: 'inline-block', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', border: '1.5px dashed var(--line)', borderRadius: 10, padding: '8px 14px' }}>
                ＋ Upload floor plans<input type="file" accept="image/*" multiple onChange={onFloorPlans} style={{ display: 'none' }} />
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {floorPlans.map((fp, i) => (
                  <div key={i} style={{ width: 84, textAlign: 'center' }}>
                    <img src={fp.url} alt={fp.label} style={{ width: 84, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                    <div className="muted" style={{ fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fp.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{ margin: '4px 0' }}>Construction milestones</div>
              {milestones.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                  <input value={m.label} onChange={(e) => setMilestones(milestones.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} style={{ ...inputS, flex: 1 }} />
                  <input type="number" min={0} max={100} value={m.pct} onChange={(e) => setMilestones(milestones.map((x, idx) => idx === i ? { ...x, pct: Number(e.target.value) } : x))} style={{ ...inputS, width: 70 }} />
                  <span className="muted" style={{ fontSize: 12 }}>%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="accent" disabled={!canPost} onClick={submit}>{post.isPending ? 'Publishing…' : 'Publish listing'}</Button>
        {!photosOk && <span style={{ fontSize: 12.5, color: '#c62828', fontWeight: 600 }}>Add at least one photo to publish.</span>}
        {post.isError && <span style={{ fontSize: 12.5, color: '#c62828', fontWeight: 600 }}>Couldn't publish — check the required fields & photo.</span>}
      </div>
    </div>
  );
}
