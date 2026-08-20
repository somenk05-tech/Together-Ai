/** The three verdict tones, and the sentence each one carries.
 *
 *  Split out of `VerdictBadge.tsx` for Fast Refresh, and it earns the split on
 *  its own: the ingredient page reads the sentence without drawing the badge. */

import type { Verdict } from '../types';

export const TONE: Record<Verdict, { ink: string; soft: string; line: string; word: string }> = {
  SAFE: { ink: 'var(--ok-ink)', soft: 'var(--ok-soft)', line: 'var(--ok-line)', word: 'Generally appropriate in suitable portions' },
  LIMIT: { ink: 'var(--warn-ink)', soft: 'var(--warn-soft)', line: 'var(--warn-line)', word: 'Only in moderation, prepared correctly' },
  AVOID: { ink: 'var(--danger-ink)', soft: 'var(--danger-soft)', line: 'var(--danger-line)', word: 'Not recommended' },
};

export const verdictLine = (v: Verdict) => TONE[v].word;
