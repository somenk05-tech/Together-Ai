import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> { lift?: boolean; }

export function Card({ lift, className, ...rest }: CardProps) {
  return <div className={clsx('card', lift && 'lift', className)} {...rest} />;
}
