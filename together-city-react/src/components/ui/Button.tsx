import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * The one button.
 *
 * EVERY EXISTING NAME STILL WORKS. `accent`, `gold`, `line` and `ghost` are used
 * at several hundred call sites; renaming them would be a redesign wearing a
 * refactor's clothes, and would put a rename of 300 files inside a commit about
 * materials. The new names sit beside them — `primary` is `accent`, `outline` is
 * `line` — and both are wired to the same rules in relief.css.
 *
 * SHAPE IS SEPARATE FROM VARIANT, because they are separate questions. A FAB
 * can be primary or secondary; an icon button can be either too. Folding shape
 * into the variant list is how a nine-name enum becomes a thirty-name one.
 *
 * `state` DRIVES `data-state`, NOT A CLASS, and `toggle` reads `aria-pressed`
 * rather than a class of its own. Both are the same decision: the attribute a
 * screen reader uses and the attribute the paint uses are the same attribute,
 * so a button cannot be lit while telling somebody it is off.
 */
type Variant = 'accent' | 'gold' | 'line' | 'ghost' | 'primary' | 'secondary' | 'outline' | 'toggle';
type Shape = 'capsule' | 'icon' | 'fab' | 'pill';
type Size = 'sm' | 'md' | 'lg';
type State = 'loading' | 'success' | 'error';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  /** Visual + assistive state. `loading` also sets aria-busy and disables the button. */
  state?: State;
  /** Shown while `state="loading"`; falls back to the ordinary label. */
  loadingLabel?: ReactNode;
}

/** `type="button"` by default, so a button in a form never submits by accident. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'accent', size = 'md', shape = 'capsule', state,
    loadingLabel, className, type = 'button', children, disabled, ...rest
  },
  ref,
) {
  const loading = state === 'loading';
  return (
    <button
      ref={ref}
      type={type}
      // A loading button is not clickable. Leaving it enabled means a second
      // click fires a second request while the first is still in flight, which
      // is how a wallet gets charged twice.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-state={state}
      className={clsx(
        'btn',
        `btn-${variant}`,
        size === 'sm' && 'btn-sm',
        size === 'lg' && 'btn-lg',
        shape === 'icon' && 'btn-icon',
        shape === 'fab' && 'btn-fab',
        shape === 'pill' && 'btn-pill',
        className,
      )}
      {...rest}
    >
      {loading && <span className="btn-spin" aria-hidden />}
      {loading ? (loadingLabel ?? children) : children}
    </button>
  );
});
