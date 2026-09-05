/**
 * FIVE FREE PROFILE CHANGES A MONTH, THEN ₹50 EACH — owner rule, 5 Sep.
 *
 * Every personalisation in the city is written from a profile and kept until
 * that profile changes (see `AiSuggestionsService.remembered`). So a profile
 * edit is the one act that makes the city spend again, and a citizen who
 * re-saves a profile forty times a month is forty personalisations. Five
 * changes a month is enough for anybody keeping a record honest; past five,
 * each change is ₹50 or a wait for the first of next month.
 *
 * ONE COUNTER ACROSS THE WHOLE RECORD — the Master Profile and every hub
 * profile (Beauty, Fitness, Nutrition preferences, Astrology birth details,
 * Dating, Jobs) — because that is what the owner chose: five changes to who
 * you are, wherever you make them. A save that changes nothing is not a
 * change and is never counted; the services compare before and after.
 *
 * CALENDAR MONTH, in UTC. "Come back next month" is a date on the wall, and
 * the reset is the same instant for everybody, which is simpler to say and
 * simpler to check than a rolling window that differs per citizen.
 *
 * A CHANGE IS A SITTING, NOT A KEYSTROKE. The Master Profile saves every
 * field on blur, so one evening spent filling in a record is a dozen saves.
 * Five of those would spend the month in ten minutes and charge the sixth
 * field, which is not what "five changes a month" means. Saves within
 * fifteen minutes of the last counted one belong to the same change: counted
 * once, priced once. Come back tomorrow and change something else — that is
 * the second.
 *
 * Pure. The service counts the rows; this decides what the count means.
 */

export const FREE_EDITS_PER_MONTH = 5;
export const EXTRA_EDIT_INR = 50;
/** Saves this close together are one change. */
export const SITTING_MINUTES = 15;

export interface EditQuota {
  freePerMonth: number;
  used: number;
  freeLeft: number;
  /** What the NEXT change costs — 0 or ₹50. */
  priceInr: number;
  extraPriceInr: number;
  /** The first instant of next month, ISO — when the five come back. */
  resetsAt: string;
  /** True while a save would join the last counted change rather than start one. */
  inSitting: boolean;
}

export function monthStart(nowMs: number): Date {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function nextMonthStart(nowMs: number): Date {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export function inSitting(lastCountedMs: number | null | undefined, nowMs: number): boolean {
  return typeof lastCountedMs === 'number' && Number.isFinite(lastCountedMs)
    && nowMs - lastCountedMs >= 0 && nowMs - lastCountedMs < SITTING_MINUTES * 60_000;
}

export function editQuota(editsThisMonth: number, nowMs: number, lastCountedMs?: number | null): EditQuota {
  const used = Math.max(0, Math.floor(editsThisMonth));
  const freeLeft = Math.max(0, FREE_EDITS_PER_MONTH - used);
  const sitting = inSitting(lastCountedMs, nowMs);
  return {
    freePerMonth: FREE_EDITS_PER_MONTH,
    used,
    freeLeft,
    priceInr: sitting || freeLeft > 0 ? 0 : EXTRA_EDIT_INR,
    extraPriceInr: EXTRA_EDIT_INR,
    resetsAt: nextMonthStart(nowMs).toISOString(),
    inSitting: sitting,
  };
}

/** One canonical string per value, so "changed" means the citizen's answer moved. */
function canonical(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  if (typeof v === 'string') return JSON.stringify(v.trim());
  return JSON.stringify(v);
}

/**
 * Did this save change anything? Keys the patch does not mention are not
 * compared — `undefined` means "not in this save", which is the convention
 * every hub's PATCH already follows — and a value re-sent as it stands is
 * not a change. Objects and lists are compared by content.
 */
export function profileChanged(before: Record<string, unknown> | null | undefined, patch: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (canonical(before?.[k]) !== canonical(v)) return true;
  }
  return false;
}
