import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

type Variant = 'accent' | 'gold' | 'line' | 'ghost';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
}

/** Ported .btn design; `type="button"` by default to avoid accidental submits. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'accent', size = 'md', className, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      {...rest}
    />
  );
});
