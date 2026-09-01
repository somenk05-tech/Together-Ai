import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@/components/ui';
import { useBeautyBudget, useBeautyProfile, useSaveBeautyProfile, useAnalyzeBeautyPhotos, useBeautyInsights, useBeautyHistory, useConditionSuggestions, useDeleteLatestAssessment } from '../api';
import type { BeautyAssessment, BeautyReading, AssessLevel, BeautyProgressEntry } from '../api';
import { useMasterProfile } from '@/features/profile/hooks';
import { MasterLockedNote, masterLockedStyle } from '@/features/profile/MasterLockedField';
import { PHOTO_SLOTS, PhotoGrid, missingPhotos, photosReady, requiredCount, type Shot } from '../components/PhotoStudio';
import { AssessmentPlate } from '../components/AssessmentPlate';
import { BeautyLeaf, BeautyPlate } from '../components/Plates';
import { BudgetPanel, budgetSummary } from '../components/BudgetPanel';

const PHOTOS_NEEDED = PHOTO_SLOTS.filter((s) => s.required).length;

/** Assessment-level display meta for the timeline. */
const LEVEL_META: Record<string, { c: string; label: string }> = {
  good: { c: 'var(--ok-ink)', label: 'Good' }, monitor: { c: 'var(--warn-ink)', label: 'Monitor' },
  attention: { c: 'var(--warn-ink)', label: 'Attention' }, priority: { c: 'var(--danger-ink)', label: 'Priority' },
};
const dirMeta = (d: string) =>
  d === 'improved' ? { icon: '▲', c: 'var(--ok-ink)' }
  : d === 'worse' ? { icon: '▼', c: 'var(--danger-ink)' }
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
    <div className="beauty-sheet">
      <div className="beauty-rule">
        <span>Skin &amp; hair timeline</span>
        <span />
        <span>{entries.length} assessment{entries.length === 1 ? '' : 's'}</span>
      </div>

      {d.followUpDue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8, padding: '11px 14px', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 12, fontSize: 12.5 }}>
          <span style={{ fontSize: 16 }}>📸</span>
          <span>It's been {d.daysSinceLast} days since your last assessment — new photos will measure your progress — whenever you're ready.</span>
        </div>
      )}

      {d.comparison && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--accent-soft)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Progress vs last assessment</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: d.comparison.skinDelta >= 0 ? 'var(--ok-ink)' : 'var(--danger-ink)' }}>Skin {d.comparison.skinDelta >= 0 ? '+' : ''}{d.comparison.skinDelta}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: d.comparison.hairDelta >= 0 ? 'var(--ok-ink)' : 'var(--danger-ink)' }}>Hair {d.comparison.hairDelta >= 0 ? '+' : ''}{d.comparison.hairDelta}</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, margin: '8px 0 0' }}>{d.comparison.summary}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {[...d.comparison.skin, ...d.comparison.hair].filter((a) => a.direction === 'improved' || a.direction === 'worse').map((a) => {
              const m = dirMeta(a.direction);
              return <span key={a.key} style={{ fontSize: 11, fontWeight: 600, color: m.c, background: `${m.c}14`, borderRadius: 'var(--r-full)', padding: '2px 9px' }}>{a.label} {m.icon}</span>;
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
                <span style={{ fontSize: 11, fontWeight: 700, color: e.baseline ? 'var(--warn-ink)' : 'var(--accent)', background: e.baseline ? 'var(--warn-soft)' : 'var(--accent-soft)', borderRadius: 'var(--r-full)', padding: '1px 9px' }}>{e.baseline ? 'Baseline · Month 0' : e.label}</span>
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

/* THE GENDERED AVATAR IS GONE WITH THE HEADING IT SAT IN, and the rule it
   existed to keep is unchanged: nothing in this hub is gated by gender, only
   ever illustrated by it. It was one emoji beside "Your skin & hair" that
   picked 👨 / 👩 / 🧑 from the master profile, and the masthead it lived in is
   now the owner's poster — SKIN · BEAUTY · CARE over a display title, with no
   figure in it at all, which is the same neutrality arrived at by composition
   rather than by a careful default. If a face ever returns here it does not
   need this function back; it needs the rule, which is written down. */

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
      <div className="beauty-sheet">
        <div className="beauty-rule"><span>Biomarker correlation</span><span /><span /></div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.55 }}>
          Add a blood test in the <Link to="/medical/blood" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Medical Hub</Link> and we'll link markers like ferritin and HbA1c to your skin & hair — low ferritin → shedding, for example.
        </p>
      </div>
    );
  }
  /**
   * FOLDED, LIKE EVERY OTHER READ SECTION ON THIS PAGE.
   *
   * It is the longest block here — a marker, a chip, a mechanism and an advice
   * line each, from a panel drawn weeks ago — and it is read once and then
   * scrolled past on every visit after that. That is the exact shape this
   * page's folds exist for.
   *
   * THE META LINE CARRIES WHAT THE HEADER USED TO. A closed section saying only
   * "Biomarker correlation" gives nobody a reason to open it, so the count of
   * markers and the date of the panel move into it — the date was in the rule's
   * right-hand cell, and it is the thing that tells somebody whether this is
   * about a test they remember taking.
   *
   * The no-panel branch above is NOT folded, deliberately: it is three lines
   * inviting somebody to add a blood test, and a fold is a good way to make an
   * invitation invisible.
   */
  const flagged = d.insights.length;
  const meta = [
    flagged === 0 ? 'Nothing flagged' : `${flagged} marker${flagged === 1 ? '' : 's'} to know about`,
    d.takenOn ? `from your panel · ${d.takenOn}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <BeautyLeaf title="Biomarker correlation" meta={meta}>
      {d.insights.length === 0 ? (
        <p style={{ fontSize: 13, marginTop: 8, color: 'var(--ok-ink)' }}>✓ No biomarker flags affecting your skin or hair.</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {d.insights.map((i) => (
            <div key={i.marker} style={{ padding: '11px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5 }}>{MARKER_LABEL[i.marker] ?? i.marker} {i.status === 'high' ? '↑' : '↓'}</strong>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warn-ink)', background: 'var(--warn-soft)', borderRadius: 'var(--r-full)', padding: '1px 8px' }}>{i.concern}</span>
                {typeof i.value === 'number' && <span className="muted" style={{ fontSize: 11.5 }}>{i.value}</span>}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.5 }}>{i.mechanism}</p>
              {i.advice && <p style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.5 }}>💡 {i.advice}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>{d.source}</p>
    </BeautyLeaf>
  );
}

/* ── option catalogs (spec) ── */
const LIFESTYLE = ['Mostly Indoors', 'Mixed', 'Mostly Outdoors', "Don't know"];
const SKIN_TYPES = ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive', "Don't know"];
const SKIN_TONES = ['Very Fair', 'Fair', 'Medium', 'Wheatish', 'Brown', 'Deep', "Don't know"];
const UNDERTONES = ['Warm', 'Cool', 'Neutral', "Don't Know"];
const SKIN_GOALS = ['Clear Acne', 'Reduce Acne Scars', 'Brighten Skin', 'Even Skin Tone', 'Reduce Pigmentation', 'Reduce Dark Spots', 'Reduce Tanning', 'Hydration', 'Anti Ageing', 'Fine Lines', 'Wrinkles', 'Firmness', 'Reduce Pores', 'Glass Skin', 'Oil Control', 'Calm Sensitive Skin', 'Reduce Redness', 'Glow', 'Skin Barrier Repair'];
const SKIN_CONCERNS = ['Acne', 'Pimples', 'Whiteheads', 'Blackheads', 'Dark Spots', 'Hyperpigmentation', 'Melasma', 'Rosacea', 'Eczema', 'Dryness', 'Flaky Skin', 'Oily Skin', 'Dull Skin', 'Large Pores', 'Fine Lines', 'Wrinkles', 'Uneven Texture', 'Sun Damage', 'Dark Circles', 'Puffy Eyes', 'Chapped Lips'];
const HAIR_TYPES = ['Straight', 'Wavy', 'Curly', 'Coily', "Don't know"];
const HAIR_THICK = ['Fine', 'Medium', 'Thick', "Don't know"];
const HAIR_DENSITY = ['Low', 'Medium', 'High', "Don't know"];
const HAIR_TEXTURE = ['Smooth', 'Normal', 'Frizzy', 'Dry', 'Damaged', "Don't know"];
const HAIR_GOALS = ['Hair Growth', 'Reduce Hair Fall', 'Increase Volume', 'Repair Damage', 'Smooth Hair', 'Reduce Frizz', 'Dandruff Control', 'Healthy Scalp', 'Shine', 'Curl Definition', 'Colour Protection', 'Stronger Hair'];
const HAIR_CONCERNS = ['Hair Fall', 'Thinning', 'Balding', 'Receding Hairline', 'Dandruff', 'Oily Scalp', 'Dry Scalp', 'Itchy Scalp', 'Split Ends', 'Breakage', 'Frizz', 'Grey Hair', 'Colour Damage'];
const SCALP_TYPES = ['Dry', 'Oily', 'Normal', 'Sensitive', "Don't know"];
const ROUTINE = ['Face Cleanser', 'Moisturizer', 'Sunscreen', 'Serum', 'Toner', 'Exfoliator', 'Face Mask', 'Hair Shampoo', 'Conditioner', 'Hair Oil', 'Hair Serum', 'Hair Mask'];
const ALLERGIES = ['Fragrance', 'Essential Oils', 'Retinol', 'Niacinamide', 'Vitamin C', 'Salicylic Acid', 'Benzoyl Peroxide', 'AHA', 'BHA', 'Sulphates', 'Silicones', 'Parabens', 'Alcohol', 'Coconut Oil', 'Nuts'];
const CONDITIONS = ['PCOS', 'Thyroid Disorders', 'Diabetes', 'Autoimmune Disorders', 'Pregnancy', 'Breastfeeding', 'Eczema', 'Psoriasis', 'Rosacea', 'Alopecia', 'Hormonal Acne', 'Seborrheic Dermatitis'];
const LEVEL: Record<AssessLevel, { color: string; soft: string; label: string }> = {
  good: { color: 'var(--ok-ink)', soft: 'var(--ok-soft)', label: 'Good' },
  monitor: { color: 'var(--info-ink)', soft: 'var(--info-soft)', label: 'Monitor' },
  attention: { color: 'var(--warn-ink)', soft: 'var(--warn-soft)', label: 'Needs Attention' },
  priority: { color: 'var(--danger-ink)', soft: 'var(--danger-soft)', label: 'Priority' },
};

interface Form {
  age?: number; gender?: string; heightCm?: number; weightKg?: number; city?: string; occupation?: string; lifestyle?: string;
  skinType?: string; skinTone?: string; undertone?: string; skinGoals: string[]; skinConcerns: string[];
  hairType?: string; hairThickness?: string; hairDensity?: string; hairTexture?: string; hairGoals: string[]; hairConcerns: string[]; scalpType?: string;
  routine: string[]; allergies: string[]; medicalConditions: string[]; budget?: string;
}
const EMPTY: Form = { skinGoals: [], skinConcerns: [], hairGoals: [], hairConcerns: [], routine: [], allergies: [], medicalConditions: [] };

/** Onboarding completion: every one of these 18 must be answered ("Don't know" /
 *  "None of these" count as answers) before the AI analysis unlocks. */
const NONE = 'None of these';
/**
 * THE BUDGET IS NOT ONE OF THESE ANY MORE, AND THAT IS THE WHOLE FIX.
 *
 * It was asked twice: a row of six range chips at the foot of this form, and
 * the real budget panel — a slider, a live plan, the per-category split — in
 * its own plate on the other tab. Two questions, one answer, and the weaker of
 * them was the one blocking the form from ever being finished.
 *
 * REMOVING THE CHIPS MEANS REMOVING THE REQUIREMENT, or the count never reaches
 * its total, the form never collapses and the analysis stays locked behind a
 * question that no longer exists on the page. That is the trap in deleting a
 * field: the field goes and the gate it fed stays.
 */
const REQUIRED_SINGLE: (keyof Form)[] = ['gender', 'lifestyle', 'skinType', 'skinTone', 'undertone', 'hairType', 'hairThickness', 'hairDensity', 'hairTexture', 'scalpType'];
const REQUIRED_MULTI: (keyof Form)[] = ['skinGoals', 'skinConcerns', 'hairGoals', 'hairConcerns', 'routine', 'allergies', 'medicalConditions'];
const REQUIRED_LABEL: Partial<Record<keyof Form, string>> = {
  gender: 'Gender', lifestyle: 'Lifestyle', skinType: 'Skin type', skinTone: 'Skin tone', undertone: 'Undertone',
  hairType: 'Hair type', hairThickness: 'Hair thickness', hairDensity: 'Hair density', hairTexture: 'Hair texture',
  scalpType: 'Scalp type', skinGoals: 'Skin goals', skinConcerns: 'Skin concerns',
  hairGoals: 'Hair goals', hairConcerns: 'Hair concerns', routine: 'Current routine', allergies: 'Allergies', medicalConditions: 'Medical conditions',
};

const fld: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 'var(--r-1)', padding: '9px 12px', fontSize: 13.5, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '6px 13px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
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
      <div className="flex-min">
        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
        <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div>
      </div>
      <span style={{ flex: 'none', fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: lv.color, background: lv.soft, borderRadius: 'var(--r-full)', padding: '3px 9px' }}>{lv.label}</span>
    </div>
  );
}
/** "3 to work on", or "all good" — what a closed section is still telling you. */
function readingSummary(part: BeautyAssessment['skin']): string {
  const n = part.readings.length;
  const flagged = part.readings.filter((r) => r.level !== 'good').length;
  return `${n} reading${n === 1 ? '' : 's'} · ${flagged === 0 ? 'all good' : `${flagged} to work on`}`;
}

function AssessmentView({ a, analyzedAt }: { a: BeautyAssessment; analyzedAt?: string | null }) {
  /**
   * SET AS AN INDEX, NOT AS THREE MORE POSTERS AND NOT AS THREE CARDS.
   *
   * These are the CONTENTS of the analysis the page is named after — not four
   * more chapters of it. Given plates of their own the page becomes seven
   * posters in a column; given the city's rounded card they are the one thing
   * on the page from a different design. A printed contents page is what they
   * actually are, and it is the cheapest of the three.
   *
   * They are read once and then scrolled past forever, so they are closed:
   * seven readings, five readings and nine ingredients is three screens of the
   * same answer standing between somebody and the two things on this page that
   * change — the photographs and the budget.
   *
   * A CLOSED SECTION THAT SAYS ONLY ITS OWN NAME IS A SECTION NOBODY OPENS,
   * because nothing outside it says whether anything in it needs them.
   * "7 readings · 3 to work on" is the reason to open it; "5 readings · all
   * good" is a complete answer without opening anything.
   */
  const Block = ({ title, part }: { title: string; part: BeautyAssessment['skin'] }) => (
    <BeautyLeaf title={title} meta={readingSummary(part)}>
      <div>{part.readings.map((r) => <ReadingRow key={r.key} r={r} />)}</div>
      {part.recommendations.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Recommended routine</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {part.recommendations.map((x, i) => <li key={i} style={{ fontSize: 12.5 }}>{x}</li>)}
          </ul>
        </div>
      )}
    </BeautyLeaf>
  );
  return (
    <div className="beauty-index">
      {/* THE SUMMARY IS THE ONE PART NOBODY SHOULD HAVE TO OPEN, so it is not
          in the index — it is the lede above it, on the ground, with no card
          round it. It was a rounded card with a coloured bar down one side,
          which is the city's "notice" idiom and made the answer look like an
          alert about itself. */}
      <div className="beauty-rule">
        <span>Your assessment</span>
        <span />
        <span>{analyzedAt ? `Saved ${new Date(analyzedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>
      </div>
      {/* THE ANSWER IS SET, NOT PRINTED — but only when there is something to
          set. The well-balanced assessment has no findings, and a display plate
          reading "." over an italic line is a rendering failure with a border
          round it. An assessment saved before the server split the sentence has
          its focus derived on read, so this is a branch about CONTENT and not
          about deployment order. The lede stays as what it always was: the
          paragraph, for the case that is a paragraph. */}
      {a.focus?.length
        ? <AssessmentPlate focus={a.focus} note={a.note ?? ''} />
        : <p className="beauty-lede">{a.summary}</p>}
      <Block title="Skin" part={a.skin} />
      <Block title="Hair &amp; scalp" part={a.hair} />

      {/* THE ROUTINE IS NOT HERE ANY MORE, AND IT WAS THE SECOND OF TWO.
          This card listed "Gentle cleanser · Vitamin-C serum · Moisturiser" as
          plain steps, under a heading called "Your routine", on a page called
          Skin & Hair Profile — while tab 02, also called "Your Routine", holds
          the real one: the same steps as actual products, with brands, prices,
          order, instructions, frequency and per-step warnings. Two answers to
          one question, and the weaker of them was on the wrong page.

          A LINE, NOT A CARD. What is left is a sentence pointing at the tab,
          because deleting a whole block and leaving nothing is how somebody
          concludes their routine was never generated. */}
      {/* Ingredients — why for you */}
      {a.ingredients?.length > 0 && (
        <BeautyLeaf
          title="Ingredients for you"
          meta={`${a.ingredients.length} ingredient${a.ingredients.length === 1 ? '' : 's'} · ${a.ingredients.slice(0, 3).map((i) => i.name).join(', ')}${a.ingredients.length > 3 ? '…' : ''}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {a.ingredients.map((ing, i) => (
              <div key={i} style={{ borderTop: i ? '1px solid var(--line)' : 'none', paddingTop: i ? 8 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)' }}>{ing.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{ing.why}</div>
              </div>
            ))}
          </div>
        </BeautyLeaf>
      )}

      {a.cautions.length > 0 && (
        <BeautyLeaf title="Good to know" meta={`${a.cautions.length} note${a.cautions.length === 1 ? '' : 's'} before you start`}>
          {a.cautions.map((c, i) => <p key={i} className="muted" style={{ fontSize: 12.5, margin: '3px 0', lineHeight: 1.6 }}>· {c}</p>)}
        </BeautyLeaf>
      )}

      {/* THE ROUTINE IS THE WAY OUT OF THIS PAGE, so it is the last line of the
          index and set as one — the contents page ends by pointing at the
          chapter that is somewhere else. */}
      {a.routine && (
        <p className="beauty-leaf" style={{ margin: 0 }}>
          {/* Inherits the wall's ink rather than --accent-ink. The accent is
              near-black, which is the right answer on paper and invisible on
              the gallery wall — and this line is one of the few things in the
              hub drawn straight onto it. */}
          <Link to="/beauty/routine" className="t" style={{ color: 'inherit', textDecorationThickness: 1 }}>Your routine →</Link>
          <span className="m">Step by step, with products, prices and order</span>
        </p>
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
    <div className="flex-min">
      <select aria-label={`${title} — choose a date to compare`} value={idx} onChange={(ev) => set(+ev.target.value)} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 8px', fontSize: 11.5, background: 'var(--paper)', fontFamily: 'inherit', marginBottom: 6 }}>
        {sorted.map((s, i) => <option key={s.id} value={i}>{title}: {fmtDate(s.date)}</option>)}
      </select>
      <div style={{ aspectRatio: '1 / 1', borderRadius: 12, border: '1px solid var(--line)', background: e.thumb ? `center/cover no-repeat url(${e.thumb})` : 'var(--paper)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {!e.thumb && <span className="muted" style={{ fontSize: 11, paddingBottom: 8 }}>no photo</span>}
        <span style={{ background: 'rgba(20,18,14,.7)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', margin: 6 }}>Score {e.score}</span>
      </div>
    </div>
  );
  return (
    <div className="beauty-sheet">
      {/* A SHEET, NOT A CARD WITH AN EMOJI ON IT. This is the one thing on the
          page somebody comes back FOR, and it was the last object still wearing
          the city's ordinary idiom — a rounded white tile headed 📈 in the
          middle of a set of prints. Same paper as everything else now, and the
          header is the plate's own rule. */}
      <div className="beauty-rule">
        <span>Progress timeline</span>
        <span />
        <span>{sorted.length} check-in{sorted.length === 1 ? '' : 's'} · re-upload weekly</span>
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
              <div style={{ fontSize: 20, fontWeight: 800, color: delta > 0 ? 'var(--ok-ink)' : delta < 0 ? 'var(--danger-ink)' : 'var(--muted)' }}>{delta > 0 ? `+${delta}` : delta}</div>
              <div className="muted" style={{ fontSize: 10 }}>score</div>
            </div>
            <Pane title="After" e={after} idx={ai} set={setAi} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
            {resolved.length > 0 && <span style={{ color: 'var(--ok-ink)', fontWeight: 600 }}>✓ Improved: {resolved.join(', ')}</span>}
            {appeared.length > 0 && <span style={{ color: 'var(--warn-ink)', fontWeight: 600 }}>▲ New: {appeared.join(', ')}</span>}
            {resolved.length === 0 && appeared.length === 0 && <span className="muted">No change in detected concerns between these check-ins.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Is a saved beauty profile fully answered (all 18 required)? */
function isBeautyComplete(p: Partial<Form>): boolean {
  return REQUIRED_SINGLE.every((k) => Boolean(p[k] && String(p[k]).trim()))
    && REQUIRED_MULTI.every((k) => ((p[k] as string[]) ?? []).length > 0);
}

/** Collapsed, read-only summary of the completed Skin & Hair profile + Edit. */
function BeautyProfileSummary({ f, onEdit }: { f: Form; onEdit: () => void }) {
  const rows: [string, string][] = [
    ['Basics', [f.age ? `${f.age}y` : null, f.gender, f.heightCm ? `${f.heightCm}cm` : null, f.weightKg ? `${f.weightKg}kg` : null, f.city].filter(Boolean).join(' · ') || '—'],
    ['Skin', [f.skinType, f.skinTone, f.undertone].filter(Boolean).join(' · ') || '—'],
    ['Skin goals', (f.skinGoals ?? []).slice(0, 4).join(', ') || '—'],
    ['Hair', [f.hairType, f.hairThickness, f.hairTexture, f.scalpType].filter(Boolean).join(' · ') || '—'],
    ['Hair goals', (f.hairGoals ?? []).slice(0, 4).join(', ') || '—'],
    /* No budget row. It is not asked here any more, and a summary that reports
       a stale chip value beside a slider that has since moved is worse than
       one that stays quiet about it. */
  ];
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Your Skin &amp; Hair Profile</h3>
        <Button variant="line" size="sm" onClick={onEdit}>Edit</Button>
      </div>
      {rows.map(([k, val]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
          <span className="muted" style={{ fontSize: 12.5, flexShrink: 0 }}>{k}</span>
          <span style={{ fontSize: 13, textAlign: 'right' }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

/* ── page ── */
export function Profile() {
  const profile = useBeautyProfile();
  const save = useSaveBeautyProfile();
  const analyze = useAnalyzeBeautyPhotos();
  const del = useDeleteLatestAssessment();
  const master = useMasterProfile();
  const ageLocked = master.data?.age != null;
  // Gender is decided once, in the Master Profile. Beauty shows it and cannot
  // change it — its own select only ever offered Female | Male | Other, so
  // saving here used to flatten a non-binary citizen's answer and write the
  // flattened value back over the canonical one.
  const genderLocked = Boolean(master.data?.genderIdentity);
  // Owner decision, 1 Aug: this hub's options stay Female | Male | Other, so
  // anything else flattens to "Other". The flattening is fine. Showing it
  // without saying so is not — the citizen would be looking at a locked field
  // reporting an answer they did not give, under a note that says it came from
  // their Master Profile. So when what they actually chose cannot be spelled
  // here, the field says which word it is standing in for.
  const masterGender = master.data?.genderIdentity;
  const masterGenderFreeText = master.data?.genderIdentityOther?.trim();
  const genderShownAs =
    masterGender === 'nonBinary' ? 'Non-binary'
    : masterGender === 'other' && masterGenderFreeText ? masterGenderFreeText
    : null;
  const budget = useBeautyBudget();
  const [tab, setTab] = useState<'photos' | 'profile'>('photos');
  const [f, setF] = useState<Form>(EMPTY);
  const [editingProfile, setEditingProfile] = useState(false);
  const [pics, setPics] = useState<Record<string, Shot>>({});

  useEffect(() => {
    const saved = profile.data?.profile && Object.keys(profile.data.profile).length ? (profile.data.profile as Partial<Form>) : null;
    const m = master.data;
    if (!saved && !m) return;
    setF((prev) => {
      const base = saved ? { ...EMPTY, ...saved } : { ...prev };
      // Auto-fill shared basics from the Master Profile where this hub is blank
      // (spec: read shared fields; never re-ask). Age is master-owned when set.
      if (m) {
        if (m.age != null) base.age = m.age;
        // No gender fallback here any more. withMasterDemographics() overlays
        // it server-side in this form's own vocabulary, so `saved.gender`
        // already carries it. The local capitalising helper that used to sit
        // above was a third hand-rolled mapping of the same thing.
        base.heightCm ??= m.heightCm ?? undefined;
        base.weightKg ??= m.weightKg ?? undefined;
        base.city ??= m.city ?? undefined;
        base.occupation ??= m.occupation ?? undefined;
      }
      return base;
    });
  }, [profile.data, master.data]);

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

  // ── hooks that MUST run on every render (before any early return) ──
  const photosCompleteH = photosReady(pics);
  const answeredH = [
    ...REQUIRED_SINGLE.map((k) => Boolean(f[k] && String(f[k]).trim())),
    ...REQUIRED_MULTI.map((k) => ((f[k] as string[]) ?? []).length > 0),
  ].filter(Boolean).length;
  const profileCompleteH = answeredH >= REQUIRED_SINGLE.length + REQUIRED_MULTI.length;
  // Auto-advance: the moment the last REQUIRED photo lands, glide to the
  // Profile tab. It fires on the required pair rather than on a full grid,
  // because the optional third may never arrive and waiting for it would strand
  // somebody on a tab they have finished with.
  const [photoBanner, setPhotoBanner] = useState(false);
  const autoSwitched = useRef(false);
  useEffect(() => {
    if (photosCompleteH && !autoSwitched.current && !profileCompleteH) {
      autoSwitched.current = true;
      setPhotoBanner(true);
      setTab('profile');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (!photosCompleteH) autoSwitched.current = false;
  }, [photosCompleteH, profileCompleteH]);

  if (profile.isLoading) return <Spinner label="Loading your beauty profile…" />;
  if (profile.isError) return <EmptyState title="Couldn't load your profile" hint="Please check your connection and try again." />;

  const analysis = profile.data?.analysis ?? null;
  const analyzedAt = profile.data?.analyzedAt ?? null;
  const aiEnabled = profile.data?.aiEnabled ?? false;
  const progress = profile.data?.progress ?? [];
  const warning = analyze.data?.warning;

  /**
   * A SECTION FOLDS ONCE IT HAS AN ANSWER IN IT, AND AN ASSESSMENT IS THE ANSWER.
   *
   * This used to also require all eighteen profile questions to be saved, and
   * that was the wrong gate: somebody with an assessment on file and one
   * unanswered question — which happens the moment a question is ADDED to the
   * form — got the whole page open again, several screens of their own answers,
   * every visit. What decides whether a section is done is whether the section
   * has produced something, not whether a different section is finished.
   *
   * The onboarding card above says what is still missing, so folding these does
   * not hide the ask.
   */
  const analysed = Boolean(analysis);
  /** The two things the assessment actually flagged, for the budget's one line
   *  about what the money is for. Not the analysis again — that is above it. */
  const priorities = (analysis?.skin.readings ?? []).filter((r) => r.level !== 'good').slice(0, 2).map((r) => r.label);

  const set = (k: keyof Form, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const single = (k: keyof Form, v: string) => set(k, f[k] === v ? undefined : v);
  const multi = (k: keyof Form, v: string) => {
    const cur = (f[k] as string[]) ?? [];
    if (v === NONE) { set(k, cur.includes(NONE) ? [] : [NONE]); return; } // exclusive
    const base = cur.filter((x) => x !== NONE);
    set(k, base.includes(v) ? base.filter((x) => x !== v) : [...base, v]);
  };
  const isOn = (k: keyof Form, v: string) => (Array.isArray(f[k]) ? (f[k] as string[]).includes(v) : f[k] === v);

  // ── onboarding completion (the required photos + profile 18/18 unlock it) ──
  const picsCount = Object.keys(pics).length;      // everything staged, optional included
  const picsRequired = requiredCount(pics);        // only what the gate counts
  const photosComplete = photosReady(pics);
  const answered = [
    ...REQUIRED_SINGLE.map((k) => Boolean(f[k] && String(f[k]).trim())),
    ...REQUIRED_MULTI.map((k) => ((f[k] as string[]) ?? []).length > 0),
  ].filter(Boolean).length;
  const profileTotal = REQUIRED_SINGLE.length + REQUIRED_MULTI.length;
  const profileComplete = answered >= profileTotal;
  const overallPct = Math.round(((picsRequired / PHOTOS_NEEDED) * 0.5 + (answered / profileTotal) * 0.5) * 100);
  // Once the SAVED profile is complete, show it collapsed (summary + Edit).
  const savedComplete = isBeautyComplete((profile.data?.profile ?? {}) as Partial<Form>);
  const collapsedProfile = savedComplete && !editingProfile;
  const missing = [
    ...REQUIRED_SINGLE.filter((k) => !(f[k] && String(f[k]).trim())),
    ...REQUIRED_MULTI.filter((k) => (((f[k] as string[]) ?? []).length === 0)),
  ].map((k) => REQUIRED_LABEL[k] ?? String(k));

  /** Step indicator shown on both tabs while onboarding is incomplete. */
  const OnboardingProgress = () => {
    if (photosComplete && profileComplete) return null;
    if (analysis && picsCount === 0) return null; // returning user, nothing staged
    return (
      <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13.5 }}>Unlock your AI Skin & Hair Assessment</strong>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color: 'var(--accent-ink)' }}>{overallPct}%</span>
        </div>
        <div style={{ height: 7, borderRadius: 'var(--r-full)', background: 'var(--line)', overflow: 'hidden', margin: '8px 0 10px' }}>
          <div style={{ height: '100%', width: `${overallPct}%`, background: 'var(--accent)', transition: 'width .3s ease' }} />
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5 }}>
          <span style={{ fontWeight: 600, color: photosComplete ? 'var(--ok-ink)' : 'var(--ink-soft)' }}>
            {photosComplete ? '✅' : '1️⃣'} Photos: {picsRequired} / {PHOTOS_NEEDED}
          </span>
          <span style={{ fontWeight: 600, color: profileComplete ? 'var(--ok-ink)' : 'var(--ink-soft)' }}>
            {profileComplete ? '✅' : '2️⃣'} Profile: {answered} / {profileTotal}
          </span>
        </div>
        {!profileComplete && missing.length > 0 && tab === 'profile' && (
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>Still to answer: {missing.slice(0, 6).join(', ')}{missing.length > 6 ? ` +${missing.length - 6} more` : ''} — "Don't know" and "None of these" count.</p>
        )}
      </div>
    );
  };

  // Reading and downscaling a photo now lives in PhotoStudio, with the camera
  // and the drop target, because all three produce the same thing and one of
  // them having its own resize was how the sizes would come to differ.
  const setPic = (slot: string, shot: Shot) => setPics((p) => ({ ...p, [slot]: shot }));
  const clearPic = (slot: string) => setPics((p) => { const n = { ...p }; delete n[slot]; return n; });
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
    if (!photosComplete || !profileComplete) return; // locked until the required photos + a full profile
    const facePic = pics.face ?? entries[0]?.[1];
    const thumb = facePic ? await makeThumb(facePic.preview) : undefined;
    analyze.mutate({ photos, thumb: thumb || undefined }, { onSuccess: () => setPics({}) });
  };

  return (
    <div>
      {/* ── THE MASTHEAD IS THE OWNER'S FIRST POSTER ─────────────────────────
          The eyebrow, the emoji avatar and the sentence of instructions are
          gone. What replaces them says the same thing in the reference's own
          voice — and the instructions were describing a page that now
          describes itself: every section below is a plate with its own blurb
          telling you what it wants.

          THE HERO IS THE ONLY PLATE WITH THE FULL AIR. Five posters at poster
          scale is a page you scroll past rather than read; the impact is spent
          once, on the title of the page. */}
      <BeautyPlate
        hero
        title={<>Your Skin &amp;<br />Hair Analysis</>}
        blurb="Your skin and hair, read — and a routine built from the reading."
      />

      {/* The tabs, set as a rule rather than a pill switch: two tracked words
          on a hairline, the live one underscored. A rounded segmented control
          in the middle of a set of printed plates is the one object on the
          page that came from a different design. */}
      <div className="beauty-tabs" role="tablist" aria-label="Skin and hair profile">
        {(['photos', 'profile'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            className={tab === t ? 'is-on' : undefined} onClick={() => setTab(t)}>
            {t === 'photos' ? 'Photos & Analysis' : 'Your Details'}
          </button>
        ))}
      </div>

      {tab === 'photos' && (
        <div>
          <OnboardingProgress />
          {/* ONCE THE PROFILE IS DONE, THE FORM FOLDS AWAY.
              Everything on this page is an INPUT: the photos, the answers, the
              assessment they produce. Before this, every return visit began
              with several screens of your own answers between you and the
              routine they exist to build. Nothing is deleted and nothing is
              re-asked — the sections are simply closed.

              The before-and-after stays open: it is the reason to come back.

              THIS ONE OPENS AGAIN WHILE PHOTOS ARE STAGED. Uploading, then
              switching to the profile tab and back, unmounts this section — and
              folding it away with somebody's three photographs still inside it,
              one click from the Analyse button they were reaching for, is worse
              than never folding it at all. */}
          <BeautyPlate
            title={<>Your Photos<br />&amp; Details<br />for Analysis</>}
            blurb="Two photos and a few answers — the assessment comes from these."
            meta={`${picsRequired} / ${PHOTOS_NEEDED} staged · ${profile.data?.uploads?.remaining ?? 0} left this week`}
            defaultOpen={!analysed || picsCount > 0}
          >
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Your photos <span className="muted" style={{ fontWeight: 400 }}>· two needed, one optional · {picsRequired} / {PHOTOS_NEEDED}</span></div>
            <PhotoGrid pics={pics} onSet={setPic} onClear={clearPic} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: '10px 12px', background: 'var(--paper)', borderRadius: 'var(--r-1)' }}>
              <span style={{ fontSize: 15 }}>📷</span>
              <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
                Bare face, even light. Camera, file, or drag one in. <strong>No beauty filters and no AI-generated images</strong> — they distort the analysis and will be rejected. {aiEnabled ? 'AI reviews clear photos once to spot visible issues (acne, pigmentation, texture, pores, redness, hydration, hair density & scalp).' : 'Photos build your before/after alongside your profile assessment.'} Full images aren't stored — only a small unedited thumbnail for your timeline. <strong>🔒 Your photos are never shared, never used for anything but your analysis.</strong>
              </p>
            </div>
            {warning && (
              <p style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600, margin: '10px 0 0' }}>⚠️ {warning}</p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <Button variant="accent" disabled={analyze.isPending || !photosComplete || !profileComplete || (profile.data?.uploads?.remaining === 0)} onClick={() => void runAnalysis()}>
                {analyze.isPending ? 'Analysing…' : `Analyse & save${progress.length ? ' this week' : ''}`}
              </Button>
              {/* Names what is missing rather than counting it. "Add 1 more
                  photo" on a grid with an empty optional tile in it is a
                  sentence somebody can satisfy and still be locked out. */}
              {!photosComplete && picsCount > 0 && <span className="muted" style={{ fontSize: 11.5 }}>Still needed: {missingPhotos(pics).join(' and ')}</span>}
              {photosComplete && !profileComplete && (
                <button type="button" onClick={() => setTab('profile')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-ink)', padding: 0 }}>
                  Complete your profile to unlock your assessment →
                </button>
              )}
              {profile.data?.uploads && (
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {profile.data.uploads.remaining} of {profile.data.uploads.limit} analyses left this week
                </span>
              )}
              {progress.length > 0 && (
                <button type="button" disabled={del.isPending}
                  onClick={() => { if (window.confirm('Delete your latest check-in? Your current assessment clears until you re-analyse. Earlier entries stay; no weekly analysis is refunded.')) del.mutate(); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--danger-ink)', padding: 0 }}>
                  {del.isPending ? 'Deleting…' : '🗑 Delete latest & re-upload'}
                </button>
              )}
            </div>
            {analyze.isError && (
              <p style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600, margin: '10px 0 0' }}>
                ⚠️ The analysis didn't go through — please check your connection and tap Analyse again. If it keeps failing, try re-adding the photos.
              </p>
            )}
          </div>
          </BeautyPlate>

          {/* OPEN. The before and after is the reason to come back. */}
          {progress.length > 0 && <ProgressView entries={progress} />}

          {/* NOT WRAPPED IN A COLLAPSIBLE OF ITS OWN ANY MORE. Skin, Hair &
              scalp and Ingredients each fold individually now, and one fold
              around three folds means two clicks to read one reading, with the
              outer header able to say nothing more specific than the name of
              the thing inside it. What is left outside is the summary
              paragraph, which is the one part somebody wants without asking. */}
          {analysis ? (
            <AssessmentView a={analysis} analyzedAt={analyzedAt} />
          ) : (
            <EmptyState icon="✨" title="No assessment yet" hint="Add photos and analyse, or fill in your profile and save — your assessment appears here." />
          )}

          {/* DIRECTLY UNDER THE ANALYSIS, because it is step two of three and the
              assessment is what the money is being spent against. This is the
              only place it lives — it had a page and a sidebar tab for an
              afternoon, and that was a second location for one decision.

              OPEN UNTIL IT IS SET, then folded with the rest. The header keeps
              the answer visible while it is closed, so somebody can see what
              they chose without opening anything. */}
          {analysis && (budget.data ? (
            <BeautyPlate
              title={<>Create<br />Your Budget</>}
              blurb="Your routine is built inside this number — never over it."
              meta={budgetSummary(budget.data)}
            >
              <BudgetPanel compact priorities={priorities} />
              <p style={{ margin: '14px 0 0', fontSize: 11.5 }}>
                <Link to="/beauty/routine" style={{ fontWeight: 700, color: 'var(--accent-ink)' }}>See my routine →</Link>
              </p>
            </BeautyPlate>
          ) : (
            /* NOT A PLATE UNTIL THERE IS AN ANSWER IN IT. A budget that has
               never been set is the next thing to do, and a poster you have to
               open first is a poster in front of the only unfinished step. */
            <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--accent)' }}>
              <BudgetPanel compact priorities={priorities} />
            </div>
          ))}

          {/* Permanent, dated assessment history + progress comparison. */}
          {analysed
            ? <BeautyPlate title="Your Timeline" blurb="Every assessment you have saved, in order, with what changed between them."><SkinHairTimeline /></BeautyPlate>
            : <SkinHairTimeline />}

          {/* Medical Hub biomarkers → skin & hair, right here on the profile tab. */}
          <BiomarkerCorrelation />
        </div>
      )}

      {tab === 'profile' && (
        <div>
          {/* THE DETAILS TAB GETS THE SECOND POSTER'S OTHER HALF. The plate on
              the photos tab is titled "Your Photos & Details for Analysis"
              because the owner's print is, and the details are on this tab —
              so a citizen who lands here from the auto-advance arrives at a
              page with no masthead on it at all.

              NO PANEL BEHIND IT. What follows is eighteen questions somebody
              came here to answer; putting them behind a fold would be folding
              away the only unfinished thing on the page. */}
          <BeautyPlate
            title="Your Details"
            blurb="Two photos and a few answers — the assessment comes from these."
            meta={`${answered} / ${profileTotal} answered`}
          />
          {photoBanner && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, padding: '12px 14px', background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', borderRadius: 12, fontSize: 13 }}>
              <span>✅</span>
              <span>Photos in. Finish your profile to unlock your assessment.</span>
              <button type="button" onClick={() => setPhotoBanner(false)} aria-label="Dismiss this message" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ok-ink)' }}>✕</button>
            </div>
          )}
          <OnboardingProgress />
          {collapsedProfile ? (
            <BeautyProfileSummary f={f} onEdit={() => setEditingProfile(true)} />
          ) : (
          <>
          {(() => {
            const estimated = (profile.data?.profile as { aiEstimated?: Record<string, boolean> } | undefined)?.aiEstimated ?? {};
            const keys = Object.keys(estimated).filter((k) => estimated[k]);
            if (!keys.length) return null;
            const label: Record<string, string> = { skinType: 'Skin type', scalpType: 'Scalp type', hairDensity: 'Hair density', hairTexture: 'Hair texture' };
            return (
              <p className="muted" style={{ fontSize: 12, margin: '0 0 14px', padding: '9px 12px', background: 'var(--accent-soft)', borderRadius: 'var(--r-1)' }}>
                ✨ <strong>AI-estimated from your photos:</strong> {keys.map((k) => label[k] ?? k).join(', ')} — review and edit anytime.
              </p>
            );
          })()}
          {/* 1 Basic */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Basic profile</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
              <input style={{ ...fld, ...(ageLocked ? masterLockedStyle : {}) }} type="number" placeholder="Age" value={f.age ?? ''} disabled={ageLocked} title={ageLocked ? 'Set in your Master Profile' : undefined} onChange={(e) => set('age', e.target.value ? +e.target.value : undefined)} />
              <select
                aria-label="Gender"
                style={{ ...fld, ...(genderLocked ? masterLockedStyle : {}) }}
                value={f.gender ?? ''}
                disabled={genderLocked}
                title={genderLocked ? 'Set in your Master Profile' : undefined}
                onChange={(e) => set('gender', e.target.value || undefined)}
              >
                <option value="">Gender</option><option>Female</option><option>Male</option><option>Other</option>
              </select>
              <input style={fld} type="number" placeholder="Height (cm)" value={f.heightCm ?? ''} onChange={(e) => set('heightCm', e.target.value ? +e.target.value : undefined)} />
              <input style={fld} type="number" placeholder="Weight (kg)" value={f.weightKg ?? ''} onChange={(e) => set('weightKg', e.target.value ? +e.target.value : undefined)} />
              <input style={fld} placeholder="City / climate" value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} />
              <input style={fld} placeholder="Occupation" value={f.occupation ?? ''} onChange={(e) => set('occupation', e.target.value)} />
            </div>
            {ageLocked && <MasterLockedNote label="Age" />}
            {genderLocked && <MasterLockedNote label="Gender" />}
            {genderShownAs && (
              <p className="muted" style={{ fontSize: 11, margin: '2px 0 0' }}>
                Shown as “Other” here — this hub only has Female, Male and Other. Your Master
                Profile still says {genderShownAs}.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {LIFESTYLE.map((l) => <Chip key={l} on={isOn('lifestyle', l)} label={l} onClick={() => single('lifestyle', l)} />)}
            </div>
          </div>

          <Section title="Skin type">{SKIN_TYPES.map((x) => <Chip key={x} on={isOn('skinType', x)} label={x} onClick={() => single('skinType', x)} />)}</Section>
          <Section title="Skin tone">{SKIN_TONES.map((x) => <Chip key={x} on={isOn('skinTone', x)} label={x} onClick={() => single('skinTone', x)} />)}</Section>
          <Section title="Undertone">{UNDERTONES.map((x) => <Chip key={x} on={isOn('undertone', x)} label={x} onClick={() => single('undertone', x)} />)}</Section>
          <Section title="Skin goals" note="pick any">{SKIN_GOALS.map((x) => <Chip key={x} on={isOn('skinGoals', x)} label={x} onClick={() => multi('skinGoals', x)} />)}<Chip on={isOn('skinGoals', NONE)} label={NONE} onClick={() => multi('skinGoals', NONE)} /></Section>
          <Section title="Current skin concerns" note="pick any">{SKIN_CONCERNS.map((x) => <Chip key={x} on={isOn('skinConcerns', x)} label={x} onClick={() => multi('skinConcerns', x)} />)}<Chip on={isOn('skinConcerns', NONE)} label={NONE} onClick={() => multi('skinConcerns', NONE)} /></Section>
          <Section title="Hair type">{HAIR_TYPES.map((x) => <Chip key={x} on={isOn('hairType', x)} label={x} onClick={() => single('hairType', x)} />)}</Section>
          <Section title="Hair thickness">{HAIR_THICK.map((x) => <Chip key={x} on={isOn('hairThickness', x)} label={x} onClick={() => single('hairThickness', x)} />)}</Section>
          <Section title="Hair density">{HAIR_DENSITY.map((x) => <Chip key={x} on={isOn('hairDensity', x)} label={x} onClick={() => single('hairDensity', x)} />)}</Section>
          <Section title="Hair texture">{HAIR_TEXTURE.map((x) => <Chip key={x} on={isOn('hairTexture', x)} label={x} onClick={() => single('hairTexture', x)} />)}</Section>
          <Section title="Hair goals" note="pick any">{HAIR_GOALS.map((x) => <Chip key={x} on={isOn('hairGoals', x)} label={x} onClick={() => multi('hairGoals', x)} />)}<Chip on={isOn('hairGoals', NONE)} label={NONE} onClick={() => multi('hairGoals', NONE)} /></Section>
          <Section title="Hair concerns" note="pick any">{HAIR_CONCERNS.map((x) => <Chip key={x} on={isOn('hairConcerns', x)} label={x} onClick={() => multi('hairConcerns', x)} />)}<Chip on={isOn('hairConcerns', NONE)} label={NONE} onClick={() => multi('hairConcerns', NONE)} /></Section>
          <Section title="Scalp type">{SCALP_TYPES.map((x) => <Chip key={x} on={isOn('scalpType', x)} label={x} onClick={() => single('scalpType', x)} />)}</Section>
          <Section title="Current routine" note="what you use now">{ROUTINE.map((x) => <Chip key={x} on={isOn('routine', x)} label={x} onClick={() => multi('routine', x)} />)}<Chip on={isOn('routine', NONE)} label={NONE} onClick={() => multi('routine', NONE)} /></Section>
          <Section title="Allergies & sensitivities" note="we'll avoid these">{ALLERGIES.map((x) => <Chip key={x} on={isOn('allergies', x)} label={x} onClick={() => multi('allergies', x)} />)}<Chip on={isOn('allergies', NONE)} label={NONE} onClick={() => multi('allergies', NONE)} /></Section>
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
                        style={{ cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '6px 13px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                          border: `1.5px solid ${on ? 'var(--accent)' : reason ? 'var(--accent-ink)' : 'var(--line)'}`,
                          background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent)' : reason ? 'var(--accent-ink)' : 'var(--ink-soft)' }}>
                        {on ? '✓ ' : ''}{x}{reason ? ' 🩸' : ''}
                      </button>
                    );
                  })}
                  <Chip on={isOn('medicalConditions', NONE)} label={NONE} onClick={() => multi('medicalConditions', NONE)} />
                </div>
                {(labNotes.length > 0 || preSelected.length > 0 || sug?.alopeciaHint) && (
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--r-1)', background: 'rgba(192,38,211,0.06)', border: '1px solid rgba(192,38,211,0.2)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-ink)', marginBottom: 6 }}>🩸 From your labs</div>
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

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '4px 0 22px', flexWrap: 'wrap' }}>
            {photosComplete && profileComplete && picsCount > 0 ? (
              <Button variant="accent" disabled={save.isPending || analyze.isPending}
                onClick={() => save.mutate(f as unknown as Record<string, unknown>, { onSuccess: () => { void runAnalysis(); setTab('photos'); window.scrollTo({ top: 0, behavior: 'smooth' }); } })}>
                {save.isPending || analyze.isPending ? 'Generating your assessment…' : '✨ Generate my AI assessment'}
              </Button>
            ) : (
              <Button variant="accent" disabled={save.isPending || !profileComplete} onClick={() => save.mutate(f as unknown as Record<string, unknown>, { onSuccess: () => setEditingProfile(false) })}>
                {save.isPending ? 'Saving…' : 'Save profile'}
              </Button>
            )}
            {!profileComplete && <span className="muted" style={{ fontSize: 12 }}>{profileTotal - answered} question{profileTotal - answered === 1 ? '' : 's'} left — "Don't know" counts as an answer.</span>}
            {save.isSuccess && profileComplete && <span style={{ fontSize: 13, color: 'var(--accent-ink)', fontWeight: 700 }}>✓ Saved</span>}
          </div>
          </>
          )}

          {analysis && <AssessmentView a={analysis} analyzedAt={analyzedAt} />}
        </div>
      )}
    </div>
  );
}
