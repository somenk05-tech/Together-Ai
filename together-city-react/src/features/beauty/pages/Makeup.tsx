import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hero } from '@/components/ui';
import { useMakeupLook } from '../api';

type Section = 'base' | 'eyes' | 'lips' | 'cheek' | 'tools';
type TierKey = 'budget' | 'ai' | 'premium';
interface Tier { brand: string; name: string; price: number }
interface Item {
  slot: string; section: Section; finish: 'matte' | 'dewy' | 'natural';
  derm: string; emoji: string; hue: number; why: string;
  tiers: Record<TierKey, Tier>;
}

const inr = (n: number) => (n || 0).toLocaleString('en-IN');

const ITEMS: Item[] = [
  { slot: 'Primer', section: 'base', finish: 'natural', derm: '4.5', emoji: '💧', hue: 195,
    why: 'Grips makeup and smooths texture — a breathable, natural finish for everyday.',
    tiers: { budget: { brand: 'Maybelline', name: 'Baby Skin Pore Eraser', price: 399 }, ai: { brand: "L'Oréal Paris", name: 'Prime Lab Blurring Primer', price: 649 }, premium: { brand: 'Smashbox', name: 'Photo Finish Primer', price: 3200 } } },
  { slot: 'Foundation', section: 'base', finish: 'natural', derm: '4.7', emoji: '🎨', hue: 30,
    why: 'Your base — a breathable, natural finish matched to your skin type.',
    tiers: { budget: { brand: 'Maybelline', name: 'Fit Me Matte + Poreless', price: 549 }, ai: { brand: "L'Oréal Paris", name: 'Infallible 24H Fresh Wear', price: 999 }, premium: { brand: 'Estée Lauder', name: 'Double Wear Stay-in-Place', price: 3900 } } },
  { slot: 'Concealer', section: 'base', finish: 'natural', derm: '4.6', emoji: '🖌️', hue: 25,
    why: 'Covers spots & under-eyes without caking — non-comedogenic.',
    tiers: { budget: { brand: 'Maybelline', name: 'Fit Me Concealer', price: 425 }, ai: { brand: 'NYX', name: 'HD Photogenic Concealer', price: 650 }, premium: { brand: 'NARS', name: 'Radiant Creamy Concealer', price: 2600 } } },
  { slot: 'Setting Spray', section: 'base', finish: 'natural', derm: '4.4', emoji: '💨', hue: 205,
    why: 'Locks the look in place — a breathable, natural finish for everyday.',
    tiers: { budget: { brand: 'Blue Heaven', name: 'Makeup Fixer', price: 299 }, ai: { brand: 'NYX', name: 'Matte Finish Setting Spray', price: 850 }, premium: { brand: 'Urban Decay', name: 'All Nighter Setting Spray', price: 2700 } } },
  { slot: 'Blush', section: 'cheek', finish: 'natural', derm: '4.6', emoji: '🌸', hue: 340,
    why: 'A natural flush; powder sits well on everyday skin, soft rosy-nude shades.',
    tiers: { budget: { brand: 'Lakmé', name: 'Blush & Glow', price: 349 }, ai: { brand: 'Sugar', name: 'Contour de Force Blush', price: 599 }, premium: { brand: 'NARS', name: 'Blush — Orgasm', price: 2900 } } },
  { slot: 'Mascara', section: 'eyes', finish: 'natural', derm: '4.5', emoji: '👁️', hue: 250,
    why: 'Everyday volume, smudge-resistant and easy to build.',
    tiers: { budget: { brand: 'Maybelline', name: 'The Colossal Mascara', price: 425 }, ai: { brand: "L'Oréal Paris", name: 'Voluminous Lash Paradise', price: 899 }, premium: { brand: 'Benefit', name: "They're Real! Lengthening", price: 2400 } } },
  { slot: 'Eyeliner', section: 'eyes', finish: 'natural', derm: '4.4', emoji: '✏️', hue: 275,
    why: 'Defines the eyes with an easy everyday line.',
    tiers: { budget: { brand: 'Blue Heaven', name: 'Bold Liquid Eyeliner', price: 199 }, ai: { brand: 'Maybelline', name: 'Hyper Easy Liquid Liner', price: 499 }, premium: { brand: 'Bobbi Brown', name: 'Long-Wear Gel Eyeliner', price: 2300 } } },
  { slot: 'Brow', section: 'eyes', finish: 'natural', derm: '4.5', emoji: '✏️', hue: 35,
    why: 'Frames the face in seconds.',
    tiers: { budget: { brand: 'Insight', name: 'Eyebrow Pencil', price: 199 }, ai: { brand: 'Maybelline', name: 'Brow Ultra Slim', price: 450 }, premium: { brand: 'Anastasia', name: 'Brow Wiz', price: 2100 } } },
  { slot: 'Lipstick', section: 'lips', finish: 'natural', derm: '4.7', emoji: '💄', hue: 350,
    why: 'Transfer-proof everyday colour; soft rosy-nude shades flatter most undertones.',
    tiers: { budget: { brand: 'Lakmé', name: '9to5 Primer + Matte', price: 399 }, ai: { brand: 'Maybelline', name: 'SuperStay Matte Ink', price: 699 }, premium: { brand: 'MAC', name: 'Retro Matte Lipstick', price: 2100 } } },
  { slot: 'Lip Balm', section: 'lips', finish: 'dewy', derm: '4.4', emoji: '👄', hue: 5,
    why: 'Hydrates dry lips with a hint of colour.',
    tiers: { budget: { brand: 'Nivea', name: 'Fruity Shine Lip Balm', price: 175 }, ai: { brand: 'Maybelline', name: 'Baby Lips Moisturising', price: 250 }, premium: { brand: 'Bobbi Brown', name: 'Extra Lip Tint', price: 2400 } } },
  { slot: 'Beauty Sponge', section: 'tools', finish: 'natural', derm: '4.5', emoji: '🥚', hue: 15,
    why: 'Blends base seamlessly for a natural finish.',
    tiers: { budget: { brand: 'Sagacia', name: 'Beauty Blender Sponge', price: 199 }, ai: { brand: 'Real Techniques', name: 'Miracle Complexion Sponge', price: 649 }, premium: { brand: 'Beautyblender', name: 'Original Blender', price: 1600 } } },
];

