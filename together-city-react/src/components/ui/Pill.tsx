import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> { active?: boolean; }

export function Pill({ active, className, type = 'button', ...rest }: PillProps) {
  return <button type={type} className={clsx('pill', active && 'on', className)} {...rest} />;
}
