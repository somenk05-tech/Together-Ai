import { describe, expect, it } from 'vitest';
import { adherenceOf } from './adherence';
import type { DoseLogRow } from './api';

const row = (day: string, action: DoseLogRow['action']): DoseLogRow =>
  ({ id: `${day}-${Math.random()}`, medicine: 'Metformin', dosage: '500mg', scheduledAtUtc: `${day}T08:00:00Z`, actedAtUtc: null, action, note: null });

const NOW = new Date('2026-08-01T12:00:00Z');

describe('adherence (FE-6.2)', () => {
  it('no data yields no streak — not a zero that reads like failure', () => {
    const a = adherenceOf([], NOW);
    expect(a.currentStreak).toBe(0);
    expect(a.daysWithData).toBe(0);
    expect(a.week.every((d) => d.state === 'none')).toBe(true);
  });

  it('a missed dose breaks the streak; the best streak survives history', () => {
    const rows = [
      row('2026-07-28', 'taken'), row('2026-07-28', 'taken'),
      row('2026-07-29', 'taken'), row('2026-07-29', 'missed'), // partial day breaks it
      row('2026-07-30', 'taken'),
      row('2026-07-31', 'taken'),
      row('2026-08-01', 'taken'),
    ];
    const a = adherenceOf(rows, NOW);
    expect(a.currentStreak).toBe(3); // 30, 31, 1
    expect(a.bestStreak).toBe(3);
    expect(a.week.map((d) => d.state)).toEqual(['none', 'none', 'clear', 'partial', 'clear', 'clear', 'clear']);
  });

  it('an old streak is history, not "current"', () => {
    const rows = [row('2026-07-20', 'taken'), row('2026-07-21', 'taken')];
    const a = adherenceOf(rows, NOW);
    expect(a.currentStreak).toBe(0);
    expect(a.bestStreak).toBe(2);
  });

  it('skipped is not taken — a deliberate skip still ends a clear day', () => {
    const rows = [row('2026-08-01', 'taken'), row('2026-08-01', 'skipped')];
    const a = adherenceOf(rows, NOW);
    expect(a.currentStreak).toBe(0);
    expect(a.week[6].state).toBe('partial');
  });
});
