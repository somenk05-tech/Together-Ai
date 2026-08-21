import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Prescription } from '../composed.api';

/**
 * Where the daily target came from (FE-7.1).
 *
 * The ticket asks for "a 'How we calculated this' disclosure listing the inputs
 * used, the equation name, and the reference standard", plus a missing-input
 * prompt that links straight to the field.
 *
 * Everything here is RENDERED, not derived. The steps, the equation name and
 * the inputs all arrive from the engine that produced the number. A disclosure
 * that recomputes its own explanation is a second implementation, and the day
 * the two disagree is the day the disclosure becomes worse than none — it would
 * be confidently explaining a number the app did not actually use.
 *
 * Closed by default. Somebody who wants their calorie figure should not have to
 * read an equation to find it; somebody who doubts it should not have to ask
 * anyone.
 */
export function TargetsDisclosure({ p }: { p: Prescription }) {
  const [open, setOpen] = useState(false);
  const r = p.readiness;
  // Somebody who has asked the OS for less motion still needs to see the panel
  // arrive and leave — they just should not watch it grow. Opacity only.
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // The refusal comes first and replaces the working, because there is no
  // working to show — the number on screen was built from a reference body.
  if (r && !r.ok) return <TargetsRefusal r={r} />;
  if (!p.energyTrace) return null;

  const { equation, inputs, steps, notes } = p.energyTrace;

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ minWidth: 44, minHeight: 44, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--accent-ink)' }}>
        <span aria-hidden style={{
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform var(--dur-fast) var(--ease-out)',
        }}>▸</span>
        {' '}How we calculated this
      </button>

      {/* The wrapper stays mounted so the height has something to animate from.
          grid-template-rows 1fr -> 0fr collapses to the table's *actual* height
          with no magic number and no measurement — the same idiom as
          .tc-msg-collapse in chat/components/MessageThread.tsx. Everything the
          panel draws (padding, border, background) sits INSIDE the overflow:
          hidden row; on the wrapper, the border would still be visible at 0fr. */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition: reduce
          ? 'opacity var(--dur-fast) linear'
          : 'grid-template-rows var(--dur-base) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ marginTop: 8, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              {equation}
            </div>

            <div style={{ marginTop: 10 }}>
              {steps.map((s, i) => (
                <div key={s.label} style={{
                  display: 'flex', gap: 12, alignItems: 'baseline', padding: '5px 0',
                  borderTop: i ? '1px solid var(--line)' : 'none',
                  fontWeight: i === steps.length - 1 ? 700 : 400,
                }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{s.label}</span>
                  <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* Where a limit was applied, it says so here rather than the number
                just being lower than the arithmetic implies. */}
            {notes.map((n) => (
              <p key={n} className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, margin: '9px 0 0' }}>{n}</p>
            ))}

            <div style={{ marginTop: 11, paddingTop: 9, borderTop: '1px solid var(--line)' }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                What we used
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 5 }}>
                {Object.entries(inputs).map(([k, v]) => (
                  <span key={k} className="muted" style={{ fontSize: 11.5 }}>{humanKey(k)}: <b style={{ color: 'var(--ink)' }}>{String(v)}</b></span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * What is missing, why it is needed, and one tap to go and enter it.
 *
 * Each field carries its own destination from the engine — the client does not
 * guess a route. That matters more than it looks: the first version of the
 * engine linked to a page that does not hold these fields at all.
 */
/**
 * The refusal, exported because more than one screen owes it.
 *
 * BE-7.4's note says eight surfaces read a target and would adopt `readiness`
 * one at a time. Each one that does needs this exact panel — the headline, the
 * reason, and a link per missing field that lands on the input rather than the
 * page. A second copy of it is a second wording of the same refusal, and the
 * two would drift the way the hub lists did.
 */
export function TargetsRefusal({ r }: { r: Extract<NonNullable<Prescription['readiness']>, { ok: false }> }) {
  return (
    <div style={{ marginTop: 10, padding: '14px 16px', border: '1px solid var(--accent)', borderRadius: 12, background: 'var(--accent-soft, rgba(179,138,44,.06))' }}>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{r.headline}</p>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>{r.body}</p>

      {r.missing.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {r.missing.map((m) => (
            <Link key={m.field} to={m.href}
              style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-1)', background: 'var(--card)', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 92 }}>{m.label}</span>
              <span className="muted" style={{ fontSize: 11.5, flex: 1, lineHeight: 1.45 }}>{m.why}</span>
              <span style={{ color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700 }}>Add →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const LABELS: Record<string, string> = {
  weightKg: 'Weight', heightCm: 'Height', age: 'Age', sex: 'Sex',
  activityLevel: 'Activity', activityFactor: 'Factor', goal: 'Goal',
};
const humanKey = (k: string) => LABELS[k] ?? k;
