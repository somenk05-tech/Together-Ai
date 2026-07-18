import { useMemo, useState, type CSSProperties } from 'react';

/* ── Lab-test catalog · packages · providers (ported from tc-health.js TCMED) ── */
interface Test { id: string; name: string; cat: string; price: number; fasting: boolean; prep: string; tat: number; rx?: boolean }
interface Pkg { id: string; name: string; purpose: string; tests: string[] }
interface Lab { id: string; name: string; factor: number; home: boolean; rating: number }

const TESTS: Test[] = [
  { id: 'hba1c', name: 'HbA1c', cat: 'Diabetes', price: 450, fasting: false, prep: 'No fasting needed.', tat: 24 },
  { id: 'fbs', name: 'Fasting Blood Sugar', cat: 'Diabetes', price: 90, fasting: true, prep: 'Fast 8–10 hours (water allowed).', tat: 12 },
  { id: 'insulin', name: 'Fasting Insulin', cat: 'Diabetes', price: 700, fasting: true, prep: 'Fast 8–10 hours.', tat: 48 },
  { id: 'cpeptide', name: 'C-Peptide', cat: 'Diabetes', price: 900, fasting: true, prep: 'Fast 8 hours.', tat: 48, rx: true },
  { id: 'cbc', name: 'Complete Blood Count (CBC)', cat: 'Blood', price: 300, fasting: false, prep: 'No preparation.', tat: 12 },
  { id: 'ferritin', name: 'Ferritin', cat: 'Blood', price: 550, fasting: false, prep: 'No preparation.', tat: 24 },
  { id: 'iron', name: 'Iron Studies', cat: 'Blood', price: 700, fasting: true, prep: 'Morning sample, fast 8 hours.', tat: 24 },
  { id: 'folate', name: 'Folate (B9)', cat: 'Vitamins', price: 700, fasting: false, prep: 'No preparation.', tat: 24 },
  { id: 'vitd', name: 'Vitamin D (25-OH)', cat: 'Vitamins', price: 1200, fasting: false, prep: 'No preparation.', tat: 48 },
  { id: 'vitb12', name: 'Vitamin B12', cat: 'Vitamins', price: 900, fasting: false, prep: 'No preparation.', tat: 24 },
  { id: 'lipid', name: 'Lipid Profile', cat: 'Heart', price: 500, fasting: true, prep: 'Fast 9–12 hours.', tat: 24 },
  { id: 'crp', name: 'CRP (hs)', cat: 'Heart', price: 500, fasting: false, prep: 'No preparation.', tat: 24 },
  { id: 'creatinine', name: 'Creatinine', cat: 'Kidney', price: 150, fasting: false, prep: 'No preparation.', tat: 12 },
  { id: 'egfr', name: 'eGFR', cat: 'Kidney', price: 200, fasting: false, prep: 'No preparation.', tat: 12 },
  { id: 'alt', name: 'ALT (SGPT)', cat: 'Liver', price: 150, fasting: false, prep: 'No preparation.', tat: 12 },
  { id: 'ast', name: 'AST (SGOT)', cat: 'Liver', price: 150, fasting: false, prep: 'No preparation.', tat: 12 },
  { id: 'ggt', name: 'GGT', cat: 'Liver', price: 200, fasting: false, prep: 'No preparation.', tat: 24 },
  { id: 'tsh', name: 'TSH', cat: 'Thyroid', price: 350, fasting: false, prep: 'Morning sample preferred.', tat: 24 },
  { id: 'ft3', name: 'Free T3', cat: 'Thyroid', price: 400, fasting: false, prep: 'No preparation.', tat: 24 },
  { id: 'ft4', name: 'Free T4', cat: 'Thyroid', price: 400, fasting: false, prep: 'No preparation.', tat: 24 },
  { id: 'psa', name: 'PSA (Prostate)', cat: 'Cancer markers', price: 700, fasting: false, prep: 'No preparation.', tat: 48, rx: true },
  { id: 'testosterone', name: 'Testosterone (Total)', cat: 'Hormones', price: 800, fasting: false, prep: 'Morning sample.', tat: 48, rx: true },
  { id: 'cortisol', name: 'Cortisol (AM)', cat: 'Hormones', price: 900, fasting: false, prep: '8 AM sample.', tat: 48, rx: true },
  { id: 'magnesium', name: 'Magnesium', cat: 'Minerals', price: 400, fasting: false, prep: 'No preparation.', tat: 24 },
  { id: 'zinc', name: 'Zinc', cat: 'Minerals', price: 500, fasting: false, prep: 'No preparation.', tat: 24 },
];
const TEST_BY_ID: Record<string, Test> = Object.fromEntries(TESTS.map((t) => [t.id, t]));