const BARE_ORD: Record<string, number> = { Foundation: 1, Concealer: 2, Mascara: 3, Lipstick: 4, Blush: 5, Brow: 6 };
const EXTRA_ORD: Record<string, number> = { Primer: 20, 'Setting Spray': 21, Eyeliner: 22, 'Lip Balm': 23, 'Beauty Sponge': 24 };
const TABS: { key: 'complete' | Section; label: string }[] = [
  { key: 'complete', label: 'Complete Look' }, { key: 'base', label: 'Base' },
  { key: 'eyes', label: 'Eyes' }, { key: 'lips', label: 'Lips' }, { key: 'cheek', label: 'Cheeks' },
];
const SECTION_TITLES: [Section, string][] = [['base', 'Base'], ['eyes', 'Eyes'], ['lips', 'Lips'], ['cheek', 'Cheeks'], ['tools', 'Tools']];
const byId = (slot: string) => ITEMS.find((i) => i.slot === slot)!;

function allocate(budget: number): Record<string, TierKey> {
  const ordered = [...ITEMS].sort((a, b) => {
    const oa = BARE_ORD[a.slot] ?? EXTRA_ORD[a.slot] ?? 40;
    const ob = BARE_ORD[b.slot] ?? EXTRA_ORD[b.slot] ?? 40;
    return oa - ob || a.tiers.ai.price - b.tiers.ai.price;
  });
  let sum = 0;
  const plan: Record<string, TierKey> = {};
  for (const it of ordered) {
    const bare = BARE_ORD[it.slot] != null;
    const aiP = it.tiers.ai.price, buP = it.tiers.budget.price;
    if (sum + aiP <= budget) { plan[it.slot] = 'ai'; sum += aiP; }
    else if (bare || sum + buP <= budget) { plan[it.slot] = 'budget'; sum += buP; }
  }
  return plan;
}

