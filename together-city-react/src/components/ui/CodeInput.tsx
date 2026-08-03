import { useEffect, useRef, useState } from 'react';

export interface CodeInputProps {
  length?: number;
  value: string;
  onChange: (next: string) => void;
  /** Fired when the last box is filled — lets the form submit without a click. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  /** Shakes and reddens the boxes. Cleared by the next keystroke. */
  invalid?: boolean;
  autoFocus?: boolean;
  label?: string;
  /** 'dark' for the sign-in overlay, which sits on its own palette rather than
   *  the app's surface tokens. */
  tone?: 'default' | 'dark';
}

/**
 * A six-box one-time-code field.
 *
 * The obvious implementation — six separate inputs, each with its own state —
 * is the one that fights the user. Paste puts all six digits in the first box.
 * iOS SMS autofill fills only the box it is focused on. Backspace at the start
 * of an empty box does nothing. Screen readers announce "edit text, blank" six
 * times with no idea what the field is.
 *
 * So this is ONE input with the six boxes drawn behind it. The input is
 * transparent and stretched across the row; the boxes are divs showing
 * `value[i]`. Paste, autofill (`autoComplete="one-time-code"` on a real input
 * is what iOS and Chrome look for), backspace, arrow keys and select-all all
 * work because they are the browser's own behaviour on a text field, not a
 * reimplementation of it.
 *
 * The caret is hidden and a fake one is drawn on the active box, which is the
 * only piece of theatre involved.
 */
export function CodeInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
  label = 'Verification code',
  tone = 'default',
}: CodeInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value.length === length && fired.current !== value) {
      fired.current = value;
      onComplete?.(value);
    }
    if (value.length < length) fired.current = null;
  }, [value, length, onComplete]);

  const dark = tone === 'dark';
  const palette = dark
    ? { idle: 'rgba(255,255,255,.22)', active: 'var(--gold-bright)', bg: 'rgba(255,255,255,.05)', ink: 'var(--on-accent)', caret: 'var(--gold-bright)' }
    : { idle: 'var(--line)', active: 'var(--accent)', bg: 'var(--card)', ink: 'var(--ink)', caret: 'var(--accent)' };

  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  // The active box is the next empty one, or the last while it is full.
  const active = Math.min(value.length, length - 1);

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={label}
        maxLength={length}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          opacity: 0, cursor: 'text', zIndex: 2,
          // Not display:none or visibility:hidden — either would stop autofill
          // and stop the field being focusable at all.
          font: 'inherit', letterSpacing: 'inherit',
        }}
      />
      <div
        aria-hidden
        style={{ display: 'flex', gap: 8, justifyContent: 'center' }}
        className={invalid ? 'tc-shake' : undefined}
      >
        {digits.map((d, i) => {
          const isActive = focused && i === active && !disabled;
          return (
            <div
              key={i}
              style={{
                width: 44, height: 56, display: 'grid', placeItems: 'center',
                fontSize: 24, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                borderRadius: 12,
                border: `1.5px solid ${invalid ? 'var(--danger-ink)' : isActive ? palette.active : palette.idle}`,
                background: disabled ? palette.idle : palette.bg,
                color: invalid ? 'var(--danger-ink)' : palette.ink,
                transition: 'border-color .12s ease',
              }}
            >
              {d || (isActive ? <span className="tc-caret" style={{ width: 2, height: 26, background: palette.caret, borderRadius: 2 }} /> : '')}
            </div>
          );
        })}
      </div>
    </div>
  );
}
