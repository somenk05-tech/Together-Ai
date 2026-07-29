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

/** What a zone's clock reads at an instant, as "HH:MM". */
export function wallTimeIn(tz: string, at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at);
}

/**
 * The UTC instant at which `tz` reads `day` `hhmm`.
 *
 * Two candidates, then a round-trip check. The offset has to be sampled at the
 * answer, but the answer is what we are solving for: the first candidate samples
 * at the naive instant, the second re-samples at the first. Whichever actually
 * reads back as the requested wall time is the right one — checking rather than
 * trusting the second pass is what makes the transition days correct instead of
 * merely close.
 *
 * When NEITHER reads back, the requested time does not exist: on a
 * spring-forward day the clock jumps 02:00 -> 03:00 and 02:30 never happens. The
 * later instant is taken, which puts the dose just after the jump. That is
 * deliberate — the two honest options are an hour early or an hour late, and for
 * a medicine an hour late is the safer error, since firing early can bunch two
 * doses closer together than they were prescribed to be. Skipping the day
 * outright, which is what throwing would amount to, is not an option at all.
 */
export function instantAt(tz: string, day: string, hhmm: string): Date {
  const want = hhmm.length === 5 ? hhmm : hhmm.slice(0, 5);
  const naive = Date.parse(`${day}T${want}:00Z`);
  if (Number.isNaN(naive)) throw new RangeError(`Unparseable local time: ${day} ${hhmm}`);

  const first = naive - offsetMsAt(tz, new Date(naive));
  const second = naive - offsetMsAt(tz, new Date(first));

  for (const candidate of [second, first]) {
    if (wallTimeIn(tz, new Date(candidate)) === want) return new Date(candidate);
  }
  return new Date(Math.max(first, second));
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
