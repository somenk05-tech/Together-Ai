import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { useBeautyBudget, useSaveBeautyBudget, type BeautyBudget } from '../api';

/**
 * What you are willing to spend, per part of the routine.
 *
 * THE WHOLE POINT OF THIS SCREEN is that nothing downstream runs until it has
 * been answered. The routine is not generated and then priced; the number set
 * here is an input to which products get chosen. A default applied on somebody's
 * behalf would quietly undo that, so there isn't one — the sliders start at a
 * suggestion, and until Save is pressed the server holds nothing.
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

const MIN = 1000;
const MAX = 60000;
const QUICK = [1000, 2500, 5000, 10000, 20000, 40000, 60000];

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const chipLabel = (n: number) => (n >= 1000 ? `₹${n / 1000}K` : `₹${n}`);

export interface BudgetDraft { face: number; hair: number; body: number }
const DEFAULT_DRAFT: BudgetDraft = { face: 3000, hair: 2000, body: 1500 };

/**
 * One category's control.
 *
 * `step` is ₹100 rather than ₹1: a slider that can land on ₹4,973 is a slider
 * whose value you cannot repeat, and nobody's budget has that precision. The
 * FIELD still takes any rupee, because somebody who types 4973 means it.
 */
function Dial(
  { label, hint, value, onChange }:
  { label: string; hint?: string; value: number; onChange: (n: number) => void },
) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? String(value);
  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^\d]/g, ''));
    setTyped(null);
    if (Number.isFinite(n) && n > 0) onChange(Math.min(MAX, Math.max(MIN, Math.round(n))));
  };

  return (
    <section style={{ padding: '20px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 12, margin: 0, textTransform: 'uppercase', letterSpacing: '.14em' }}>{label}</h3>
        {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
          <span className="muted" style={{ fontSize: 13 }}>₹</span>
          <input
            aria-label={`${label} monthly budget in rupees`}
            inputMode="numeric"
            value={typed ?? value.toLocaleString('en-IN')}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ width: 78, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--line)', background: 'transparent',
              fontFamily: 'inherit', fontSize: 20, fontWeight: 700, color: 'var(--ink)', padding: '1px 2px', outline: 'none' }} />
          <span className="muted" style={{ fontSize: 12 }}>/ month</span>
        </span>
      </div>

      <input type="range" min={MIN} max={MAX} step={100} value={value}
        aria-label={`${label} monthly budget`}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', margin: '14px 0 6px', accentColor: 'var(--accent)' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 11 }}>{rupees(MIN)}</span>
        <span className="muted" style={{ fontSize: 11 }}>{rupees(MAX)}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {QUICK.map((n) => (
          <button key={n} type="button" onClick={() => { setTyped(null); onChange(n); }}
            style={{ cursor: 'pointer', borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600,
              border: `1.5px solid ${value === n ? 'var(--accent)' : 'var(--line)'}`,
              background: value === n ? 'var(--accent)' : 'transparent',
              color: value === n ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
            {chipLabel(n)}
          </button>
        ))}
      </div>
      {shown === '' && <span className="muted" style={{ fontSize: 11 }}>&nbsp;</span>}
    </section>
  );
}

/**
 * The panel, used in two places and identical in both: its own page at
 * /beauty/budget, and inline under the assessment on the profile, where it is
 * the next thing to do the moment the analysis lands. One component, because a
 * second copy is a second set of rounding rules.
 */
export function BudgetPanel(
  { priorities, onSaved, compact = false }:
  { priorities?: string[]; onSaved?: () => void; compact?: boolean },
) {
  const saved = useBeautyBudget();
  const save = useSaveBeautyBudget();
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
    ? `Your profile suggests your face routine should prioritise ${priorities.slice(0, 2).join(' and ').toLowerCase()}. Set your budget and we'll prioritise accordingly.`
    : null;

  return (
    <div>
      {!compact && (
        <>
          <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase' }}>Together Beauty Labs</div>
          <h1 className="routine-display" style={{ fontSize: 'clamp(30px, 4vw, 44px)', lineHeight: 1.05, margin: '4px 0 6px' }}>
            Your beauty budget
          </h1>
          <p className="muted" style={{ fontSize: 13.5, margin: '0 0 4px', maxWidth: 560 }}>
            Set what you&rsquo;re comfortable spending each month. We&rsquo;ll build your routine around it.
          </p>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px', maxWidth: 560 }}>
            Your budget is a monthly limit. We&rsquo;ll prioritise the products that matter most and keep your routine lean.
          </p>
        </>
      )}

      {priorityLine && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 6px', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 10, padding: '10px 12px' }}>
          {priorityLine}
        </p>
      )}

      <Dial label="Face" hint="Cleanse, treat, moisturise, protect" value={draft.face} onChange={set('face')} />
      <Dial label="Hair" hint="Wash, condition, scalp" value={draft.hair} onChange={set('hair')} />
      <Dial label="Body" hint="Wash, moisturise, hands and lips" value={draft.body} onChange={set('body')} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 4 }}>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.14em', fontWeight: 700 }}>Total</span>
        <span style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 800, letterSpacing: '-.01em' }}>{rupees(total)}</span>
        <span className="muted" style={{ fontSize: 12 }}>/ month</span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
        <Button variant="accent" disabled={save.isPending}
          onClick={() => save.mutate(draft, { onSuccess: () => { setTouched(false); onSaved?.(); } })}>
          {save.isPending ? 'Saving…' : saved.data && !dirty ? 'Budget saved' : saved.data ? 'Update my budget' : 'Create my routine'}
        </Button>
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
        We&rsquo;ll never recommend products that push your routine beyond your selected budget without asking you first.
      </p>
    </div>
  );
}

export type { BeautyBudget };
