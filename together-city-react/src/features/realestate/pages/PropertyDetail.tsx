import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useProperty, useEnquire, priceLabel, bhkLabel, type PriceInsight, type NearbyPoint } from '../api';
import { ShareToChat } from '@/features/chat/share';

/**
 * A PROPERTY IS A DOCUMENT, NOT A STACK OF CARDS.
 *
 * This page carried eight `.card` boxes in a column — facts, price
 * intelligence, EMI, cost, neighbourhood, project status, about, amenities —
 * and a stack of eight things that all look equally important has no reading
 * order at all. Every one of them survives here, unchanged in substance. What
 * changes is that they are ruled sections with a tracked label, so the page
 * reads top to bottom the way a listing sheet does: the price, what it is,
 * what it costs to actually own, where it is, and who to talk to.
 *
 * The price takes the masthead's wordmark slot. On a property page the price
 * IS the headline — it was set at 26px next to a badge, level with the title,
 * which is the one piece of information nobody has to hunt for.
 */

function Fact({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === '' || value === undefined) return null;
  return (
    <div>
      <div className="eyebrow" style={{ margin: 0 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}

/** A ruled section. The label is the rule's name, not a heading you read. */
function Sec({ label, children, quiet }: { label: string; children: React.ReactNode; quiet?: boolean }) {
  return (
    <section className={quiet ? 'esec equiet' : 'esec'}>
      <h2>{label}</h2>
      {children}
    </section>
  );
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
    <Sec label="Home-loan EMI">
      <div className="efigure" style={{ marginBottom: 12 }}>
        <b>{inr(emi)}</b><span className="muted" style={{ fontSize: 12.5 }}>/ month</span>
      </div>
      <Row label={`Down payment (${downPct}%)`} val={downPct} min={5} max={60} step={5} set={setDownPct} fmt={(v) => crL(priceInr * v / 100)} />
      <Row label="Interest rate" val={rate} min={6} max={12} step={0.1} set={setRate} fmt={(v) => `${v.toFixed(1)}%`} />
      <Row label="Tenure" val={years} min={5} max={30} step={1} set={setYears} fmt={(v) => `${v} yrs`} />
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12.5, marginTop: 6 }}>
        <div><span className="muted">Loan amount </span><strong>{crL(principal)}</strong></div>
        <div><span className="muted">Total interest </span><strong>{crL(totalInterest)}</strong></div>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Indicative only — actual rates depend on your lender and profile.</p>
    </Sec>
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
    <Sec label="True cost of ownership">
      <Line label="Property price" val={priceInr} />
      <Line label="Stamp duty (≈6%)" val={stamp} />
      <Line label="Registration (≈1%)" val={reg} />
      <Line label="All-in cost" val={total} strong />
      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Stamp duty &amp; registration vary by state; shown at typical rates.</p>
    </Sec>
  );
}

function InsightBadge({ insight, listingType }: { insight: PriceInsight; listingType: string }) {
  const below = insight.deltaPct < 0;
  const unit = listingType === 'rent' ? '/sqft/mo' : '/sqft';
  return (
    <Sec label="Price intelligence">
      <div className="efigure" style={{ flexWrap: 'wrap', gap: 12 }}>
        <b style={{ fontSize: 22 }}>{inr(insight.pricePerSqft)}</b>
        <span className="muted" style={{ fontSize: 12 }}>{unit}</span>
        {insight.deltaPct !== 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: below ? 'var(--ok-ink)' : 'var(--danger-ink)' }}>
            {below ? '▼' : '▲'} {Math.abs(insight.deltaPct)}% {below ? 'below' : 'above'} area average
          </span>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Locality average {inr(insight.areaAvgPerSqft)}{unit} · from {insight.sampleSize} comparable listing{insight.sampleSize === 1 ? '' : 's'}.</p>
    </Sec>
  );
}

