import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useBeautyProfile, useSaveBeautyProfile, useAnalyzeBeautyPhotos, useBeautyInsights, useBeautyHistory, useConditionSuggestions } from '../api';
import type { BeautyAssessment, BeautyReading, AssessLevel, BeautyProgressEntry } from '../api';

/** Assessment-level display meta for the timeline. */
const LEVEL_META: Record<string, { c: string; label: string }> = {
  good: { c: '#2e7d32', label: 'Good' }, monitor: { c: '#8a6d00', label: 'Monitor' },
  attention: { c: '#e65100', label: 'Attention' }, priority: { c: '#c62828', label: 'Priority' },
};
const dirMeta = (d: string) =>
  d === 'improved' ? { icon: '▲', c: '#1b7a3a' }
  : d === 'worse' ? { icon: '▼', c: '#c0392b' }
  : d === 'new' ? { icon: '＋', c: 'var(--muted)' } : { icon: '▬', c: 'var(--muted)' };

/** Permanent skin & hair timeline — baseline + every follow-up, with progress
 *  comparison and a monthly follow-up prompt. Nothing is ever overwritten. */
function SkinHairTimeline() {
  const q = useBeautyHistory();
  const [openId, setOpenId] = useState<string | null>(null);
  const d = q.data;
  if (!d || !d.hasHistory) return null;
  const entries = [...d.entries].reverse(); // newest first
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="eyebrow">🗓️ Skin &amp; hair timeline</div>

      {d.followUpDue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8, padding: '11px 14px', background: '#fff8e1', border: '1px solid #f0d68a', borderRadius: 12, fontSize: 12.5 }}>
          <span style={{ fontSize: 16 }}>📸</span>
          <span>It's been {d.daysSinceLast} days since your last assessment — upload a new set of photos to measure your progress. Optional, whenever you're ready.</span>
        </div>
      )}

      {d.comparison && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--accent-soft)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Progress vs last assessment</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: d.comparison.skinDelta >= 0 ? '#1b7a3a' : '#c0392b' }}>Skin {d.comparison.skinDelta >= 0 ? '+' : ''}{d.comparison.skinDelta}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: d.comparison.hairDelta >= 0 ? '#1b7a3a' : '#c0392b' }}>Hair {d.comparison.hairDelta >= 0 ? '+' : ''}{d.comparison.hairDelta}</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, margin: '8px 0 0' }}>{d.comparison.summary}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {[...d.comparison.skin, ...d.comparison.hair].filter((a) => a.direction === 'improved' || a.direction === 'worse').map((a) => {
              const m = dirMeta(a.direction);
              return <span key={a.key} style={{ fontSize: 11, fontWeight: 600, color: m.c, background: `${m.c}14`, borderRadius: 999, padding: '2px 9px' }}>{a.label} {m.icon}</span>;
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {entries.map((e) => {
          const isOpen = openId === e.id;
          return (
            <div key={e.id} style={{ borderTop: '1px solid var(--line)' }}>
              <button type="button" onClick={() => setOpenId(isOpen ? null : e.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 92 }}>{fmt(e.date)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: e.baseline ? '#8a4b00' : 'var(--accent)', background: e.baseline ? '#fff3e0' : 'var(--accent-soft)', borderRadius: 999, padding: '1px 9px' }}>{e.baseline ? 'Baseline · Month 0' : e.label}</span>
                <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>Skin {e.skinScore} · Hair {e.hairScore} {isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 0 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {(['skin', 'hair'] as const).map((part) => (
                    <div key={part}>
                      <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{part}</div>
                      {(e[part] ?? []).map((r) => {
                        const m = LEVEL_META[r.level] ?? LEVEL_META.monitor;
                        return <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0' }}><span>{r.label}</span><span style={{ color: m.c, fontWeight: 600 }}>{m.label}</span></div>;
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Every assessment is saved permanently — nothing is overwritten.</p>
    </div>
  );
}

/** Gender-aware Beauty avatar — VISUAL ONLY. Products, content and
 *  recommendations are never gated by gender; only the icon adapts. Male →
 *  masculine, female → feminine, unspecified → neutral (never a lipstick). */
function beautyAvatar(gender?: string): string {
  const g = (gender ?? '').trim().toLowerCase();
  if (g === 'male') return '👨';
  if (g === 'female') return '👩';
  return '🧑';
}

/** Biomarker labels for the correlation panel (Medical Hub → skin/hair). */
const MARKER_LABEL: Record<string, string> = {
  ferritin: 'Ferritin', hb: 'Hemoglobin', vitd: 'Vitamin D', b12: 'Vitamin B12',
  folate: 'Folate', hba1c: 'HbA1c', crp: 'CRP', zinc: 'Zinc',
};

/** Connect Medical Hub biomarkers to visible skin & hair changes, right on the
 *  Skin & Hair tab (e.g. low ferritin → shedding, high HbA1c → glycation). */
function BiomarkerCorrelation() {
  const q = useBeautyInsights();
  if (q.isError || !q.data) return null; // 403 (consent off) or no data → hide quietly
  const d = q.data;
  if (!d.hasPanel) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow">🩸 Biomarker correlation</div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.55 }}>
          Add a blood test in the <Link to="/medical/blood" style={{ color: 'var(--accent)', fontWeight: 600 }}>Medical Hub</Link> and we'll link markers like ferritin, vitamin D, HbA1c and CRP to your skin & hair here — for example, low ferritin → increased shedding, or raised HbA1c → glycation and loss of firmness.
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="eyebrow" style={{ margin: 0 }}>🩸 Biomarker correlation</div>
        {d.takenOn && <span className="muted" style={{ fontSize: 11.5 }}>from your panel · {d.takenOn}</span>}
      </div>
      {d.insights.length === 0 ? (
        <p style={{ fontSize: 13, marginTop: 8, color: '#2e7d32' }}>✓ No biomarker flags are affecting your skin or hair right now — a good foundation.</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {d.insights.map((i) => (
            <div key={i.marker} style={{ padding: '11px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5 }}>{MARKER_LABEL[i.marker] ?? i.marker} {i.status === 'high' ? '↑' : '↓'}</strong>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8a4b00', background: '#fff3e0', borderRadius: 999, padding: '1px 8px' }}>{i.concern}</span>
                {typeof i.value === 'number' && <span className="muted" style={{ fontSize: 11.5 }}>{i.value}</span>}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.5 }}>{i.mechanism}</p>
              {i.advice && <p style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.5 }}>💡 {i.advice}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>{d.source}</p>
    </div>
  );
}

/* ── option catalogs (spec) ── */
const LIFESTYLE = ['Mostly Indoors', 'Mixed', 'Mostly Outdoors'];
const SKIN_TYPES = ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive'];
const SKIN_TONES = ['Very Fair', 'Fair', 'Medium', 'Wheatish', 'Brown', 'Deep'];
const UNDERTONES = ['Warm', 'Cool', 'Neutral', "Don't Know"];
const SKIN_GOALS = ['Clear Acne', 'Reduce Acne Scars', 'Brighten Skin', 'Even Skin Tone', 'Reduce Pigmentation', 'Reduce Dark Spots', 'Reduce Tanning', 'Hydration', 'Anti Ageing', 'Fine Lines', 'Wrinkles', 'Firmness', 'Reduce Pores', 'Glass Skin', 'Oil Control', 'Calm Sensitive Skin', 'Reduce Redness', 'Glow', 'Skin Barrier Repair'];
const SKIN_CONCERNS = ['Acne', 'Pimples', 'Whiteheads', 'Blackheads', 'Dark Spots', 'Hyperpigmentation', 'Melasma', 'Rosacea', 'Eczema', 'Dryness', 'Flaky Skin', 'Oily Skin', 'Dull Skin', 'Large Pores', 'Fine Lines', 'Wrinkles', 'Uneven Texture', 'Sun Damage', 'Dark Circles', 'Puffy Eyes', 'Chapped Lips'];
const HAIR_TYPES = ['Straight', 'Wavy', 'Curly', 'Coily'];
const HAIR_THICK = ['Fine', 'Medium', 'Thick'];
const HAIR_DENSITY = ['Low', 'Medium', 'High'];
const HAIR_TEXTURE = ['Smooth', 'Normal', 'Frizzy', 'Dry', 'Damaged'];
const HAIR_GOALS = ['Hair Growth', 'Reduce Hair Fall', 'Increase Volume', 'Repair Damage', 'Smooth Hair', 'Reduce Frizz', 'Dandruff Control', 'Healthy Scalp', 'Shine', 'Curl Definition', 'Colour Protection', 'Stronger Hair'];
const HAIR_CONCERNS = ['Hair Fall', 'Thinning', 'Balding', 'Receding Hairline', 'Dandruff', 'Oily Scalp', 'Dry Scalp', 'Itchy Scalp', 'Split Ends', 'Breakage', 'Frizz', 'Grey Hair', 'Colour Damage'];
const SCALP_TYPES = ['Dry', 'Oily', 'Normal', 'Sensitive'];
const ROUTINE = ['Face Cleanser', 'Moisturizer', 'Sunscreen', 'Serum', 'Toner', 'Exfoliator', 'Face Mask', 'Hair Shampoo', 'Conditioner', 'Hair Oil', 'Hair Serum', 'Hair Mask'];
const ALLERGIES = ['Fragrance', 'Essential Oils', 'Retinol', 'Niacinamide', 'Vitamin C', 'Salicylic Acid', 'Benzoyl Peroxide', 'AHA', 'BHA', 'Sulphates', 'Silicones', 'Parabens', 'Alcohol', 'Coconut Oil', 'Nuts'];
const CONDITIONS = ['PCOS', 'Thyroid Disorders', 'Diabetes', 'Autoimmune Disorders', 'Pregnancy', 'Breastfeeding', 'Eczema', 'Psoriasis', 'Rosacea', 'Alopecia', 'Hormonal Acne', 'Seborrheic Dermatitis'];
const BUDGET = ['Under ₹500', '₹500–1000', '₹1000–2500', '₹2500–5000', '₹5000+'];
const PHOTO_SLOTS = [
  { key: 'face', label: 'Face (front)' }, { key: 'left', label: 'Left side' }, { key: 'right', label: 'Right side' },
  { key: 'hairline', label: 'Hairline' }, { key: 'top', label: 'Top of head' }, { key: 'scalp', label: 'Scalp close-up' },
];

const LEVEL: Record<AssessLevel, { color: string; soft: string; label: string }> = {
  good: { color: '#2e7d4f', soft: '#e6f2ea', label: 'Good' },
  monitor: { color: '#3f7d9a', soft: '#e6eff4', label: 'Monitor' },
  attention: { color: '#b0803a', soft: '#f7efe1', label: 'Needs Attention' },
  priority: { color: '#b0503e', soft: '#f8eae6', label: 'Priority' },
};

interface Form {
  age?: number; gender?: string; heightCm?: number; weightKg?: number; city?: string; occupation?: string; lifestyle?: string;
  skinType?: string; skinTone?: string; undertone?: string; skinGoals: string[]; skinConcerns: string[];
  hairType?: string; hairThickness?: string; hairDensity?: string; hairTexture?: string; hairGoals: string[]; hairConcerns: string[]; scalpType?: string;
  routine: string[]; allergies: string[]; medicalConditions: string[]; budget?: string;
}
const EMPTY: Form = { skinGoals: [], skinConcerns: [], hairGoals: [], hairConcerns: [], routine: [], allergies: [], medicalConditions: [] };

const fld: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)' }}>
      {on ? '✓ ' : ''}{label}
    </button>
  );
}
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <div className="eyebrow" style={{ margin: 0 }}>{title}</div>
        {note && <span className="muted" style={{ fontSize: 11.5 }}>{note}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

/* ── assessment renderer ── */
function ReadingRow({ r }: { r: BeautyReading }) {
  const lv = LEVEL[r.level];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: lv.color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div>
      </div>
      <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: lv.color, background: lv.soft, borderRadius: 999, padding: '3px 9px' }}>{lv.label}</span>
    </div>
  );
}
function AssessmentView({ a, analyzedAt }: { a: BeautyAssessment; analyzedAt?: string | null }) {
  const Block = ({ title, icon, part }: { title: string; icon: string; part: BeautyAssessment['skin'] }) => (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 16, margin: 0 }}>{icon} {title}</h3>
      <div style={{ marginTop: 6 }}>{part.readings.map((r) => <ReadingRow key={r.key} r={r} />)}</div>
      {part.recommendations.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Recommended routine</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {part.recommendations.map((x, i) => <li key={i} style={{ fontSize: 12.5 }}>{x}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
  return (
    <div>
      <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>Your assessment</h3>
          {analyzedAt && <span className="muted" style={{ fontSize: 11.5 }}>saved {new Date(analyzedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.55 }}>{a.summary}</p>
      </div>
      <Block title="Skin" icon="🧴" part={a.skin} />
      <Block title="Hair & scalp" icon="💇" part={a.hair} />

      {/* AM / PM / weekly routine */}
      {a.routine && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>🗓️ Your routine</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginTop: 10 }}>
            {([['☀️ Morning', a.routine.am], ['🌙 Evening', a.routine.pm], ['✨ Weekly', a.routine.weekly]] as const).map(([t, steps]) => (
              <div key={t}>
                <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{t}</div>
                <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {steps.map((s, i) => (
                    <li key={i} style={{ fontSize: 12.5 }}>{s.step}{s.ingredient && <span className="muted"> · {s.ingredient}</span>}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {a.routine.seasonal && (
            <p className="muted" style={{ fontSize: 12, margin: '12px 0 0', paddingTop: 10, borderTop: '1px solid var(--line)' }}>🌦️ {a.routine.seasonal}</p>
          )}
        </div>
      )}

      {/* Ingredients — why for you */}
      {a.ingredients?.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>🧪 Ingredients for you</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {a.ingredients.map((ing, i) => (
              <div key={i} style={{ borderTop: i ? '1px solid var(--line)' : 'none', paddingTop: i ? 8 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{ing.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{ing.why}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.cautions.length > 0 && (
        <div className="card" style={{ background: '#fff8e1', borderLeft: '3px solid #f9a825' }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Good to know</div>
          {a.cautions.map((c, i) => <p key={i} className="muted" style={{ fontSize: 12, margin: '3px 0' }}>· {c}</p>)}
        </div>
      )}
    </div>
  );
}

/* ── weekly progress + before/after ── */
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
function ProgressView({ entries }: { entries: BeautyProgressEntry[] }) {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const [bi, setBi] = useState(0);
  const [ai, setAi] = useState(Math.max(0, sorted.length - 1));
  if (sorted.length === 0) return null;
  const before = sorted[Math.min(bi, sorted.length - 1)];
  const after = sorted[Math.min(ai, sorted.length - 1)];
  const resolved = before.findings.filter((f) => !after.findings.includes(f));
  const appeared = after.findings.filter((f) => !before.findings.includes(f));
  const delta = after.score - before.score;
  const Pane = ({ title, e, idx, set }: { title: string; e: BeautyProgressEntry; idx: number; set: (n: number) => void }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <select value={idx} onChange={(ev) => set(+ev.target.value)} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 8px', fontSize: 11.5, background: 'var(--paper)', fontFamily: 'inherit', marginBottom: 6 }}>
        {sorted.map((s, i) => <option key={s.id} value={i}>{title}: {fmtDate(s.date)}</option>)}
      </select>
      <div style={{ aspectRatio: '1 / 1', borderRadius: 12, border: '1px solid var(--line)', background: e.thumb ? `center/cover no-repeat url(${e.thumb})` : 'var(--paper)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {!e.thumb && <span className="muted" style={{ fontSize: 11, paddingBottom: 8 }}>no photo</span>}
        <span style={{ background: 'rgba(20,18,14,.7)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, margin: 6 }}>Score {e.score}</span>
      </div>
    </div>
  );
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>📈 Progress timeline</h3>
        <span className="muted" style={{ fontSize: 11.5 }}>{sorted.length} check-in{sorted.length === 1 ? '' : 's'} · re-upload weekly to track</span>
      </div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 0 4px' }}>
        {sorted.map((e) => (
          <div key={e.id} style={{ flex: 'none', width: 84, textAlign: 'center' }}>
            <div style={{ width: 84, height: 84, borderRadius: 12, border: '1px solid var(--line)', background: e.thumb ? `center/cover no-repeat url(${e.thumb})` : 'var(--paper)' }} />
            <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>{e.score}</div>
            <div className="muted" style={{ fontSize: 10 }}>{fmtDate(e.date).replace(/ \d{4}$/, '')}</div>
          </div>
        ))}
      </div>
      {sorted.length >= 2 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Before / after</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Pane title="Before" e={before} idx={bi} set={setBi} />
            <div style={{ alignSelf: 'center', textAlign: 'center', flex: 'none' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: delta > 0 ? '#2e7d4f' : delta < 0 ? '#b0503e' : 'var(--muted)' }}>{delta > 0 ? `+${delta}` : delta}</div>
              <div className="muted" style={{ fontSize: 10 }}>score</div>
            </div>
            <Pane title="After" e={after} idx={ai} set={setAi} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
            {resolved.length > 0 && <span style={{ color: '#2e7d4f', fontWeight: 600 }}>✓ Improved: {resolved.join(', ')}</span>}
            {appeared.length > 0 && <span style={{ color: '#b0803a', fontWeight: 600 }}>▲ New: {appeared.join(', ')}</span>}
            {resolved.length === 0 && appeared.length === 0 && <span className="muted">No change in detected concerns between these check-ins.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── page ── */
export function Profile() {
  const profile = useBeautyProfile();
  const save = useSaveBeautyProfile();
  const analyze = useAnalyzeBeautyPhotos();
  const [tab, setTab] = useState<'photos' | 'profile'>('photos');
  const [f, setF] = useState<Form>(EMPTY);
  const [pics, setPics] = useState<Record<string, { preview: string; base64: string; mediaType: string }>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (profile.data?.profile && Object.keys(profile.data.profile).length) {
      setF({ ...EMPTY, ...(profile.data.profile as Partial<Form>) });
    }
  }, [profile.data]);

  // Auto-select lab-supported medical conditions (Diabetes, Thyroid) once the
  // profile + suggestions have loaded. Applied a single time so the user can
  // freely deselect afterwards; confirmed manual selections are never removed.
  const conditions = useConditionSuggestions();
  const appliedConditions = useRef(false);
  useEffect(() => {
    if (appliedConditions.current) return;
    if (!profile.data) return;
    const chips = conditions.data?.autoSelectChips;
    if (!chips || !chips.length) return;
    appliedConditions.current = true;
    setF((prev) => {
      const cur = new Set(prev.medicalConditions ?? []);
      let changed = false;
      for (const c of chips) if (!cur.has(c)) { cur.add(c); changed = true; }
      return changed ? { ...prev, medicalConditions: [...cur] } : prev;
    });
  }, [conditions.data, profile.data]);

  if (profile.isLoading) return <Spinner label="Loading your beauty profile…" />;
  if (profile.isError) return <EmptyState title="Couldn't load your profile" hint="Start the backend and reload." />;

  const analysis = profile.data?.analysis ?? null;
  const analyzedAt = profile.data?.analyzedAt ?? null;
  const aiEnabled = profile.data?.aiEnabled ?? false;
  const progress = profile.data?.progress ?? [];
  const warning = analyze.data?.warning;

  const set = (k: keyof Form, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const single = (k: keyof Form, v: string) => set(k, f[k] === v ? undefined : v);
  const multi = (k: keyof Form, v: string) => set(k, ((f[k] as string[]) ?? []).includes(v) ? (f[k] as string[]).filter((x) => x !== v) : [...((f[k] as string[]) ?? []), v]);
  const isOn = (k: keyof Form, v: string) => (Array.isArray(f[k]) ? (f[k] as string[]).includes(v) : f[k] === v);

  const onPic = (slot: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      const base64 = url.split(',')[1] ?? '';
      setPics((p) => ({ ...p, [slot]: { preview: url, base64, mediaType: file.type || 'image/jpeg' } }));
    };
    reader.readAsDataURL(file);
  };
  // Downscale one photo to a small JPEG thumbnail for the before/after timeline.
  const makeThumb = (dataUrl: string): Promise<string> => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 240;
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return resolve('');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });

  const runAnalysis = async () => {
    const entries = Object.entries(pics);
    const photos = entries.map(([slot, v]) => ({ slot, base64: v.base64, mediaType: v.mediaType }));
    if (!photos.length) return;
    const facePic = pics.face ?? entries[0]?.[1];
    const thumb = facePic ? await makeThumb(facePic.preview) : undefined;
    analyze.mutate({ photos, thumb: thumb || undefined }, { onSuccess: () => setPics({}) });
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Beauty Market · Skin &amp; Hair</div>
      <h1 style={{ fontSize: 26, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden style={{ fontSize: 24 }}>{beautyAvatar(f.gender)}</span>
        Your skin &amp; hair
      </h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Add photos for a one-time analysis, and fill in your profile — we generate a personalised skin &amp; hair assessment and tune the market to you.
      </p>

      {/* tabs */}
      <div style={{ display: 'inline-flex', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: 3, marginBottom: 16 }}>
        {(['photos', 'profile'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 18px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              background: tab === t ? 'var(--card)' : 'transparent', color: tab === t ? 'var(--ink)' : 'var(--muted)', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
            {t === 'photos' ? '📸 Photos' : '📝 Profile'}
          </button>
        ))}
      </div>

      {tab === 'photos' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Upload photos <span className="muted" style={{ fontWeight: 400 }}>· analysed once</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
              {PHOTO_SLOTS.map((s) => {
                const pic = pics[s.key];
                return (
                  <div key={s.key} onClick={() => fileRefs.current[s.key]?.click()}
                    style={{ cursor: 'pointer', border: '2px dashed var(--line)', borderRadius: 12, aspectRatio: '1 / 1', overflow: 'hidden', position: 'relative', background: pic ? `center/cover no-repeat url(${pic.preview})` : 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {!pic && <div style={{ textAlign: 'center', padding: 8 }}><div style={{ fontSize: 22 }}>＋</div><div className="muted" style={{ fontSize: 11 }}>{s.label}</div></div>}
                    {pic && <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(20,18,14,.6)', color: '#fff', fontSize: 10.5, padding: '3px 6px', textAlign: 'center' }}>{s.label}</span>}
                    <input ref={(el) => { fileRefs.current[s.key] = el; }} type="file" accept="image/*" onChange={(e) => onPic(s.key, e)} style={{ display: 'none' }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: '10px 12px', background: 'var(--paper)', borderRadius: 10 }}>
              <span style={{ fontSize: 15 }}>📷</span>
              <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
                Upload clear, well-lit photos of yourself with a bare face/scalp. <strong>No beauty filters and no AI-generated images</strong> — they distort the analysis and will be rejected. {aiEnabled ? 'AI reviews clear photos once to spot visible issues (acne, pigmentation, texture, pores, redness, hydration, hair density & scalp).' : 'Photos build your before/after alongside your profile assessment.'} Full images aren't stored — only a small unedited thumbnail for your timeline. <strong>🔒 Your photos are completely private: no one but you ever sees them</strong> — they're never shown to other users, never shared, and never used for anything except your own analysis.
              </p>
            </div>
            {warning && (
              <p style={{ fontSize: 12.5, color: '#b0503e', fontWeight: 600, margin: '10px 0 0' }}>⚠️ {warning}</p>
            )}
            <Button variant="accent" style={{ marginTop: 12 }} disabled={analyze.isPending || Object.keys(pics).length === 0} onClick={runAnalysis}>
              {analyze.isPending ? 'Analysing…' : `Analyse & save${progress.length ? ' this week' : ''}`}
            </Button>
          </div>

          {progress.length > 0 && <ProgressView entries={progress} />}

          {analysis ? <AssessmentView a={analysis} analyzedAt={analyzedAt} /> : (
            <EmptyState icon="✨" title="No assessment yet" hint="Add photos and analyse, or fill in your profile and save — your assessment appears here." />
          )}

          {/* Permanent, dated assessment history + progress comparison. */}
          <SkinHairTimeline />

          {/* Medical Hub biomarkers → skin & hair, right here on the profile tab. */}
          <BiomarkerCorrelation />
        </div>
      )}

      {tab === 'profile' && (
        <div>
          {/* 1 Basic */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Basic profile</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
              <input style={fld} type="number" placeholder="Age" value={f.age ?? ''} onChange={(e) => set('age', e.target.value ? +e.target.value : undefined)} />
              <select style={fld} value={f.gender ?? ''} onChange={(e) => set('gender', e.target.value || undefined)}><option value="">Gender</option><option>Female</option><option>Male</option><option>Other</option></select>
              <input style={fld} type="number" placeholder="Height (cm)" value={f.heightCm ?? ''} onChange={(e) => set('heightCm', e.target.value ? +e.target.value : undefined)} />
              <input style={fld} type="number" placeholder="Weight (kg)" value={f.weightKg ?? ''} onChange={(e) => set('weightKg', e.target.value ? +e.target.value : undefined)} />
              <input style={fld} placeholder="City / climate" value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} />
              <input style={fld} placeholder="Occupation" value={f.occupation ?? ''} onChange={(e) => set('occupation', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {LIFESTYLE.map((l) => <Chip key={l} on={isOn('lifestyle', l)} label={l} onClick={() => single('lifestyle', l)} />)}
            </div>
          </div>

          <Section title="Skin type">{SKIN_TYPES.map((x) => <Chip key={x} on={isOn('skinType', x)} label={x} onClick={() => single('skinType', x)} />)}</Section>
          <Section title="Skin tone">{SKIN_TONES.map((x) => <Chip key={x} on={isOn('skinTone', x)} label={x} onClick={() => single('skinTone', x)} />)}</Section>
          <Section title="Undertone">{UNDERTONES.map((x) => <Chip key={x} on={isOn('undertone', x)} label={x} onClick={() => single('undertone', x)} />)}</Section>
          <Section title="Skin goals" note="pick any">{SKIN_GOALS.map((x) => <Chip key={x} on={isOn('skinGoals', x)} label={x} onClick={() => multi('skinGoals', x)} />)}</Section>
          <Section title="Current skin concerns" note="pick any">{SKIN_CONCERNS.map((x) => <Chip key={x} on={isOn('skinConcerns', x)} label={x} onClick={() => multi('skinConcerns', x)} />)}</Section>
          <Section title="Hair type">{HAIR_TYPES.map((x) => <Chip key={x} on={isOn('hairType', x)} label={x} onClick={() => single('hairType', x)} />)}</Section>
          <Section title="Hair thickness">{HAIR_THICK.map((x) => <Chip key={x} on={isOn('hairThickness', x)} label={x} onClick={() => single('hairThickness', x)} />)}</Section>
          <Section title="Hair density">{HAIR_DENSITY.map((x) => <Chip key={x} on={isOn('hairDensity', x)} label={x} onClick={() => single('hairDensity', x)} />)}</Section>
          <Section title="Hair texture">{HAIR_TEXTURE.map((x) => <Chip key={x} on={isOn('hairTexture', x)} label={x} onClick={() => single('hairTexture', x)} />)}</Section>
          <Section title="Hair goals" note="pick any">{HAIR_GOALS.map((x) => <Chip key={x} on={isOn('hairGoals', x)} label={x} onClick={() => multi('hairGoals', x)} />)}</Section>
          <Section title="Hair concerns" note="pick any">{HAIR_CONCERNS.map((x) => <Chip key={x} on={isOn('hairConcerns', x)} label={x} onClick={() => multi('hairConcerns', x)} />)}</Section>
          <Section title="Scalp type">{SCALP_TYPES.map((x) => <Chip key={x} on={isOn('scalpType', x)} label={x} onClick={() => single('scalpType', x)} />)}</Section>
          <Section title="Current routine" note="what you use now">{ROUTINE.map((x) => <Chip key={x} on={isOn('routine', x)} label={x} onClick={() => multi('routine', x)} />)}</Section>
          <Section title="Allergies & sensitivities" note="we'll avoid these">{ALLERGIES.map((x) => <Chip key={x} on={isOn('allergies', x)} label={x} onClick={() => multi('allergies', x)} />)}</Section>
          {(() => {
            const sug = conditions.data;
            const chipReason = new Map<string, string>();
            for (const s of sug?.suggestions ?? []) if (s.chip) chipReason.set(s.chip, s.reason);
            const labNotes = (sug?.suggestions ?? []).filter((s) => !s.chip);
            const preSelected = [...chipReason.keys()];
            return (
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div className="eyebrow" style={{ margin: 0 }}>Medical conditions</div>
                  <span className="muted" style={{ fontSize: 11.5 }}>pick any{chipReason.size > 0 ? ' — 🩸 marks ones your labs support' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CONDITIONS.map((x) => {
                    const on = isOn('medicalConditions', x);
                    const reason = chipReason.get(x);
                    return (
                      <button key={x} type="button" onClick={() => multi('medicalConditions', x)} title={reason || undefined}
                        style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                          border: `1.5px solid ${on ? 'var(--accent)' : reason ? '#c026d3' : 'var(--line)'}`,
                          background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : reason ? '#a21caf' : 'var(--ink-soft)' }}>
                        {on ? '✓ ' : ''}{x}{reason ? ' 🩸' : ''}
                      </button>
                    );
                  })}
                </div>
                {(labNotes.length > 0 || preSelected.length > 0 || sug?.alopeciaHint) && (
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(192,38,211,0.06)', border: '1px solid rgba(192,38,211,0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#a21caf', marginBottom: 6 }}>🩸 From your labs</div>
                    {preSelected.length > 0 && (
                      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: (labNotes.length || sug?.alopeciaHint) ? 6 : 0 }}>
                        We pre-selected {preSelected.join(', ')} based on your blood tests. Every pick is editable — uncheck any that don't apply.
                      </div>
                    )}
                    {labNotes.map((s) => (
                      <div key={s.key} className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>• {s.reason}</div>
                    ))}
                    {sug?.alopeciaHint && <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>• {sug.alopeciaHint}</div>}
                  </div>
                )}
              </div>
            );
          })()}
          <Section title="Monthly beauty budget">{BUDGET.map((x) => <Chip key={x} on={isOn('budget', x)} label={x} onClick={() => single('budget', x)} />)}</Section>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '4px 0 22px' }}>
            <Button variant="accent" disabled={save.isPending} onClick={() => save.mutate(f as unknown as Record<string, unknown>, { onSuccess: () => setTab('photos') })}>
              {save.isPending ? 'Saving…' : 'Save profile & get assessment'}
            </Button>
            {save.isSuccess && <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>✓ Saved — assessment updated</span>}
          </div>

          {analysis && <AssessmentView a={analysis} analyzedAt={analyzedAt} />}
        </div>
      )}
    </div>
  );
}
