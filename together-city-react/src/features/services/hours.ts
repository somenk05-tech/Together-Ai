/**
 * THE HOURS ON THE DOOR, ON THE BROWSER'S SIDE.
 *
 * The shape and the rule are the server's — `local-services/hours.ts` — and
 * this is the same rule compiled for the other half of the wire, plus the
 * words. The division is the one the reorder countdown already uses: THE
 * SERVER OWNS THE FACT (which days, what times), THE BROWSER OWNS THE CLOCK
 * ("open now", "closes at 6"). An open-now flag computed on the server would
 * be wrong the moment a page is left open, and a page that has to refetch to
 * stop saying OPEN at half past midnight is worse than one that never said it.
 *
 * WHY THE ARITHMETIC IS COPIED RATHER THAN SENT. It is eleven lines and it is
 * the only thing in this feature both sides must agree on, so both sides have
 * a test for it: the server's covers storage and the spill past midnight, and
 * `hours.test.ts` beside this file covers the sentence a citizen reads. A
 * single implementation would mean a round trip per minute.
 */

export interface DayHours {
  /** 0 = Monday … 6 = Sunday. See the note in the server's hours.ts: a
   *  business thinks in a working week, `getDay()` thinks in a calendar, and
   *  the conversion happens ONCE — in `todayIdx` below. */
  day: number;
  open: boolean;
  from: string;
  to: string;
}

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The one place `getDay()`'s Sunday-first order is turned into the working
 *  week's Monday-first one. */
export const todayIdx = (now: Date = new Date()): number => (now.getDay() + 6) % 7;
export const minutesNow = (now: Date = new Date()): number => now.getHours() * 60 + now.getMinutes();

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (hhmm: string): number | null => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** "18:30" → "6:30 pm". The city writes times the way people say them; the
 *  input under it stays 24-hour because that is what a time field speaks. */
export const clockLabel = (hhmm: string): string => {
  const m = minutesOf(hhmm);
  if (m === null) return hhmm;
  const h24 = Math.floor(m / 60), mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
};

export interface OpenState {
  /** Null when nobody has said — never false. "Closed now" is a claim about
   *  somebody's shop; "we were never told" is not, and a screen that renders
   *  the second as the first is putting words in their mouth. */
  open: boolean | null;
  until?: string;
  nextDay?: number;
  nextFrom?: string;
}

export function openStateAt(hours: DayHours[] | null | undefined, dayIdx: number, minutes: number): OpenState {
  if (!hours || hours.length !== 7) return { open: null };
  const spills = (h: DayHours) => {
    const f = minutesOf(h.from), t = minutesOf(h.to);
    return f !== null && t !== null && t <= f;
  };
  const yesterday = hours[(dayIdx + 6) % 7];
  if (yesterday.open && spills(yesterday)) {
    const t = minutesOf(yesterday.to) as number;
    if (minutes < t) return { open: true, until: yesterday.to };
  }
  const today = hours[dayIdx];
  if (today.open) {
    const f = minutesOf(today.from), t = minutesOf(today.to);
    if (f !== null && t !== null) {
      const inWindow = t > f ? minutes >= f && minutes < t : minutes >= f;
      if (inWindow) return { open: true, until: today.to };
      if (minutes < f) return { open: false, nextDay: dayIdx, nextFrom: today.from };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const d = (dayIdx + i) % 7;
    if (hours[d].open && minutesOf(hours[d].from) !== null) return { open: false, nextDay: d, nextFrom: hours[d].from };
  }
  return { open: false };
}

export const openStateNow = (hours: DayHours[] | null | undefined, now: Date = new Date()): OpenState =>
  openStateAt(hours, todayIdx(now), minutesNow(now));

/** The sentence under the badge: what a reader needs after "Open" or
 *  "Closed" — when it ends, or when it starts again. */
export function openSentence(s: OpenState, dayIdx: number): string | null {
  if (s.open === null) return null;
  if (s.open) return s.until ? `until ${clockLabel(s.until)}` : null;
  if (s.nextDay === undefined || !s.nextFrom) return 'no opening hours set for any day';
  if (s.nextDay === dayIdx) return `opens at ${clockLabel(s.nextFrom)}`;
  if (s.nextDay === (dayIdx + 1) % 7) return `opens tomorrow at ${clockLabel(s.nextFrom)}`;
  return `opens ${DAY_LONG[s.nextDay]} at ${clockLabel(s.nextFrom)}`;
}

/**
 * THE WEEK AS FEW LINES AS POSSIBLE — consecutive days with identical times
 * fold into one row: "Mon–Fri 9:00 am – 6:00 pm", "Sat 10:00 am – 2:00 pm",
 * "Sun closed". Seven identical lines is a table nobody reads; three lines is
 * the sign in the window.
 */
export function summarise(hours: DayHours[] | null | undefined): Array<{ label: string; when: string; closed: boolean }> {
  if (!hours || hours.length !== 7) return [];
  const key = (h: DayHours) => (h.open ? `${h.from}-${h.to}` : 'closed');
  const out: Array<{ label: string; when: string; closed: boolean }> = [];
  let start = 0;
  for (let d = 1; d <= 7; d++) {
    if (d < 7 && key(hours[d]) === key(hours[start])) continue;
    const end = d - 1;
    const h = hours[start];
    out.push({
      label: start === end ? DAY_SHORT[start] : `${DAY_SHORT[start]}–${DAY_SHORT[end]}`,
      when: h.open ? `${clockLabel(h.from)} – ${clockLabel(h.to)}` : 'Closed',
      closed: !h.open,
    });
    start = d;
  }
  return out;
}

/** A week to start editing from, when there is none: Mon–Sat 9–6, Sunday
 *  closed. A default is a suggestion and it is only ever shown inside the
 *  editor — nothing is stored until somebody presses Save. */
export const blankWeek = (): DayHours[] =>
  Array.from({ length: 7 }, (_, day) => ({ day, open: day < 6, from: '09:00', to: '18:00' }));