const KIND_ICON: Record<string, string> = { metro: '🚇', school: '🏫', hospital: '🏥', mall: '🛍', market: '🛒' };
function Neighbourhood({ points, score, basis }: { points: NearbyPoint[]; score: number; basis?: string }) {
  const band = score >= 80 ? 'Well served' : score >= 65 ? 'Good provision' : score >= 50 ? 'Some provision' : 'Sparse';
  return (
    <Sec label="Neighbourhood & livability">
      <div className="efigure">
        <b style={{ color: score >= 65 ? 'var(--ok-ink)' : 'var(--warn-ink)' }}>{score}</b>
        <span className="muted" style={{ fontSize: 12.5 }}>/100 · {band}</span>
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
    </Sec>
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
    <div>
      {/* THE MASTHEAD, WITH THE PRICE IN THE WORDMARK SLOT. */}
      <div className="emast">
        <div>
          <h1 className="ewordmark">{priceLabel(p.priceInr, p.listingType)}</h1>
          <p className="estand" style={{ marginTop: 8 }}>
            <b>{p.title}</b>
            {bhkLabel(p)} · {p.areaSqft.toLocaleString('en-IN')} sqft · {p.locality}, {p.city}
          </p>
        </div>
        <div className="estand">
          {/* Trust is a sentence, not five pills. The pills were the same five
              facts wearing five different coloured capsules on a page whose
              headline is a number. */}
          <b>{p.listingType === 'rent' ? 'For rent' : 'For sale'}{uc ? ' · under construction' : ''}</b>
          {[
            p.verified.photo ? 'photo-verified' : null,
            p.verified.rera ? 'RERA-registered' : null,
            p.verified.listedBy === 'owner' ? 'listed by the owner' : 'platform listing',
          ].filter(Boolean).join(', ')}.
          {p.postedByYou ? ' This is your listing.' : ''}
        </div>
        {/* No Back link here — the page chrome above already carries one, and
            two Backs eighty pixels apart is a page that cannot decide. */}
        {p.postedByYou && (
          <nav className="enav">
            <Link to={`/realestate/edit/${p.id}`} className="on">Edit listing</Link>
            <Link to="/realestate/mine">My listings</Link>
            <Link to={uc ? '/realestate/under-construction' : '/realestate/explore'}>All listings</Link>
          </nav>
        )}
      </div>

      {/* THE PICTURES, IN THE ARC'S IDIOM — one band you scroll, not a hero
          with a tray of stamps under it. The selected shot leads at full
          height; the rest recede, and clicking one brings it forward. */}
      {p.photos.length > 0 && (
        <div className="earc" style={{ paddingBottom: 6 }}>
          {[p.photos[active], ...p.photos.filter((_, i) => i !== active)].map((ph, i) => {
            const realIndex = i === 0 ? active : p.photos.indexOf(ph);
            const lead = i === 0;
            return (
              <button key={`${ph.url}-${realIndex}`} type="button" className={lead ? 'elot' : 'elot eoff'}
                style={{ width: lead ? 420 : 150 }} onClick={() => setActive(realIndex)}
                aria-label={lead ? 'Selected photo' : `Show photo ${realIndex + 1}`}>
                <img className="eshot" src={ph.url} alt={ph.caption ?? ''}
                  style={{ width: lead ? 420 : 150, height: lead ? 260 : 190 }} />
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <ShareToChat item={{
          kind: 'property', hub: 'Real Estate', title: p.title, subtitle: `${p.locality}, ${p.city}`,
          image: p.photos[0]?.url, priceInr: p.priceInr, deepLink: `/realestate/property/${p.id}`,
          meta: [bhkLabel({ bedrooms: p.bedrooms, propertyType: p.propertyType }), `${p.areaSqft} sqft`, p.listingType === 'rent' ? 'For rent' : 'For sale'],
        }} />
      </div>

      <Sec label="The property">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Fact label="Type" value={`${bhkLabel(p)} · ${p.propertyType}`} />
          <Fact label="Area" value={`${p.areaSqft.toLocaleString('en-IN')} sqft`} />
          <Fact label="Baths" value={p.bathrooms || null} />
          <Fact label="Furnishing" value={p.furnishing} />
          <Fact label="Floor" value={p.floor != null ? `${p.floor}${p.totalFloors ? ` / ${p.totalFloors}` : ''}` : null} />
          <Fact label="Facing" value={p.facing} />
        </div>
      </Sec>

      <InsightBadge insight={p.insight} listingType={p.listingType} />

      {/* Buyer tools — sale only */}
      {p.listingType === 'sale' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          <EmiCalculator priceInr={p.priceInr} />
          <CostBreakdown priceInr={p.priceInr} />
        </div>
      )}

      <Neighbourhood points={p.neighbourhood} score={p.livabilityScore} basis={p.livabilityBasis} />

      {uc && (
        <Sec label="Project status">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Fact label="Project" value={p.projectName} />
            <Fact label="Developer" value={p.developer} />
            <Fact label="Possession" value={p.possessionDate} />
            <Fact label="RERA" value={p.reraId} />
            {possessionCountdown(p.possessionDate) && <Fact label="Timeline" value={possessionCountdown(p.possessionDate)} />}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span className="muted">Construction progress</span><strong>{p.progressPct}%</strong>
            </div>
            <div className="ehair"><i style={{ width: `${p.progressPct}%` }} /></div>
          </div>

          {p.milestones.length > 0 && (
            <div style={{ marginTop: 18 }}>
              {p.milestones.map((m, i) => (
                <div key={i} style={{ padding: '9px 0', borderTop: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{m.label}{m.note ? <span className="muted" style={{ fontWeight: 400 }}> · {m.note}</span> : ''}</span>
                    <strong style={{ color: m.pct === 100 ? 'var(--ok-ink)' : m.pct > 0 ? 'var(--ink-soft)' : 'var(--muted)' }}>{m.pct}%</strong>
                  </div>
                  <div className="ehair"><i style={{ width: `${m.pct}%` }} /></div>
                </div>
              ))}
            </div>
          )}

          {p.floorPlans.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="eyebrow">Floor plans</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                {p.floorPlans.map((fp, i) => (
                  <div key={i} style={{ width: 150 }}>
                    <img src={fp.url} alt={fp.label} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 'var(--r-1)' }} />
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{fp.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Sec>
      )}

      {p.description && (
        <Sec label="About">
          <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6, maxWidth: '62ch' }}>{p.description}</p>
        </Sec>
      )}

      {p.amenities.length > 0 && (
        <Sec label="Amenities" quiet>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.7, maxWidth: '62ch' }}>
            {p.amenities.map((a) => a.label).join(' · ')}
          </p>
        </Sec>
      )}

      <Sec label={p.postedByYou ? 'Your listing' : 'Interested'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <p className="muted" style={{ flex: 1, minWidth: 220, fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
            {p.postedByYou ? 'Manage it from My Listings — edit it and it goes back through review.'
              : p.verified.listedBy === 'owner' ? 'Connect with the seller — the listing opens in a private chat, and your contact details stay on Together City.'
              : 'Share it into a chat to discuss with your circle.'}
            {connectErr && <span style={{ display: 'block', color: 'var(--danger-ink)', fontWeight: 600, marginTop: 4 }}>{connectErr}</span>}
          </p>
          {!p.postedByYou && p.verified.listedBy === 'owner' && (
            <Button variant="accent" size="sm" disabled={enquire.isPending} onClick={connect}>
              {enquire.isPending ? 'Opening chat…' : '💬 Connect & chat'}
            </Button>
          )}
        </div>
      </Sec>
    </div>
  );
}
