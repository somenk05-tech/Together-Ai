import type { DoseLogRow } from './api';

export interface Adherence {
  /** Consecutive days ending today (or yesterday, if today has no acted doses yet) where every recorded dose was taken. */
  currentStreak: number;
  bestStreak: number;
  /** Last 7 calendar days, oldest first: 'clear' all taken · 'partial' some taken · 'missed' none taken · 'none' nothing due that day. */
  week: Array<{ day: string; state: 'clear' | 'partial' | 'missed' | 'none' }>;
  daysWithData: number;
}

/**
 * FE-6.2 — adherence, computed from the dose log the page already shows.
 * Honest by construction: a day only counts when doses were actually DUE
 * (no invented perfect days), 'missed' rows break streaks exactly as they
 * should, and no data at all yields no streak rather than a zero that reads
 * like a failure.
 */
export function adherenceOf(rows: DoseLogRow[], now: Date): Adherence {
  const dayOf = (iso: string) => iso.slice(0, 10);
  const byDay = new Map<string, { taken: number; total: number }>();
  for (const r of rows) {
    const d = dayOf(r.scheduledAtUtc);
    const e = byDay.get(d) ?? { taken: 0, total: 0 };
    e.total += 1;
    if (r.action === 'taken') e.taken += 1;
    byDay.set(d, e);
  }

  const days = [...byDay.keys()].sort();
  let best = 0, run = 0;
  const clear = new Set<string>();
  for (const d of days) {
    const e = byDay.get(d)!;
    if (e.taken === e.total) { clear.add(d); run += 1; best = Math.max(best, run); }
    else run = 0;
  }

  // Current streak: walk back from the most recent day WITH data.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (clear.has(days[i])) current += 1;
    else break;
  }
  // A streak is only "current" if its newest day is today or yesterday.
  const todayKey = now.toISOString().slice(0, 10);
  const yesterKey = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const newest = days[days.length - 1];
  if (newest !== todayKey && newest !== yesterKey) current = 0;

  const week: Adherence['week'] = [];
  for (let i = 6; i >= 0; i--) {
    const key = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    const e = byDay.get(key);
    week.push({
      day: key,
      state: !e ? 'none' : e.taken === e.total ? 'clear' : e.taken > 0 ? 'partial' : 'missed',
    });
  }
  return { currentStreak: current, bestStreak: best, week, daysWithData: days.length };
}
