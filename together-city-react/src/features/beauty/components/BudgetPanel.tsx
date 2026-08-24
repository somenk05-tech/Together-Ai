import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { useBeautyBudget, useBeautyRoutine, useSaveBeautyBudget, type BeautyBudget } from '../api';

/**
 * What you are willing to spend, per part of the routine.
 *
 * THE WHOLE POINT is that nothing downstream runs until it has been answered.
 * The routine is not generated and then priced; the number set here is an input
 * to which products get chosen. A default applied on somebody's behalf would
 * quietly undo that, so there isn't one — the dials start at nothing, and until
 * Save is pressed the server holds nothing either.
 *
 * THREE BUDGETS, NOT ONE. Face, hair and body are planned independently and a
 * generous face budget must not buy a better shampoo. One combined number would
 * read as simpler and would mean the engine deciding, on its own, how much of
 * your money goes on your hair.
 *
 * A SLIDER AND A FIELD, AND BOTH ARE THE SAME VALUE. The slider is for the
 * shape of the decision — ₹1,000 is nothing like ₹40,000 and the thumb shows
 * you that — and the field is for people who already know their number and
 * should not have to hunt for it with a mouse. The chips are shortcuts, never
 * the only options.
 */

/**
 * EVERY DIAL STARTS AT ZERO, and that is a decision rather than a placeholder.
 * A suggested figure sitting in the box is an anchor: people move away from it
 * by a little and call that their choice. Starting at nothing means the number
 * that ends up there is one somebody actually reached for.
 *
 * Zero is also a legitimate resting place. "I already have a body wash I like"
 * is answered by leaving Body at nothing, and the routine then has no body band
 * at all — not the cheapest lotion we could find, not a list of what is
 * missing. Silence.
 */
const MIN = 0;
/**
 * ₹8,000 A CATEGORY. It was ₹60,000, and the top five-sixths of that slider
 * were a number the engine could never honestly spend — the dearest routine
 * this shelf can build without taking a worse-matched product tops out around
 * ₹7,000–₹8,500 for a face and under ₹1,000 for hair. Offering ₹60,000 was
 * offering a disappointment and then explaining it on the routine page.
 *
 * ── ₹20,000 A CATEGORY, owner, 20 Aug ───────────────────────────────────────
 *
 * THE NUMBER ABOVE WENT STALE AND THIS CONSTANT DID NOT MOVE WITH IT. "Under
 * ₹1,000 for hair" was true of the 2025 shelf; a litre of Olaplex No.4 is
 * ₹11,999, and the dearest hair routine the planner will build now measures
 * ₹13,938. The server's BUDGET_MAX moved to ₹15,000 for that shelf. This did
 * not, and neither did the wire's zod bound — so "Set ₹15,171" on the routine
 * page posted a number the API rejected, and the one door out of a budget that
 * cannot carry a routine was a button that did nothing.
 *
 * THREE NUMBERS HAVE TO AGREE: the planner's cap, the wire's bound, and this.
 * They are now all ₹20,000, and `the wire bound is the planner's bound` in
 * budget-is-a-limit.spec.ts reads this file and fails if this line drifts
 * again. That is why the declaration is on one plain line — a spec matches it
 * as text, so do not fold it into an expression.
 *
 * THE RANGE IS NOT A PROMISE THAT THE SHELF CAN SPEND IT. `capInr` below stops
 * each dial at that profile's own useful maximum and prints why; at ₹8,000
 * that ceiling fired rarely, and at ₹20,000 it is the normal case. Raising the
 * range and showing the real ceiling are the same decision — the range is what
 * a citizen is ALLOWED to say, the cap is what this shelf can honestly do with
 * it, and the citizen sees both.
 */
const MAX = 20000;
/**
 * THE CHIPS RESCALE WITH THE RANGE. Seven shortcuts that stopped at ₹8,000
 * under a track running to ₹20,000 would put every chip in the bottom two
 * fifths and leave the rest of the slider with no handhold at all. Same count,
 * same shape — nothing, a starter, a real routine, and the end.
 */
const QUICK = [0, 2000, 5000, 8000, 12000, 16000, 20000];

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const chipLabel = (n: number) => (n === 0 ? 'None' : n >= 1000 ? `₹${n / 1000}K` : `₹${n}`);

export interface BudgetDraft { face: number; hair: number; body: number }
const DEFAULT_DRAFT: BudgetDraft = { face: 0, hair: 0, body: 0 };

/** The one-line summary a collapsed budget shows in its header. */
export const budgetSummary = (b: { face: number; hair: number; body: number }): string => {
  const parts = ([['Face', b.face], ['Hair', b.hair], ['Body', b.body]] as const)
    .filter(([, n]) => n > 0).map(([k, n]) => `${k} ${rupees(n)}`);
  const total = b.face + b.hair + b.body;
  return parts.length ? `${parts.join(' · ')} — ${rupees(total)} to spend` : 'nothing set aside yet';
};