const PACKAGES: Pkg[] = [
  { id: 'basic', name: 'Basic Health Check', purpose: 'An annual baseline across sugar, blood, cholesterol, liver, kidney & thyroid.', tests: ['cbc', 'fbs', 'lipid', 'creatinine', 'alt', 'tsh', 'vitd'] },
  { id: 'diabetes', name: 'Diabetes Screening', purpose: 'Detect and monitor blood-sugar control.', tests: ['fbs', 'hba1c', 'insulin'] },
  { id: 'heart', name: 'Heart Health', purpose: 'Cardiac & lipid risk markers.', tests: ['lipid', 'crp', 'fbs'] },
  { id: 'liver', name: 'Liver Health', purpose: 'Liver enzyme & function panel.', tests: ['alt', 'ast', 'ggt'] },
  { id: 'kidney', name: 'Kidney Health', purpose: 'Renal function screen.', tests: ['creatinine', 'egfr', 'cbc'] },
  { id: 'thyroid', name: 'Thyroid Profile', purpose: 'Full thyroid function.', tests: ['tsh', 'ft3', 'ft4'] },
  { id: 'women', name: "Women's Health", purpose: 'Iron, thyroid, vitamins & general wellness for women.', tests: ['cbc', 'ferritin', 'tsh', 'vitd', 'vitb12'] },
  { id: 'men', name: "Men's Health", purpose: 'Metabolic, prostate & hormone screen for men.', tests: ['lipid', 'fbs', 'psa', 'testosterone'] },
  { id: 'senior', name: 'Senior Citizen Check', purpose: 'Comprehensive screen tuned for 60+.', tests: ['cbc', 'fbs', 'hba1c', 'lipid', 'creatinine', 'egfr', 'alt', 'tsh', 'vitd', 'vitb12'] },
  { id: 'sports', name: 'Sports Performance', purpose: 'Recovery, minerals & hormones for athletes.', tests: ['cbc', 'ferritin', 'magnesium', 'zinc', 'testosterone', 'vitd'] },
  { id: 'vitmin', name: 'Vitamin & Mineral Profile', purpose: 'Micronutrient status.', tests: ['vitd', 'vitb12', 'folate', 'ferritin', 'magnesium', 'zinc'] },
  { id: 'weight', name: 'Weight Management', purpose: 'Metabolic & hormonal drivers of weight.', tests: ['fbs', 'hba1c', 'insulin', 'lipid', 'tsh'] },
  { id: 'exec', name: 'Comprehensive Executive Checkup', purpose: 'Everything — a full-body executive panel.', tests: ['cbc', 'fbs', 'hba1c', 'insulin', 'lipid', 'crp', 'creatinine', 'egfr', 'alt', 'ast', 'ggt', 'tsh', 'ft3', 'ft4', 'vitd', 'vitb12', 'folate', 'ferritin', 'iron', 'magnesium', 'zinc', 'psa', 'cortisol'] },
];
const PKG_BY_ID: Record<string, Pkg> = Object.fromEntries(PACKAGES.map((p) => [p.id, p]));

const LABS: Lab[] = [
  { id: 'lalpath', name: 'Dr Lal PathLabs', factor: 1.0, home: true, rating: 4.6 },
  { id: 'metropolis', name: 'Metropolis', factor: 1.06, home: true, rating: 4.5 },
  { id: 'thyrocare', name: 'Thyrocare', factor: 0.85, home: true, rating: 4.3 },
  { id: 'srl', name: 'SRL Diagnostics', factor: 1.0, home: false, rating: 4.4 },
];

