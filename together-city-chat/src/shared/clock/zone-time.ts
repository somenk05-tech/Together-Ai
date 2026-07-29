/**
 * Wall-clock arithmetic for a named zone, with no dependencies.
 *
 * A medicine schedule is "08:00 every day", which is a wall-clock fact, not an
 * instant. Storing the instant instead would silently move the dose by an hour
 * the night a zone changes offset — the citizen keeps taking it at 08:00 and the
 * alarm starts arriving at 07:00. So local times are stored as text plus a zone,
 * and converted to instants at the moment they are expanded.
 *
 * ClockService uses these too, so there is one implementation of the offset
 * trick rather than one per caller.
 */

/** How far ahead of UTC `tz` was at this instant, in milliseconds. */
export function offsetMsAt(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}Z`);
  return shown - at.getTime();
}

/**
 * The UTC instant at which `tz` reads `day` `hhmm`.
 *
 * Two passes, not one. The offset has to be sampled at the answer, but the
 * answer is what we are solving for — so the first pass samples at the naive
 * instant and the second re-samples at the result. Without the second pass every
 * dose in the hours around a transition is off by the size of the change.
 *
 * The unrepresentable case is deliberate: on a spring-forward day 02:30 does not
 * exist, and this returns the instant the clock actually reads once it has
 * jumped (03:30 local). A dose is better taken an hour late than skipped for the
 * day, and the alternative — refusing to schedule — would silently drop a dose.
 */
export function instantAt(tz: string, day: string, hhmm: string): Date {
  const naive = Date.parse(`${day}T${hhmm.length === 5 ? hhmm : hhmm.slice(0, 5)}:00Z`);
  if (Number.isNaN(naive)) throw new RangeError(`Unparseable local time: ${day} ${hhmm}`);
  const firstPass = naive - offsetMsAt(tz, new Date(naive));
  const refined = naive - offsetMsAt(tz, new Date(firstPass));
  return new Date(refined);
}

/** A calendar day string shifted by whole days. Pure string/UTC math. */
export function addDays(day: string, delta: number): string {
  const at = new Date(`${day}T12:00:00Z`); // noon: never near a date boundary
  at.setUTCDate(at.getUTCDate() + delta);
  return at.toISOString().slice(0, 10);
}

/** Weekday of a calendar day, 0=Sunday — independent of any zone. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** Inclusive day iteration, capped so a bad range can never spin forever. */
export function daysBetween(fromDay: string, toDay: string, cap = 400): string[] {
  const out: string[] = [];
  let cur = fromDay;
  while (cur <= toDay && out.length < cap) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