const TIER_LABEL: Record<TierKey, { text: string; bg: string; fg: string }> = {
  ai: { text: '', bg: '', fg: '' },
  budget: { text: 'Budget', bg: 'var(--ok-soft)', fg: 'var(--ok-ink)' },
  premium: { text: 'Premium', bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
};

function Thumb({ it, tier }: { it: Item; tier: Tier }) {
  return (
    <div style={{ flex: '0 0 auto', width: 76, height: 76, borderRadius: 13, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 1, boxShadow: 'inset 0 0 0 1px rgba(20,20,18,.06)', overflow: 'hidden',
      background: `linear-gradient(135deg, hsl(${it.hue},44%,91%), hsl(${(it.hue + 38) % 360},40%,80%))` }}>
      <span style={{ fontSize: 26, lineHeight: 1 }}>{it.emoji}</span>
      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.04em', color: 'rgba(20,20,18,.5)', textTransform: 'uppercase',
        maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>{tier.brand}</span>
    </div>
  );
}

const finishChip = (fin: string): React.CSSProperties => {
  const c = fin === 'matte' ? { background: 'var(--info-soft)', color: 'var(--info-ink)' }
    : fin === 'dewy' ? { background: 'var(--info-soft)', color: 'var(--ok-ink)' } : { background: 'var(--accent-soft)', color: 'var(--warn-ink)' };
  return { fontSize: 10, fontWeight: 700, letterSpacing: '.03em', padding: '3px 8px', borderRadius: 'var(--r-full)', textTransform: 'capitalize', ...c };
};

/** Makeup Studio — one matched pick per need, with budget / AI / premium tiers and a budget-built everyday look. */
export function Makeup() {
  const [budget, setBudget] = useState(4000);
  const [tierSel, setTierSel] = useState<Record<string, TierKey>>(() => allocate(4000));
  const [cart, setCart] = useState<Record<string, boolean>>(() => {
    const plan = allocate(4000);
    return Object.fromEntries(Object.keys(plan).map((k) => [k, true]));
  });
  const [tab, setTab] = useState<'complete' | Section>('complete');
  const [occasion, setOccasion] = useState('Everyday Natural');
  const look = useMakeupLook(occasion);
  const [openCmp, setOpenCmp] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');

  const tierOf = (slot: string): TierKey => tierSel[slot] ?? 'ai';
  const priceOf = (slot: string) => byId(slot).tiers[tierOf(slot)].price;

  const inCartSlots = useMemo(() => ITEMS.map((i) => i.slot).filter((s) => cart[s]), [cart]);
  const subtotal = inCartSlots.reduce((a, s) => a + priceOf(s), 0);
  const save = Math.round(subtotal * 0.05);
  const total = subtotal - save;
  const over = total > budget;

  const rebuild = (b: number) => {
    const plan = allocate(b);
    setTierSel(plan);
    setCart(Object.fromEntries(Object.keys(plan).map((k) => [k, true])));
  };

  const setTier = (slot: string, t: TierKey) => setTierSel((s) => ({ ...s, [slot]: t }));

  const toggleCart = (slot: string) => {
    if (cart[slot]) {
      setCart((c) => { const n = { ...c }; delete n[slot]; return n; });
      setNote('');
    } else {
      const projected = inCartSlots.reduce((a, s) => a + priceOf(s), 0) + priceOf(slot);
      const projTotal = projected - Math.round(projected * 0.05);
      if (projTotal > budget) { setNote(`Adding ${slot} would exceed your ₹${inr(budget)} budget — raise it, or switch a step to Budget.`); return; }
      setCart((c) => ({ ...c, [slot]: true }));
      setNote('');
    }
  };

  const visible = ITEMS.filter((i) => tab === 'complete' || i.section === tab);

  return (
    <div>
      <Hero
        image="/assets/img/makeup-studio-hero.webp"
        eyebrow="Beauty Market · 04"
        title="Makeup Studio"
        sub="Looks built from your face analysis, colouring and the occasion."
        objectPosition="center top"
      />

      {/* ── occasion picker ── */}
      <div className="card" style={{ marginBottom: 18, padding: '16px 20px' }}>
        <b style={{ fontSize: 14 }}>What's the occasion?</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {(look.data?.occasions ?? ['Everyday Natural']).map((o) => (
            <button key={o} type="button" onClick={() => setOccasion(o)}
              style={{ fontSize: 12, fontWeight: 600, padding: '6px 13px', borderRadius: 'var(--r-full)', cursor: 'pointer', font: 'inherit',
                border: `1.5px solid ${occasion === o ? 'var(--accent)' : 'var(--line)'}`,
                background: occasion === o ? 'var(--accent)' : 'transparent', color: occasion === o ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* ── your AI look ── */}
      {look.data && (
        <div className="card" style={{ marginBottom: 18, padding: '16px 20px', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 15 }}>💄 Your {look.data.occasion} look</b>
            <span className="muted" style={{ fontSize: 12 }}>{look.data.season} · {look.data.finish} finish</span>
            {!look.data.inputs.face && (
              <Link to="/beauty/profile" style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-ink)' }}>
                Add photos for face-shape precision →
              </Link>
            )}
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 12px', color: 'var(--ink-soft)' }}>{look.data.explanation}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <div>
              <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Your colour palette</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                <div><b>Foundation:</b> {look.data.palette.foundation}</div>
                <div><b>Concealer:</b> {look.data.palette.concealer}</div>
                <div><b>Blush:</b> {look.data.palette.blush}</div>
                <div><b>Lips:</b> {look.data.palette.lips.join(' · ')}</div>
                <div><b>Eyes:</b> {look.data.palette.eyes.join(' · ')}</div>
                <div><b>Highlighter:</b> {look.data.palette.highlighter}</div>
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Technique, for your features</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {look.data.techniques.map((t) => (
                  <div key={t.area} style={{ fontSize: 12.5, lineHeight: 1.5 }}><b>{t.area}:</b> {t.tip}</div>
                ))}
              </div>
              {look.data.baseNotes.length > 0 && (
                <>
                  <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '10px 0 6px' }}>Base, for your skin</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.6 }}>
                    {look.data.baseNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 18, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <b style={{ fontSize: 14 }}>Makeup budget</b>
            <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>Allocated across a complete everyday look — base, eyes, lips &amp; cheeks.</p>
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 20, color: 'var(--accent-ink)' }}>₹{inr(budget)}</span>
        </div>
        <input type="range" aria-label="Makeup budget" min={1000} max={20000} step={500} value={budget} style={{ width: '100%', margin: '14px 0 2px', accentColor: 'var(--accent)' }}
          onChange={(e) => { const b = Number(e.target.value); setBudget(b); rebuild(b); }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}><span>₹1,000</span><span>₹20,000</span></div>
        <p style={{ fontSize: 12.5, marginTop: 8, color: over ? 'var(--danger-ink)' : 'var(--ok-ink)', fontWeight: over ? 600 : 400 }}>
          {over
            ? `A complete everyday look comes to ₹${inr(total)} — a little over your ₹${inr(budget)} budget. Raise it slightly, or switch a step to Budget.`
            : `Your ₹${inr(budget)} builds a complete look · ₹${inr(budget - total)} to spare. Raise it to upgrade tiers or add extras.`}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{ fontSize: 12.5, fontWeight: 600, padding: '8px 15px', borderRadius: 'var(--r-full)', cursor: 'pointer', font: 'inherit',
              border: `1px solid ${tab === t.key ? 'var(--accent)' : 'var(--line)'}`,
              background: tab === t.key ? 'var(--accent)' : 'var(--card)', color: tab === t.key ? 'var(--on-accent)' : 'var(--ink)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Same inversion as the food journal: the 240px floor won the phone.
        Class + fold in layout.css. */}
    <div className="mk-split">
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', background: 'var(--accent-soft)', borderRadius: 'var(--r-1)', padding: '10px 14px', marginBottom: 16 }}>
            ◈ Products below are matched to your <b>{(look.data?.finish ?? 'natural').toLowerCase()} finish</b> {occasion} look — shades from your {look.data?.season ?? 'colour'} palette above.
          </div>

          {SECTION_TITLES.map(([sec, title]) => {
            const rows = visible.filter((i) => i.section === sec);
            if (!rows.length) return null;
            return (
              <section key={sec} className="blk">
                <div className="blk-head"><h2>{title}</h2></div>
                {rows.map((it) => {
                  const t = tierOf(it.slot);
                  const eff = it.tiers[t];
                  const on = !!cart[it.slot];
                  const lab = TIER_LABEL[t];
                  return (
                    <div key={it.slot} className="card" style={{ marginBottom: 16, borderColor: on ? 'var(--accent)' : 'var(--line)', boxShadow: on ? 'inset 0 0 0 1px var(--accent)' : undefined }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <Thumb it={it} tier={eff} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent-ink)' }}>{it.slot}</div>
                          <h4 style={{ margin: '2px 0' }}>
                            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, color: 'var(--accent-ink)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 'var(--r-full)', marginRight: 6 }}>{eff.brand}</span>
                            {eff.name} <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-ink)' }}>⭐ Recommended</span>
                            {lab.text && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-full)', marginLeft: 6, background: lab.bg, color: lab.fg }}>{lab.text}</span>}
                          </h4>
                          <p className="muted" style={{ fontSize: 12 }}><span style={finishChip(it.finish)}>{it.finish}</span> · ★{it.derm} derm</p>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 20, color: 'var(--ink)' }}>₹{inr(eff.price)}</div>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink)', background: 'var(--accent-soft)', borderRadius: '0 8px 8px 0', borderLeft: '3px solid var(--accent)', padding: '8px 12px', margin: '8px 0' }}>
                        <b>Why this:</b> {it.why}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        <button type="button" className="btn btn-line btn-sm" onClick={() => setOpenCmp((o) => ({ ...o, [it.slot]: !o[it.slot] }))}>Compare price options</button>
                        <button type="button" className="btn btn-accent btn-sm" onClick={() => toggleCart(it.slot)}>{on ? '✓ In cart' : 'Add to Cart'}</button>
                      </div>
                      {openCmp[it.slot] && (
                        <div style={{ margin: '8px 0', border: '1px solid var(--line)', borderRadius: 11, overflow: 'hidden' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-soft)', padding: '8px 12px', background: 'var(--paper)', borderBottom: '1px solid var(--line)' }}>
                            Lower &amp; higher cost options in this category
                          </div>
                          {(['budget', 'ai', 'premium'] as TierKey[]).map((tk) => {
                            const tp = it.tiers[tk];
                            const sel = t === tk;
                            const diff = it.tiers.ai.price - tp.price;
                            const noteTxt = tk === 'budget' ? (diff > 0 ? `Save ₹${inr(diff)}` : '—') : tk === 'ai' ? 'Best match for your skin' : 'Luxury formulation';
                            const icon = tk === 'budget' ? '💰 Lower Price' : tk === 'ai' ? '⭐ AI Recommendation' : '👑 Premium Option';
                            return (
                              <button key={tk} type="button" onClick={() => setTier(it.slot, tk)}
                                style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr .7fr .9fr', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left',
                                  padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--ink)',
                                  background: sel ? 'var(--accent-soft)' : 'var(--card)', boxShadow: sel ? 'inset 3px 0 0 var(--accent)' : undefined }}>
                                <span style={{ fontWeight: 600 }}>{icon}</span>
                                <span style={{ color: 'var(--ink-soft)' }}>{tp.brand} {tp.name.split(' ').slice(0, 3).join(' ')}</span>
                                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }}>₹{inr(tp.price)}</span>
                                <span style={{ fontSize: 11, textAlign: 'right', color: tk === 'budget' && diff > 0 ? 'var(--ok-ink)' : 'var(--ink-soft)', fontWeight: tk === 'budget' && diff > 0 ? 600 : 400 }}>{noteTxt}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        <aside className="card" style={{ position: 'sticky', top: 'calc(var(--header-h) + 20px)' }}>
          <h4 style={{ marginBottom: 4 }}>Your Kit ({inCartSlots.length})</h4>
          <p style={{ margin: '0 0 12px' }}>
            <button type="button" onClick={() => { rebuild(budget); setNote(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0 }}>↺ Reset to my everyday look</button>
          </p>
          {note && <p style={{ fontSize: 12, color: 'var(--danger-ink)', fontWeight: 600, margin: '0 0 10px' }}>{note}</p>}
          <div className="rows" style={{ gap: 8 }}>
            {inCartSlots.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', padding: '16px 4px', textAlign: 'center' }}>
                Cart empty. <button type="button" onClick={() => rebuild(budget)} style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>restore your everyday look</button>.
              </div>
            ) : inCartSlots.map((s) => {
              const it = byId(s), t = tierOf(s), eff = it.tiers[t], lab = TIER_LABEL[t];
              return (
                <div key={s} className="row" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 10px' }}>
                  <div className="grow">
                    <div className="t" style={{ fontSize: 13 }}>{eff.name.split(' ').slice(0, 4).join(' ')}{lab.text && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r-full)', marginLeft: 6, background: lab.bg, color: lab.fg }}>{lab.text}</span>}</div>
                    <div className="m">{eff.brand}</div>
                  </div>
                  <b>₹{inr(eff.price)}</b>
                  <button type="button" onClick={() => toggleCart(s)} title="Remove"
                    style={{ minWidth: 44, minHeight: 44, marginLeft: 8, width: 22, height: 22, flex: '0 0 auto', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', borderRadius: 6, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              );
            })}
          </div>
          {inCartSlots.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span className="muted">Subtotal ({inCartSlots.length})</span><span>₹{inr(subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, color: 'var(--ok-ink)' }}><span>You Save</span><span>−₹{inr(save)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontFamily: 'var(--serif)', borderTop: '1px solid var(--line)', paddingTop: 10 }}><span>Total</span><span style={over ? { color: 'var(--danger-ink)', fontWeight: 600 } : undefined}>₹{inr(total)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 6 }}>
                <span className="muted">Budget</span>
                <span style={{ color: over ? 'var(--danger-ink)' : 'var(--ok-ink)', fontWeight: over ? 600 : 400 }}>{over ? `over by ₹${inr(total - budget)}` : `₹${inr(budget - total)} to spare`} · ₹{inr(budget)}</span>
              </div>
              {over && <div className="btn btn-line" style={{ width: '100%', justifyContent: 'center', marginTop: 10, opacity: .55, pointerEvents: 'none' }}>Over budget</div>}
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 14 }}>
                Together City doesn't sell makeup yet — this kit is a shopping list to take
                wherever you already shop. We'll tell you the day that changes.
              </p>
              <p style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 8 }}>
                Skincare you <em>can</em> order today: <Link to="/beauty/market" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>the Beauty Market</Link> —
                paid from your city wallet, and it turns up under My Orders.
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="trust">
        <span>◈ Built from your face analysis</span><span>◈ Occasion-adapted</span><span>◈ Budget · AI · Premium</span><span>◈ No biomarkers in makeup</span>
      </div>
    </div>
  );
}
