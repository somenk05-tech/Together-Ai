import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useProperty, useEnquire, priceLabel, bhkLabel, type PriceInsight, type NearbyPoint } from '../api';
import { ShareToChat } from '@/features/chat/share';

function Fact({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === '' || value === undefined) return null;
  return <div><div className="eyebrow" style={{ margin: 0 }}>{label}</div><div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div></div>;
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const crL = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2).replace(/\.00$/, '')} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')} L` : inr(n);

/** Interactive home-loan EMI calculator — down-payment %, rate and tenure → monthly EMI. */
function EmiCalculator({ priceInr }: { priceInr: number }) {
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(20);
  const { emi, principal, totalInterest } = useMemo(() => {
    const principal = priceInr * (1 - downPct / 100);
    const r = rate / 12 / 100; const n = years * 12;
    const emi = r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return { emi, principal, totalInterest: emi * n - principal };
  }, [priceInr, downPct, rate, years]);

  const Row = ({ label, val, min, max, step, set, fmt }: { label: string; val: number; min: number; max: number; step: number; set: (n: number) => void; fmt: (n: number) => string }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span className="muted">{label}</span><strong>{fmt(val)}</strong></div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={val} onChange={(e) => set(Number(e.target.value))} style={{ width: '100%' }} />
    </div>
  );

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="eyebrow">Home-loan EMI calculator</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 12px' }}>
        <div style={{ fontSize: 30, fontWeight: 800 }}>{inr(emi)}</div>
        <span className="muted" style={{ fontSize: 12.5 }}>/ month</span>
      </div>
      <Row label={`Down payment (${downPct}%)`} val={downPct} min={5} max={60} step={5} set={setDownPct} fmt={(v) => crL(priceInr * v / 100)} />
      <Row label="Interest rate" val={rate} min={6} max={12} step={0.1} set={setRate} fmt={(v) => `${v.toFixed(1)}%`} />
      <Row label="Tenure" val={years} min={5} max={30} step={1} set={setYears} fmt={(v) => `${v} yrs`} />
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12.5, marginTop: 6 }}>
        <div><span className="muted">Loan amount </span><strong>{crL(principal)}</strong></div>
        <div><span className="muted">Total interest </span><strong>{crL(totalInterest)}</strong></div>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Indicative only — actual rates depend on your lender and profile.</p>
    </div>
  );
}

/** True cost of ownership — stamp duty + registration on top of price. */
function CostBreakdown({ priceInr }: { priceInr: number }) {
  const stamp = priceInr * 0.06, reg = priceInr * 0.01, total = priceInr + stamp + reg;
  const Line = ({ label, val, strong }: { label: string; val: number; strong?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 13.5, fontWeight: strong ? 800 : 400 }}>
      <span className={strong ? '' : 'muted'}>{label}</span><span>{crL(val)}</span>
    </div>
  );
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="eyebrow">True cost of ownership</div>
      <div style={{ marginTop: 6 }}>
        <Line label="Property price" val={priceInr} />
        <Line label="Stamp duty (≈6%)" val={stamp} />
        <Line label="Registration (≈1%)" val={reg} />
        <Line label="All-in cost" val={total} strong />
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Stamp duty & registration vary by state; shown at typical rates.</p>
    </div>
  );
}

function InsightBadge({ insight, listingType }: { insight: PriceInsight; listingType: string }) {
  const below = insight.deltaPct < 0;
  const unit = listingType === 'rent' ? '/sqft/mo' : '/sqft';
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="eyebrow">Price intelligence</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{inr(insight.pricePerSqft)}<span className="muted" style={{ fontSize: 12, fontWeight: 400 }}> {unit}</span></div>
        {insight.deltaPct !== 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: below ? 'var(--ok-ink)' : 'var(--danger-ink)' }}>
            {below ? '▼' : '▲'} {Math.abs(insight.deltaPct)}% {below ? 'below' : 'above'} area average
          </span>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Locality average {inr(insight.areaAvgPerSqft)}{unit} · from {insight.sampleSize} comparable listing{insight.sampleSize === 1 ? '' : 's'}.</p>
    </div>
  );
}

