import { http as api } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Programme, ProgrammeDay } from './api';

/**
 * ── TWO DIVISIONS, ONE MONTH (owner, 18 Sep) ────────────────────────────────
 *
 * The month runs one of two templates — the gym plan or the home plan — and
 * the citizen chooses which. The choice is the profile's `place`, written
 * through its own unmetered route, so today's session follows the same
 * choice without a second field. Beside api.ts rather than in it: the
 * month's new fields and the one mutation live here.
 */
export type DivisionKey = 'gym' | 'home';

export interface ProgrammeDivision { key: DivisionKey; name: string; tag: string; splitName: string }
export interface ProgrammeWeek { week: 1 | 2 | 3 | 4; label: string; line: string; from: string; to: string }

/** What the month carries since 18 Sep, on top of the Programme the page has
 *  always read. A month built before this deploy is missing them, so every
 *  reader below has a fallback. */
export interface MonthWithDivision extends Programme {
  division: ProgrammeDivision | null;
  weeks: ProgrammeWeek[];
  days: (ProgrammeDay & { minutes?: number })[];
}

export function monthOf(m: Programme): MonthWithDivision {
  const x = m as MonthWithDivision;
  return {
    ...x,
    division: x.division ?? null,
    weeks: x.weeks ?? ([1, 2, 3, 4] as const).map((week) => {
      const first = m.days.find((d) => d.week === week);
      const last = [...m.days].reverse().find((d) => d.week === week);
      return { week, label: m.phases[week - 1]?.label ?? `Week ${week}`, line: m.phases[week - 1]?.note ?? '', from: first?.date ?? m.startDate, to: last?.date ?? m.startDate };
    }),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '1 – 7 Sep 2026', or '29 Sep – 5 Oct 2026' across a month's edge. */
export function dateSpan(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00Z`), b = new Date(`${to}T00:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  return sameMonth
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/**
 * The tab that picks the division. The server answers with the rebuilt month,
 * which is written straight under the month's key so the rows redraw from
 * the answer; the session is invalidated because today's plan now follows
 * the other template, and the profile because its `place` is behind.
 */
export function useChoosePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { place: DivisionKey }) => api.put<Programme>('/fitness/programme/place', input).then((r) => r.data),
    onSuccess: (month) => {
      qc.setQueryData(['fitness', 'programme'], month);
      void qc.invalidateQueries({ queryKey: ['fitness', 'session'] });
      void qc.invalidateQueries({ queryKey: ['fitness', 'profile'] });
    },
  });
}
