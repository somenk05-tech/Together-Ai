import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> { tone?: 'accent' | 'green' | 'red'; }

export function Tag({ tone = 'accent', className, ...rest }: TagProps) {
  return <span className={clsx('tag', tone !== 'accent' && tone, className)} {...rest} />;
}
