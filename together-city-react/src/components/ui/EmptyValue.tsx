import type { ReactNode } from 'react';

/**
 * One value the citizen has not given us yet (§3, FE-3.2).
 *
 * An em-dash, not "Not set", "N/A", "—0—", "Unknown", or a plausible default.
 * The review's p1 is a screen full of answers nobody gave, and the reason it
 * happened is that every component invented its own way to say "nothing here" —
 * so some of them said something that read like data.
 *
 * The rule this encodes: a missing value renders as visibly missing. It is
 * never filled in on the citizen's behalf, and it never borrows the styling of
 * a real value, which is why it is muted rather than merely different.
 */
export function EmptyValue({ label }: { label?: string }) {
  return (
    <span
      className="muted"
      // Screen readers get words; sighted readers get the dash. Announcing an
      // em-dash as "em dash" is not an answer to "what is my height".
      aria-label={label ? `${label}: not provided` : 'Not provided'}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      <span aria-hidden>—</span>
    </span>
  );
}

/**
 * Render a value, or the empty marker when there is not one.
 *
 * Takes the value rather than a boolean so a caller cannot get the test wrong —
 * `0`, `''` and `false` are all real answers and must render, which a truthiness
 * check at the call site would silently swallow. Only null and undefined are
 * missing.
 */
export function ValueOrEmpty({ value, label, render }: {
  value: unknown;
  label?: string;
  render?: (v: NonNullable<unknown>) => ReactNode;
}) {
  if (value === null || value === undefined) return <EmptyValue label={label} />;
  return <>{render ? render(value) : String(value)}</>;
}

/**
 * A list with nothing in it yet, and the way to put something there.
 *
 * Distinct from EmptyState (which covers "we looked and found nothing" for
 * search results and errors): this one is specifically "you have not added
 * anything", so it always offers the action rather than only explaining.
 */
export function NothingYet({ title, hint, action }: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{
      border: '1px dashed var(--line)', borderRadius: 16, padding: '28px 20px',
      textAlign: 'center', background: 'transparent',
    }}>
      <p style={{ fontSize: 14.5, fontWeight: 600, margin: 0 }}>{title}</p>
      {hint && <p className="muted" style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