/**
 * One category's control.
 *
 * `step` is ₹100 rather than ₹1: a slider that can land on ₹4,973 is a slider
 * whose value you cannot repeat, and nobody's budget has that precision. The
 * FIELD still takes any rupee, because somebody who types 4973 means it.
 */
function Dial(
  { label, hint, value, capInr, onChange }:
  { label: string; hint?: string; value: number; capInr?: number; onChange: (n: number) => void },
) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? String(value);

  /**
   * THE DIAL STOPS WHERE THE SHELF DOES. `capInr` is the plan's `usefulMaxInr`
   * — the most this profile can absorb before everything left on the shelf
   * claims fewer of the concerns they listed. It used to be a sentence on the
   * routine page, printed AFTER the money had been set and found partly inert:
   * a control offering ₹8,000 to a face whose shelf tops out at ₹2,215 is not
   * offering a choice, it is inviting a disappointment and then explaining it.
   * The ceiling belongs ON the control, before the choice.
   *
   * A BUDGET ALREADY SET ABOVE THE CAP IS NEVER REWRITTEN. The track stretches
   * to hold the saved number and the note says what the stretch is worth;
   * silently pulling somebody's ₹8,000 down to ₹2,215 would be the planner
   * moving their money, which is the one thing this feature refuses. And the
   * typed field still takes any rupee up to the range's end — someone who
   * types past the cap has read the note and means it.
   *
   * NO CAP BEFORE THE FIRST PLAN. The ceiling is computed per profile by the
   * planner, so until a budget exists there is nothing honest to cap with and
   * the track runs to its full range.
   *
   * AND NO CAP INSIDE THE BAND. Under the band-first rule (owner, 16 Aug) the
   * planner spends to 95–105% wherever the guarded shelf allows, so for most
   * profiles `usefulMaxInr` sits at the top of this track and a cap would be
   * a tick of noise under the end stop. The cap appears only when the shelf
   * genuinely cannot absorb even 95% of the dial's range — the case the
   * control would otherwise lie about.
   */
  const cap = capInr && capInr > 0 && capInr < MAX * 0.95 ? capInr : null;
  const sliderMax = cap ? Math.max(Math.ceil(cap / 100) * 100, value) : MAX;
  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, '');
    setTyped(null);
    // An empty field means zero, not "leave it as it was" — somebody who
    // deletes the number is saying nothing, and being silently overruled is
    // worse than being taken literally.
    const n = cleaned === '' ? 0 : Number(cleaned);
    if (Number.isFinite(n)) onChange(Math.min(MAX, Math.max(MIN, Math.round(n))));
  };

  return (
    <section style={{ padding: '20px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: '.14em' }}>{label}</h3>
        {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
        {value === 0 && <span className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>not included</span>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
          <span className="muted" style={{ fontSize: 13 }}>₹</span>
          <input
            aria-label={`${label} budget in rupees`}
            inputMode="numeric"
            value={typed ?? value.toLocaleString('en-IN')}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ width: 78, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent',
              fontFamily: 'inherit', fontSize: 20, fontWeight: 700, color: 'var(--ink)', padding: '1px 2px', outline: 'none' }} />
          <span className="muted" style={{ fontSize: 12 }}>to spend</span>
        </span>
      </div>

      <input type="range" min={MIN} max={sliderMax} step={100} value={value}
        aria-label={`${label} budget`}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', margin: '14px 0 6px', accentColor: 'var(--accent)' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 11 }}>{rupees(MIN)}</span>
        <span className="muted" style={{ fontSize: 11 }}>
          {cap && value <= cap ? `${rupees(sliderMax)} — your shelf tops out here` : rupees(sliderMax)}
        </span>
      </div>

      {/* THE CEILING'S REASON, IN THE SHELF'S OWN TERMS. Past the cap nothing
          is left that addresses this profile without repeating an active the
          routine already carries — the guards, not thrift; the planner spends
          to the band wherever it can. */}
      {cap && (
        <p className="muted" style={{ fontSize: 11, lineHeight: 1.55, margin: '6px 0 0' }}>
          {value > cap
            ? `Your ${label.toLowerCase()} shelf tops out at about ${rupees(cap)} for your profile — past that, products only repeat your routine or miss your concerns — the rest of your ${rupees(value)} can't be spent.`
            : `Your ${label.toLowerCase()} shelf tops out at about ${rupees(cap)} for your profile, so the dial stops there rather than offering money the shelf can't use.`}
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {/* Chips above a known ceiling are the same inert offer as the long
            track — they go, and the ceiling itself becomes the top chip. */}
        {(cap ? [...QUICK.filter((n) => n < cap), cap] : QUICK).map((n) => (
          <button key={n} type="button" onClick={() => { setTyped(null); onChange(n); }}
            style={{ cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '5px 11px', fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600,
              border: `1.5px solid ${value === n ? 'var(--accent)' : 'var(--line)'}`,
              background: value === n ? 'var(--accent)' : 'transparent',
              color: value === n ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
            {cap && n === cap ? rupees(n) : chipLabel(n)}
          </button>
        ))}
      </div>
      {shown === '' && <span className="muted" style={{ fontSize: 11 }}>&nbsp;</span>}
    </section>
  );
}

/**
 * ONE PLACE, AND IT IS THE PROFILE.
 *
 * This had a page of its own for an afternoon. It was a second location for a
 * single decision, and the decision belongs directly under the assessment it is
 * spending against — you read what your skin needs and then say what you will
 * put behind it, without navigating anywhere. The page and its sidebar tab are
 * gone; the panel folds shut once a budget exists.
 */
export function BudgetPanel(
  { priorities, onSaved, compact = false }:
  { priorities?: string[]; onSaved?: () => void; compact?: boolean },
) {
  const saved = useBeautyBudget();
  const save = useSaveBeautyBudget();
  /**
   * THE PER-PROFILE CEILING, off the plan the routine already carries —
   * `usefulMaxInr`, computed server-side per category. One existing wire
   * field; nothing new is asked of the API. Saving a budget invalidates the
   * routine query, so the caps follow every re-plan on their own. A skipped
   * category reports 0 and 0 means "no cap known", so the first dial anybody
   * moves is never capped by a plan that hasn't run.
   */
  const plan = useBeautyRoutine().data?.plan;
  const capOf = (k: keyof BudgetDraft): number => {
    const c = plan?.[k];
    return c && !c.skipped ? c.usefulMaxInr : 0;
  };
  const [draft, setDraft] = useState<BudgetDraft>(DEFAULT_DRAFT);
  const [touched, setTouched] = useState(false);

  // Load whatever is already stored, once, and never overwrite a value the
  // person is in the middle of moving.
  useEffect(() => {
    const b = saved.data;
    if (b && !touched) setDraft({ face: b.face, hair: b.hair, body: b.body });
  }, [saved.data, touched]);

  const set = (k: keyof BudgetDraft) => (n: number) => { setTouched(true); setDraft((d) => ({ ...d, [k]: n })); };
  const total = draft.face + draft.hair + draft.body;
  const dirty = useMemo(() => {
    const b = saved.data;
    return !b || b.face !== draft.face || b.hair !== draft.hair || b.body !== draft.body;
  }, [saved.data, draft]);

  const priorityLine = priorities?.length
    ? `Your face routine will prioritise ${priorities.slice(0, 2).join(' and ').toLowerCase()}.`
    : null;

  return (
    <div>
      {!compact && (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px', maxWidth: 560 }}>
            Your budget is what the routine costs to buy. Leave a category at nothing and
            it&rsquo;s left out altogether.
          </p>
        </>
      )}

      {priorityLine && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 6px', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 'var(--r-1)', padding: '10px 12px' }}>
          {priorityLine}
        </p>
      )}

      <Dial label="Face" hint="Cleanse, treat, moisturise, protect" value={draft.face} capInr={capOf('face')} onChange={set('face')} />
      <Dial label="Hair" hint="Wash, condition, scalp" value={draft.hair} capInr={capOf('hair')} onChange={set('hair')} />
      <Dial label="Body" hint="Wash, moisturise, hands and lips" value={draft.body} capInr={capOf('body')} onChange={set('body')} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 4 }}>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.14em', fontWeight: 700 }}>Total</span>
        <span style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 800, letterSpacing: '-.01em' }}>{rupees(total)}</span>
        <span className="muted" style={{ fontSize: 12 }}>to spend</span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        {/* Disabled at nothing-anywhere rather than saving an all-zero budget
            and sending somebody to an empty routine to work out why. */}
        <Button variant="accent" disabled={save.isPending || total === 0}
          onClick={() => save.mutate(draft, { onSuccess: () => { setTouched(false); onSaved?.(); } })}>
          {save.isPending ? 'Saving…' : saved.data && !dirty ? 'Budget saved' : saved.data ? 'Update my budget' : 'Create my routine'}
        </Button>
        {total === 0 && <span className="muted" style={{ fontSize: 11.5 }}>Set at least one of the three to build a routine.</span>}
        {save.isError && (
          <span style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600 }}>
            That didn&rsquo;t save — check your connection and try again.
          </span>
        )}
        {saved.data?.setAt && !dirty && (
          <span className="muted" style={{ fontSize: 11.5 }}>
            set {new Date(saved.data.setAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, margin: '14px 0 0', maxWidth: 620 }}>
        We never go past your budget without asking first.
      </p>
    </div>
  );
}

export type { BeautyBudget };
