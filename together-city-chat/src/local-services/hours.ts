/**
 * WHEN A BUSINESS IS ACTUALLY OPEN.
 *
 * The owner, 16 Aug: which days, what times, set once. Everything about the
 * shape below follows from "set once" — this is not a calendar, it is the
 * sentence on a shop door, and a shop door does not have exceptions for the
 * third Tuesday in March.
 *
 * ── SEVEN ROWS, ALWAYS, AND `null` IS A DIFFERENT ANSWER ────────────────────
 *
 * Stored hours are always seven rows, Monday first, because a missing row and
 * a closed day are the same thing to a reader and must not be the same thing
 * to the code: "we are shut on Sunday" is a fact the owner stated, and "we
 * never said" is not. The WHOLE object is null until somebody sets it, and a
 * page that has never been given hours says so rather than drawing an empty
 * week that reads as "closed forever".
 *
 * ── DAY 0 IS MONDAY, AND THAT IS A DECISION ─────────────────────────────────
 *
 * JavaScript's `getDay()` is 0=Sunday, which is right for a calendar grid and
 * wrong for a working week — a business thinks Mon–Sat with Sunday at the end.
 * Storing the business order and converting ONCE at the clock
 * (`(jsDay + 6) % 7`) keeps the conversion in one line that can be tested,
 * instead of in every loop that prints a row.
 *
 * ── TIMES ARE STRINGS, AND THE ARITHMETIC IS MINUTES ────────────────────────
 *
 * "HH:MM", 24-hour, zero-padded — what `<input type="time">` produces and what
 * a human can read in a database row. Nothing here parses them into Dates: a
 * Date needs a timezone and a date, and this object has neither. Comparisons
 * happen in minutes-since-midnight, which is the only unit that survives both.
 *
 * ── AND A CLOSING TIME MAY BE BEFORE ITS OPENING TIME ───────────────────────
 *
 * 18:00–01:00 is a real answer for a restaurant, and the naive `from < to`
 * validation would refuse it. So a row where `to <= from` is read as spilling
 * past midnight, and `isOpenAt` checks yesterday's spill as well as today's
 * window. This is the one piece of arithmetic in this file worth a test.
 */

export interface DayHours {
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  open: boolean;
  /** "HH:MM", 24-hour. Meaningless when `open` is false, and kept anyway so
   *  reopening a day does not lose the times somebody typed. */
  from: string;
  to: string;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight, or null when the string is not a clock time. */
export const minutesOf = (hhmm: string): number | null => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const clean = (hhmm: unknown, fallback: string): string =>
  typeof hhmm === 'string' && HHMM.test(hhmm) ? hhmm : fallback;

/**
 * Anything into seven ordered rows — used on the way IN from a client and on
 * the way OUT of the database, because a JSON column is a string somebody may
 * one day have edited by hand, and a reader that trusts its own writes has
 * never met a migration.
 *
 * Returns null for "nothing usable in here", which is the same answer as never
 * having been set. A half-filled week is not a week.
 */
export function normaliseHours(raw: unknown): DayHours[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const byDay = new Map<number, DayHours>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { day, open, from, to } = item as Record<string, unknown>;
    const d = typeof day === 'number' ? Math.floor(day) : NaN;
    if (!Number.isInteger(d) || d < 0 || d > 6 || byDay.has(d)) continue;
    byDay.set(d, {
      day: d,
      open: open === true,
      from: clean(from, '09:00'),
      to: clean(to, '18:00'),
    });
  }
  if (byDay.size === 0) return null;
  /* THE MISSING DAYS ARE FILLED AS CLOSED rather than dropped. A client that
     sends only the days it opens is saying the rest are shut, and storing that
     explicitly is what lets the page say "closed on Sunday" instead of going
     quiet about it. */
  return Array.from({ length: 7 }, (_, d) => byDay.get(d) ?? { day: d, open: false, from: '09:00', to: '18:00' });
}

/** What came out of the column, or null. Never throws on bad JSON — a listing
 *  with an unreadable hours blob is a listing with no hours, not a 500. */
export function parseHours(json: string | null | undefined): DayHours[] | null {
  if (!json) return null;
  try {
    return normaliseHours(JSON.parse(json));
  } catch {
    return null;
  }
}

export interface OpenState {
  /** Null when there are no hours at all — different from `false`, and every
   *  screen has to keep it different: "closed now" is a claim, "we were never
   *  told" is not. */
  open: boolean | null;
  /** "HH:MM" the current window ends, when open. */
  until?: string;
  /** The next opening, when closed: day index and time. */
  nextDay?: number;
  nextFrom?: string;
}

/**
 * OPEN OR NOT, AT A GIVEN MOMENT — with the moment passed in rather than read.
 *
 * A function that calls `new Date()` itself cannot be tested at 23:50 on a
 * Saturday, which is exactly the case that matters here (the spill past
 * midnight into Sunday). The caller owns the clock; this owns the rule.
 */
export function openStateAt(hours: DayHours[] | null, dayIdx: number, minutes: number): OpenState {
  if (!hours || hours.length !== 7) return { open: null };

  const spills = (h: DayHours): boolean => {
    const f = minutesOf(h.from), t = minutesOf(h.to);
    return f !== null && t !== null && t <= f;
  };

  const todayRow = hours[dayIdx];
  const yesterday = hours[(dayIdx + 6) % 7];

  /* YESTERDAY FIRST, because at 00:30 on Sunday the answer is Saturday's
     18:00–01:00 window and nothing in Sunday's row can tell you that. */
  if (yesterday.open && spills(yesterday)) {
    const t = minutesOf(yesterday.to) as number;
    if (minutes < t) return { open: true, until: yesterday.to };
  }

  if (todayRow.open) {
    const f = minutesOf(todayRow.from), t = minutesOf(todayRow.to);
    if (f !== null && t !== null) {
      const inWindow = t > f ? minutes >= f && minutes < t : minutes >= f;
      if (inWindow) return { open: true, until: todayRow.to };
      if (minutes < f) return { open: false, nextDay: dayIdx, nextFrom: todayRow.from };
    }
  }

  /* THE NEXT DOOR THAT OPENS, looked for over the following week and no
     further. Seven steps is the whole cycle; an eighth would be answering the
     same question twice, and a business with every day closed genuinely has no
     next opening — which is reported as an absence rather than as a guess. */
  for (let i = 1; i <= 7; i++) {
    const d = (dayIdx + i) % 7;
    if (hours[d].open && minutesOf(hours[d].from) !== null) {
      return { open: false, nextDay: d, nextFrom: hours[d].from };
    }
  }
  return { open: false };
}