const labFactor = (labId: string) => LABS.find((l) => l.id === labId)?.factor ?? 1;
const testPrice = (id: string, labId: string) => Math.round((TEST_BY_ID[id]?.price ?? 0) * labFactor(labId));
const packagePrice = (pkg: Pkg, labId: string) => Math.round(pkg.tests.reduce((a, id) => a + (TEST_BY_ID[id]?.price ?? 0), 0) * 0.72 * labFactor(labId));
const packageRx = (pkg: Pkg) => pkg.tests.some((id) => TEST_BY_ID[id]?.rx);
const packageFasting = (pkg: Pkg) => pkg.tests.some((id) => TEST_BY_ID[id]?.fasting);
const packageMaxTat = (pkg: Pkg) => pkg.tests.reduce((a, id) => Math.max(a, TEST_BY_ID[id]?.tat ?? 0), 0);

const RECS = [
  { id: 'hba1c', reason: 'Your last HbA1c was borderline — consider follow-up glucose monitoring.' },
  { id: 'lipid', reason: 'Elevated cholesterol on record — a repeat lipid profile helps track it.' },
  { id: 'vitd', reason: 'Previous Vitamin D deficiency — a repeat test is useful if it has been a while.' },
  { id: 'cbc', reason: 'A CBC is a good general baseline across blood health.' },
];

