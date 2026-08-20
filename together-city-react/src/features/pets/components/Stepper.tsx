/**
 * SEVEN STEPS, AND THE READER CAN SEE WHERE THEY ARE IN THEM.
 *
 * A wizard with no progress indicator is a wizard people abandon at step three,
 * because step three of an unknown number is indistinguishable from step three
 * of thirty. The dots are also the navigation: a completed step is clickable,
 * which is what stops the flow being a corridor.
 */

export function Stepper(
  { steps, current, onJump }:
  { steps: string[]; current: number; onJump: (i: number) => void },
) {
  return (
    <nav aria-label="Progress" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const state = i === current ? 'now' : i < current ? 'done' : 'todo';
        return (
          <button
            key={label}
            type="button"
            disabled={state === 'todo'}
            onClick={() => onJump(i)}
            aria-current={state === 'now' ? 'step' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999,
              border: `1px solid ${state === 'now' ? 'var(--accent-line)' : 'var(--line)'}`,
              background: state === 'now' ? 'var(--accent-soft)' : state === 'done' ? 'var(--card)' : 'transparent',
              color: state === 'todo' ? 'var(--faint)' : state === 'now' ? 'var(--accent-ink)' : 'var(--ink-soft)',
              font: 'inherit', fontSize: 12, fontWeight: 600,
              cursor: state === 'todo' ? 'default' : 'pointer',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontSize: 10, fontWeight: 800,
                background: state === 'done' ? 'var(--ok-soft)' : 'transparent',
                color: state === 'done' ? 'var(--ok-ink)' : 'inherit',
                border: state === 'done' ? 'none' : '1px solid currentColor',
              }}
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
