/**
 * SAFE · LIMIT · AVOID.
 *
 * Three answers and three inks, taken from the city's existing status tokens
 * rather than a new green, amber and red invented for this hub. A fourth state
 * is not available on purpose: "it depends" is what the reason line is for.
 */

import type { Verdict } from '../types';
import { TONE } from './verdictTone';

export function VerdictBadge({ verdict, size = 'md' }: { verdict: Verdict; size?: 'sm' | 'md' | 'lg' }) {
  const t = TONE[verdict];
  const pad = size === 'lg' ? '10px 18px' : size === 'sm' ? '3px 9px' : '6px 13px';
  const font = size === 'lg' ? 18 : size === 'sm' ? 10 : 12;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: pad, borderRadius: 'var(--r-full)',
        background: t.soft, color: t.ink, border: `1px solid ${t.line}`,
        fontSize: font, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
      }}
    >
      {verdict}
    </span>
  );
}