const TABS = [
  { key: 'packages', label: '⭐ Recommended packages' },
  { key: 'build', label: '🧪 Build your own' },
  { key: 'ai', label: '✨ AI recommendations' },
  { key: 'mine', label: '❤️ Favourites & reorder' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

interface Order { id: string; summary: string; date: string; lab: string; total: number; status: string; testIds: string[]; pkgIds: string[] }

const cardBox: CSSProperties = { border: '1px solid var(--line)', borderRadius: 13, background: 'var(--card)', padding: '14px 16px', marginBottom: 12 };
const metaChip: CSSProperties = { background: 'var(--paper)', border: '1px solid var(--line)', padding: '2px 8px', borderRadius: 999 };
const rxBadge: CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#b0503e', background: '#f9ece8', padding: '2px 8px', borderRadius: 999, marginLeft: 4 };
const addBtn = (on: boolean): CSSProperties => ({ border: '1.3px solid var(--accent)', color: on ? '#fff' : 'var(--accent)', background: on ? 'var(--accent)' : 'var(--accent-soft)', borderRadius: 9, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' });

/** Order Blood Tests — packages, build-your-own, AI recs, cart & lab comparison (ported from medical-tests.html). */
export function Tests() {
  const [tab, setTab] = useState<TabKey>('packages');
  const [pkgs, setPkgs] = useState<Set<string>>(new Set());
  const [tests, setTests] = useState<Set<string>>(new Set());
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [labId, setLabId] = useState(LABS[0].id);
  const [mode, setMode] = useState<'home' | 'lab'>('home');
  const [slot, setSlot] = useState('');
  const [rxVerified, setRxVerified] = useState(false);
  const [cat, setCat] = useState('All');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [rxModal, setRxModal] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const anyRx = useMemo(
    () => [...tests].some((id) => TEST_BY_ID[id]?.rx) || [...pkgs].some((id) => PKG_BY_ID[id] && packageRx(PKG_BY_ID[id])),
    [tests, pkgs],
  );
  const cartTotal = (lab: string) =>
    [...tests].reduce((a, id) => a + testPrice(id, lab), 0) + [...pkgs].reduce((a, id) => a + (PKG_BY_ID[id] ? packagePrice(PKG_BY_ID[id], lab) : 0), 0);
  const count = [...tests].length + [...pkgs].reduce((a, id) => a + (PKG_BY_ID[id]?.tests.length ?? 0), 0);

  const cats = ['All', ...Array.from(new Set(TESTS.map((t) => t.cat)))];
  const filtered = TESTS.filter((t) => (cat === 'All' || t.cat === cat) && (!search || `${t.name} ${t.cat}`.toLowerCase().includes(search.toLowerCase())));

  const doOrder = (status: string) => {
    if (!count) return;
    const lab = LABS.find((l) => l.id === labId)!;
    const pkgIds = [...pkgs], testIds = [...tests];
    const summary = (pkgIds.length ? PKG_BY_ID[pkgIds[0]].name + (pkgIds.length > 1 ? ` +${pkgIds.length - 1}` : '') : '') +
      (testIds.length ? (pkgIds.length ? ' + ' : '') + `${testIds.length} test${testIds.length > 1 ? 's' : ''}` : '');
    const order: Order = { id: `ord-${Date.now()}`, summary: summary || 'Blood test order', date: new Date().toISOString().slice(0, 10), lab: lab.name, total: cartTotal(labId), status, testIds, pkgIds };
    setOrders((o) => [order, ...o]);
    setMsg(status === 'Awaiting prescription' ? "Saved — we'll book once your prescription is verified ✓" : `Order placed with ${lab.name} — ₹${order.total} · results will file to your Medical Hub ✓`);
    setPkgs(new Set()); setTests(new Set()); setRxVerified(false);
  };
  const reorder = (o: Order) => { setPkgs(new Set(o.pkgIds)); setTests(new Set(o.testIds)); setTab('packages'); };

  const canOrder = count > 0 && (!anyRx || rxVerified);

  return (
    <>
      <div className="rise" style={{ marginBottom: 22 }}>
        <div className="eyebrow">Medical Hub · 03</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Order Blood Tests</h1>
        <p className="lede" style={{ marginTop: 6 }}>Curated packages, or build your own from individual tests — your call. NABL-accredited labs, home collection, results auto-filed to your Medical Hub.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0 20px' }}>
        {TABS.map((t) => (
          <span key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t.key ? 'var(--accent)' : 'var(--card)', color: tab === t.key ? '#fff' : 'var(--ink)' }}>
            {t.label}
          </span>
        ))}
      </div>

      {msg && <div className="note" style={{ marginBottom: 14, borderLeft: '3px solid var(--accent)' }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 26, alignItems: 'start' }}>
        {/* ── content ── */}
        <div>
          {tab === 'packages' && PACKAGES.map((p) => {
            const on = pkgs.has(p.id);
            return (
              <div key={p.id} style={cardBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px' }}>{p.name}{packageRx(p) && <span style={rxBadge}>Rx</span>}</h4>
                    <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{p.purpose}</p>
                  </div>
                  <b style={{ fontFamily: 'var(--serif)', fontSize: 18, whiteSpace: 'nowrap' }}>₹{packagePrice(p, labId)}</b>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11.5, color: 'var(--ink-soft)', margin: '8px 0' }}>
                  <span style={metaChip}>{p.tests.length} tests</span>
                  <span style={metaChip}>{packageFasting(p) ? 'Fasting needed' : 'No fasting'}</span>
                  <span style={metaChip}>Blood sample</span>
                  <span style={metaChip}>Home collection</span>
                  <span style={metaChip}>~{packageMaxTat(p)}h report</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 10px', lineHeight: 1.5 }}>Includes: {p.tests.map((id) => TEST_BY_ID[id]?.name).join(', ')}</div>
                <button style={addBtn(on)} onClick={() => toggle(setPkgs, p.id)}>{on ? '✓ Added' : 'Add package'}</button>
              </div>
            );
          })}

          {tab === 'build' && (
            <>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a test — HbA1c, Vitamin D, TSH…"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 11, padding: '11px 13px 11px 38px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }} />
              </div>
              <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 12 }}>
                {cats.map((c) => (
                  <span key={c} onClick={() => setCat(c)}
                    style={{ whiteSpace: 'nowrap', padding: '7px 13px', borderRadius: 999, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: cat === c ? 'var(--accent)' : 'var(--card)', color: cat === c ? '#fff' : 'var(--ink)' }}>{c}</span>
                ))}
              </div>
              {filtered.length ? filtered.map((t) => {
                const on = tests.has(t.id), fav = favs.has(t.id);
                return (
                  <div key={t.id} style={{ ...cardBox, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => toggle(setFavs, t.id)} title="Save favourite"
                      style={{ cursor: 'pointer', fontSize: 15, color: fav ? '#e0a52e' : 'var(--muted)', background: 'none', border: 'none' }}>{fav ? '★' : '☆'}</button>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 13.5 }}>{t.name}{t.rx && <span style={rxBadge}>Rx</span>}</b>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{t.cat} · {t.fasting ? 'fasting' : 'no fasting'} · {t.prep} · ~{t.tat}h</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <b style={{ fontSize: 13 }}>₹{testPrice(t.id, labId)}</b><br />
                      <button style={{ ...addBtn(on), marginTop: 4 }} onClick={() => toggle(setTests, t.id)}>{on ? '✓' : '+ Add'}</button>
                    </div>
                  </div>
                );
              }) : <p className="muted" style={{ padding: '16px 0' }}>No tests match.</p>}
            </>
          )}

          {tab === 'ai' && (
            <>
              <div className="note" style={{ marginBottom: 14 }}>✨ These are <b>evidence-informed suggestions, not a diagnosis</b> — based on your profile. You decide what to order.</div>
              {RECS.map((r) => {
                const t = TEST_BY_ID[r.id], on = tests.has(r.id);
                return (
                  <div key={r.id} style={cardBox}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div>
                        <b>{t.name}{t.rx && <span style={rxBadge}>Rx</span>}</b>
                        <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>{r.reason}</p>
                      </div>
                      <button style={addBtn(on)} onClick={() => toggle(setTests, r.id)}>{on ? '✓ Added' : '+ Add'}</button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'mine' && (
            <>
              <div className="blk-head"><h2>Favourite tests</h2></div>
              {favs.size ? [...favs].map((id) => {
                const t = TEST_BY_ID[id]; if (!t) return null; const on = tests.has(id);
                return (
                  <div key={id} style={{ ...cardBox, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}><b style={{ fontSize: 13.5 }}>{t.name}</b><div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>₹{testPrice(id, labId)} · {t.cat}</div></div>
                    <button style={addBtn(on)} onClick={() => toggle(setTests, id)}>{on ? '✓' : '+ Add'}</button>
                  </div>
                );
              }) : <p className="muted" style={{ fontSize: 13 }}>No favourites yet — tap ☆ on any test.</p>}
              <div className="blk-head" style={{ marginTop: 22 }}><h2>Reorder previous</h2></div>
              {orders.length ? orders.map((o) => (
                <div key={o.id} style={{ ...cardBox, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}><b style={{ fontSize: 13.5 }}>{o.summary}</b><div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{o.date} · {o.lab} · ₹{o.total} · {o.status}</div></div>
                  <button style={addBtn(false)} onClick={() => reorder(o)}>Reorder</button>
                </div>
              )) : <p className="muted" style={{ fontSize: 13 }}>No previous orders.</p>}
            </>
          )}
        </div>

        {/* ── cart ── */}
        <aside className="card rise" style={{ position: 'sticky', top: 90, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 18px 8px' }}>
            <h4 style={{ margin: 0 }}>🧺 Your order <span style={{ fontSize: 12, color: 'var(--muted)' }}>({count} tests)</span></h4>
          </div>
          <div style={{ overflow: 'auto', padding: '6px 18px', flex: 1 }}>
            {count ? (
              <>
                {[...pkgs].map((id) => (
                  <div key={id} style={ciRow}><span>{PKG_BY_ID[id].name} ({PKG_BY_ID[id].tests.length} tests)</span><span style={ciRight}><b>₹{packagePrice(PKG_BY_ID[id], labId)}</b><button style={xBtn} onClick={() => toggle(setPkgs, id)}>✕</button></span></div>
                ))}
                {[...tests].map((id) => (
                  <div key={id} style={ciRow}><span>{TEST_BY_ID[id].name}</span><span style={ciRight}><b>₹{testPrice(id, labId)}</b><button style={xBtn} onClick={() => toggle(setTests, id)}>✕</button></span></div>
                ))}
              </>
            ) : <p className="muted" style={{ fontSize: 13, padding: '14px 0' }}>Add a package or individual tests to begin.</p>}

            <div style={sectHd}>COMPARE LABS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: '6px 0' }}>
              {LABS.map((l) => (
                <div key={l.id} onClick={() => setLabId(l.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${labId === l.id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 9, padding: '8px 10px', cursor: 'pointer', fontSize: 12.5, background: labId === l.id ? 'var(--accent-soft)' : 'transparent' }}>
                  <span>{l.name} · ★{l.rating}{l.home ? '' : ' · lab only'}</span><b>₹{cartTotal(l.id)}</b>
                </div>
              ))}
            </div>

            <div style={sectHd}>COLLECTION</div>
            <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
              {(['home', 'lab'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ flex: 1, border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--line)'}`, background: mode === m ? 'var(--accent)' : 'var(--card)', color: mode === m ? '#fff' : 'var(--ink)', borderRadius: 8, padding: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {m === 'home' ? '🏠 Home collection' : '🏥 Lab visit'}
                </button>
              ))}
            </div>
            <input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)}
              style={{ width: '100%', marginTop: 6, border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }} />
          </div>

          <div style={{ borderTop: '1px solid var(--line)', padding: '14px 18px', background: 'var(--paper)' }}>
            {anyRx && (
              <div style={{ background: '#fbf6e9', border: '1px solid #ecdcae', color: '#8a6d3b', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 10, lineHeight: 1.45 }}>
                🔒 <b>Prescription required.</b> Some selected tests need a valid doctor's prescription before booking.
                {rxVerified ? <b style={{ color: '#2e7d4f' }}> ✓ Prescription on file</b> : <a href="#rx" onClick={(e) => { e.preventDefault(); setRxModal(true); }} style={{ color: 'var(--accent)', fontWeight: 700 }}> Resolve →</a>}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span className="muted" style={{ fontSize: 12 }}>Total</span><b style={{ fontSize: 20 }}>₹{cartTotal(labId)}</b>
            </div>
            <button className="btn btn-accent" type="button" disabled={!canOrder} onClick={() => doOrder('Placed')}
              style={{ width: '100%', justifyContent: 'center', ...(canOrder ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}>
              {anyRx && !rxVerified ? 'Prescription needed' : 'Place order →'}
            </button>
            {anyRx && !rxVerified && (
              <button className="btn btn-line btn-sm" type="button" onClick={() => doOrder('Awaiting prescription')} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>Save & book later</button>
            )}
          </div>
        </aside>
      </div>

      <div className="trust">
        <span>◈ NABL Accredited</span><span>◈ Home Collection</span><span>◈ Auto-filed to Medical Hub</span><span>◈ Prescription-safe</span>
      </div>

      {rxModal && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setRxModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,18,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, maxWidth: 460, width: '100%', padding: '22px 24px' }}>
            <h3 style={{ margin: '0 0 4px' }}>Prescription required</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>This order includes tests that legally require a valid doctor's prescription in your region. Choose how to proceed:</p>
            <button style={optBtn} onClick={() => { setRxVerified(true); setRxModal(false); setMsg('Prescription uploaded & verified ✓'); }}><b style={optB}>⬆️ Upload an existing prescription</b><span style={optS}>Have one already? Upload it and we'll verify.</span></button>
            <button style={optBtn} onClick={() => { setRxVerified(true); setRxModal(false); setMsg('Book an online consult in the Medical Hub to get a prescription.'); }}><b style={optB}>🩺 Book an online doctor consultation</b><span style={optS}>Get a prescription in minutes via the Medical Hub.</span></button>
            <button style={optBtn} onClick={() => { doOrder('Awaiting prescription'); setRxModal(false); }}><b style={optB}>💾 Save tests & book later</b><span style={optS}>Keep this selection and complete once you have a prescription.</span></button>
            <button className="btn btn-line btn-sm" onClick={() => setRxModal(false)} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

const ciRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 13 };
const ciRight: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const xBtn: CSSProperties = { background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontWeight: 700 };
const sectHd: CSSProperties = { marginTop: 12, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--muted)' };
const optBtn: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', border: '1px solid var(--line)', borderRadius: 11, padding: '13px 15px', margin: '9px 0', cursor: 'pointer', background: 'var(--paper)', fontFamily: 'inherit', color: 'var(--ink)' };
const optB: CSSProperties = { display: 'block', fontSize: 13.5 };
const optS: CSSProperties = { fontSize: 12, color: 'var(--muted)' };
