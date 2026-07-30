import { addDays, daysBetween, instantAt, weekdayOf } from '../shared/clock/zone-time';

/**
 * Turning a schedule into dose instants.
 *
 * Pure on purpose: no database, no clock, no Nest. Everything that decides when
 * a citizen is told to take a medicine lives here so it can be tested against
 * DST boundaries, month ends and week filters directly, rather than inferred
 * from what the dispatcher happened to emit.
 */

/** How far ahead of the dose the citizen is told. The brief's five minutes. */
export const NOTIFY_LEAD_MS = 5 * 60 * 1000;

export type ScheduleSpec = {
  /** Local wall-clock times, "HH:MM", in `timezone`. */
  timesLocal: string[];
  /** Weekday numbers (0=Sunday). Null or empty means every day. */
  daysOfWeek: number[] | null;
  /** Calendar day, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive last day, or null for open-ended. */
  endDate: string | null;
  timezone: string;
};

/** The alarm instant for a dose: always exactly five minutes before. */
export function notifyAtFor(scheduledAtUtc: Date): Date {
  return new Date(scheduledAtUtc.getTime() - NOTIFY_LEAD_MS);
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Times a schedule may legally carry: real 24-hour clock times, deduped, sorted. */
export function normaliseTimes(times: string[]): string[] {
  const seen = new Set<string>();
  for (const t of times) {
    const trimmed = (t ?? '').trim();
    if (HHMM.test(trimmed)) seen.add(trimmed);
  }
  return [...seen].sort();
}

/**
 * Every dose instant this schedule implies inside [fromUtc, toUtc].
 *
 * The window is half-open at the end — `toUtc` itself is included — because the
 * horizon job asks for "the next N days" and dropping the final boundary dose
 * would leave one alarm unexpanded every night.
 *
 * Days are walked one wider than the window on each side: a local day can start
 * before and end after the UTC instants that bound it, so trimming to the
 * window's own calendar days would lose doses at either edge for any zone with
 * a non-zero offset.
 */
export function expandDoses(spec: ScheduleSpec, fromUtc: Date, toUtc: Date): Date[] {
  const times = normaliseTimes(spec.timesLocal);
  if (times.length === 0 || fromUtc > toUtc) return [];

  const windowFirstDay = addDays(fromUtc.toISOString().slice(0, 10), -1);
  const windowLastDay = addDays(toUtc.toISOString().slice(0, 10), 1);

  const firstDay = spec.startDate > windowFirstDay ? spec.startDate : windowFirstDay;
  const lastDay = spec.endDate && spec.endDate < windowLastDay ? spec.endDate : windowLastDay;

  const wanted = spec.daysOfWeek && spec.daysOfWeek.length > 0 ? new Set(spec.daysOfWeek) : null;

  const out: Date[] = [];
  for (const day of daysBetween(firstDay, lastDay)) {
    if (wanted && !wanted.has(weekdayOf(day))) continue;
    for (const hhmm of times) {
      const at = instantAt(spec.timezone, day, hhmm);
      if (at >= fromUtc && at <= toUtc) out.push(at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}


/** Where a dose stands right now, for the today view. */
export type DoseStatus = 'taken' | 'skipped' | 'missed' | 'due' | 'upcoming';

/**
 * What to show against one dose.
 *
 * The rule worth writing down is the one this function REFUSES to apply: an
 * unanswered dose whose time has passed is `due`, never `missed`. Deciding a
 * dose was missed belongs to the hourly sweep, which has its own grace window;
 * a second place allowed to reach that conclusion would disagree with the first
 * for two hours of every dose, and the citizen would see one answer on the page
 * and a different one in their log.
 *
 * A logged action always wins, including a `missed` the sweep wrote — that is a
 * fact about the record, and hiding it would stop somebody correcting it.
 */
export function doseStatus(
  scheduledAtUtc: Date,
  now: Date,
  logged?: { action: string } | null,
): DoseStatus {
  if (logged) {
    const a = logged.action;
    if (a === 'taken' || a === 'skipped' || a === 'missed') return a;
  }
  return scheduledAtUtc <= now ? 'due' : 'upcoming';
}