const KIND_ICON: Record<string, string> = { metro: '🚇', school: '🏫', hospital: '🏥', mall: '🛍', market: '🛒' };
function Neighbourhood({ points, score, basis }: { points: NearbyPoint[]; score: number; basis?: string }) {
  const band = score >= 80 ? 'Well served' : score >= 65 ? 'Good provision' : score >= 50 ? 'Some provision' : 'Sparse';
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="eyebrow" style={{ margin: 0 }}>Neighbourhood & livability</div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <strong style={{ fontSize: 18, color: score >= 65 ? 'var(--ok-ink)' : 'var(--warn-ink)' }}>{score}</strong><span className="muted">/100 · {band}</span>
        </span>
      </div>
      {/* What the number counted — otherwise it reads as a rating of the area. */}
      {basis && <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, margin: '8px 0 0' }}>{basis}</p>}
      {points.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
          {points.map((n) => (
            <div key={n.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ fontSize: 16 }}>{KIND_ICON[n.kind] ?? '📍'}</span>
              <span style={{ flex: 1 }}>{n.label}</span>
              <strong>{n.distanceKm} km</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rough months-to-possession from a "Mon YYYY" string. */
function possessionCountdown(possession: string | null): string | null {
  if (!possession) return null;
  const m = possession.match(/([A-Za-z]{3,})\s*(\d{4})/);
  if (!m) return null;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const mi = months.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mi < 0) return null;
  const target = new Date(Date.UTC(Number(m[2]), mi, 1));
  const now = new Date();
  const diff = (target.getUTCFullYear() - now.getUTCFullYear()) * 12 + (target.getUTCMonth() - now.getUTCMonth());
  if (diff <= 0) return 'Possession due';
  return diff >= 12 ? `~${Math.round(diff / 12 * 10) / 10} years to possession` : `~${diff} months to possession`;
}

export function PropertyDetail() {
  const { id = '' } = useParams();
  const q = useProperty(id);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const enquire = useEnquire();
  const [connectErr, setConnectErr] = useState('');

  const connect = () => {
    setConnectErr('');
    enquire.mutate({ id }, {
      onSuccess: (r) => navigate(`/chats?c=${r.conversationId}`),
      onError: (e) => setConnectErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Couldn’t open the chat — please try again.'),
    });
  };

  if (q.isLoading) return <Spinner label="Loading property…" />;
  if (q.isError || !q.data) return <EmptyState title="Couldn't load this property" hint="It may have been removed." />;
  const p = q.data;
  const uc = p.status === 'under_construction';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px' }}>
      <Link to={uc ? '/realestate/under-construction' : '/realestate/explore'} style={{ fontSize: 12.5, color: 'var(--accent-ink)', fontWeight: 600 }}>← Back</Link>

      {/* Gallery */}
      <div style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden', background: 'var(--media-bg)', aspectRatio: '16 / 9', position: 'relative' }}>
        {p.photos[active]?.url && <img src={p.photos[active].url} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        {uc && <span style={{ position: 'absolute', top: 12, left: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--on-accent)', background: 'var(--warn-ink)', borderRadius: 999, padding: '4px 11px' }}>Under construction</span>}
      </div>
      {p.photos.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {p.photos.map((ph, i) => (
            <button key={i} type="button" onClick={() => setActive(i)} style={{ width: 76, height: 56, borderRadius: 8, overflow: 'hidden', border: `2px solid ${i === active ? 'var(--accent)' : 'transparent'}`, padding: 0, cursor: 'pointer' }}>
              <img src={ph.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>{priceLabel(p.priceInr, p.listingType)}</h1>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--on-accent)', background: p.listingType === 'rent' ? 'var(--info-ink)' : 'var(--ok-ink)', borderRadius: 999, padding: '3px 10px' }}>{p.listingType === 'rent' ? 'For rent' : 'For sale'}</span>
        <span style={{ marginLeft: 'auto' }}>
          <ShareToChat item={{
            kind: 'property', hub: 'Real Estate', title: p.title, subtitle: `${p.locality}, ${p.city}`,
            image: p.photos[0]?.url, priceInr: p.priceInr, deepLink: `/realestate/property/${p.id}`,
            meta: [bhkLabel({ bedrooms: p.bedrooms, propertyType: p.propertyType }), `${p.areaSqft} sqft`, p.listingType === 'rent' ? 'For rent' : 'For sale'],
          }} />
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, marginTop: 4 }}>{p.title}</div>
      <div className="muted" style={{ fontSize: 13.5 }}>{p.locality}, {p.city}</div>

      {/* Trust & verification badges */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {p.verified.photo && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ok-ink)', background: 'var(--ok-soft)', borderRadius: 999, padding: '3px 11px' }}>✓ Photo-verified</span>}
        {p.verified.rera && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--info-ink)', background: 'var(--info-soft)', borderRadius: 999, padding: '3px 11px' }}>✓ RERA-registered</span>}
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 11px' }}>{p.verified.listedBy === 'owner' ? 'Listed by owner' : 'Platform listing'}</span>
      </div>

      <div className="card" style={{ marginTop: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Fact label="Type" value={`${bhkLabel(p)} · ${p.propertyType}`} />
        <Fact label="Area" value={`${p.areaSqft.toLocaleString('en-IN')} sqft`} />
        <Fact label="Baths" value={p.bathrooms || null} />
        <Fact label="Furnishing" value={p.furnishing} />
        <Fact label="Floor" value={p.floor != null ? `${p.floor}${p.totalFloors ? ` / ${p.totalFloors}` : ''}` : null} />
        <Fact label="Facing" value={p.facing} />
      </div>

      {/* Price intelligence */}
      <InsightBadge insight={p.insight} listingType={p.listingType} />

      {/* Buyer tools — sale only */}
      {p.listingType === 'sale' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 0 }}>
          <EmiCalculator priceInr={p.priceInr} />
          <CostBreakdown priceInr={p.priceInr} />
        </div>
      )}

      {/* Neighbourhood & livability */}
      <Neighbourhood points={p.neighbourhood} score={p.livabilityScore} basis={p.livabilityBasis} />

      {uc && (
        <div className="card" style={{ marginTop: 14, borderLeft: '4px solid var(--warn-ink)' }}>
          <div className="eyebrow" style={{ color: 'var(--warn-ink)' }}>Project status</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8, alignItems: 'flex-start' }}>
            <Fact label="Project" value={p.projectName} />
            <Fact label="Developer" value={p.developer} />
            <Fact label="Possession" value={p.possessionDate} />
            <Fact label="RERA" value={p.reraId} />
            {possessionCountdown(p.possessionDate) && <Fact label="Timeline" value={possessionCountdown(p.possessionDate)} />}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span className="muted">Construction progress</span><strong>{p.progressPct}%</strong></div>
            <div style={{ height: 9, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${p.progressPct}%`, background: 'var(--warn-ink)' }} /></div>
          </div>

          {p.milestones.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="eyebrow">Construction milestones</div>
              {p.milestones.map((m, i) => (
                <div key={i} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{m.label}{m.note ? <span className="muted" style={{ fontWeight: 400 }}> · {m.note}</span> : ''}</span>
                    <strong style={{ color: m.pct === 100 ? 'var(--ok-ink)' : m.pct > 0 ? 'var(--warn-ink)' : 'var(--muted)' }}>{m.pct}%</strong>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', marginTop: 4 }}><div style={{ height: '100%', width: `${m.pct}%`, background: m.pct === 100 ? 'var(--ok-ink)' : 'var(--warn-ink)' }} /></div>
                </div>
              ))}
            </div>
          )}

          {p.floorPlans.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="eyebrow">Floor plans</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                {p.floorPlans.map((fp, i) => (
                  <div key={i} style={{ width: 150 }}>
                    <img src={fp.url} alt={fp.label} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{fp.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {p.description && <div className="card" style={{ marginTop: 14 }}><div className="eyebrow">About</div><p style={{ fontSize: 13.5, margin: '6px 0 0', lineHeight: 1.55 }}>{p.description}</p></div>}

      {p.amenities.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="eyebrow">Amenities</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {p.amenities.map((a) => <span key={a.key} style={{ fontSize: 12, border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px' }}>✓ {a.label}</span>)}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.postedByYou ? 'This is your listing' : 'Interested?'}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {p.postedByYou ? 'Manage it from My Listings.'
              : p.verified.listedBy === 'owner' ? 'Connect with the seller — the listing opens in a private chat, and your contact details stay on Together City.'
              : 'Share it into a chat to discuss with your circle.'}
          </div>
          {connectErr && <div style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600, marginTop: 4 }}>{connectErr}</div>}
        </div>
        {p.postedByYou
          ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <Link to={`/realestate/edit/${p.id}`}><Button variant="accent" size="sm">✎ Edit listing</Button></Link>
              <Link to="/realestate/mine"><Button variant="line" size="sm">My Listings</Button></Link>
            </span>
          )
          : p.verified.listedBy === 'owner' && (
            <Button variant="accent" size="sm" disabled={enquire.isPending} onClick={connect}>
              {enquire.isPending ? 'Opening chat…' : '💬 Connect & chat'}
            </Button>
          )}
      </div>
    </div>
  );
}
