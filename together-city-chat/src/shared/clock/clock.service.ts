import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Fallback when a citizen has never set one. */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * The one place "now" and "today" are decided.
 *
 * Almost every date in this codebase was computed as
 * `new Date().toISOString().slice(0, 10)` — the UTC calendar day. For a citizen
 * in Asia/Kolkata that rolls over at 05:30 local, so "today's plate", "spent
 * this month" and every recordedOn date could name the wrong day for five and a
 * half hours out of every twenty-four. Two places already did it properly
 * (astrology, and the nutrition pantry settlement); this generalises what they
 * do rather than inventing a third convention.
 *
 * Timezone lives on MasterProfile.timeZone, which is already the documented
 * single source of truth for fields shared across hubs. Adding a second column
 * on User — as the backend brief suggests — would have created exactly the kind
 * of split this profile model exists to prevent.
 *
 * Injecting the clock also means tests can freeze it, which is what makes
 * DST-boundary and month-rollover cases testable at all.
 */
@Injectable()
export class ClockService {
  constructor(private readonly prisma: PrismaService) {}

  /** The current instant. Override this in tests rather than stubbing Date. */
  now(): Date {
    return new Date();
  }

  /** The citizen's IANA zone, falling back when unset or unparseable. */
  async timezoneFor(userId: string): Promise<string> {
    const row = await this.prisma.masterProfile
      .findUnique({ where: { userId }, select: { timeZone: true } })
      .catch(() => null);
    const tz = (row as { timeZone?: string | null } | null)?.timeZone;
    return this.validZone(tz) ? (tz as string) : DEFAULT_TIMEZONE;
  }

  /** Is this a zone Intl actually recognises? */
  validZone(tz?: string | null): boolean {
    if (!tz) return false;
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Which calendar day (YYYY-MM-DD) an instant falls on, in this zone.
   *
   * Use this for TIMESTAMPS — createdAt, recordedOn, anything written with
   * `new Date()`. An order placed at 01:00 in Asia/Kolkata is 19:30 the
   * previous day in UTC, so slicing its ISO string shows the citizen a date
   * they will not recognise as the day they did the thing.
   *
   * Do NOT use it for date-only columns. A birth date is stored as midnight
   * UTC and means one calendar day everywhere; rendering it through a negative
   * offset would move it backwards by one. Those stay on toISOString().
   *
   * 'en-CA' is used because it formats as ISO, which avoids hand-assembling
   * parts and getting the padding wrong.
   */
  dayIn(tz: string, at: Date): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(at);
    } catch {
      return at.toISOString().slice(0, 10);
    }
  }

  /** The calendar day it currently is for this zone. */
  todayIn(tz: string, at: Date = this.now()): string {
    return this.dayIn(tz, at);
  }

  /** The calendar day it currently is for this citizen. */
  async todayFor(userId: string, at: Date = this.now()): Promise<string> {
    return this.todayIn(await this.timezoneFor(userId), at);
  }

  /**
   * The citizen's calendar day as a DATE-ONLY value — midnight UTC on that date.
   *
   * For columns that mean "a day" rather than "an instant": the date a blood
   * sample was drawn, a birth date, a due date. Storing them this way is what
   * makes reading them back with toISOString() correct everywhere, which is why
   * those read sites are deliberately NOT converted to dayIn().
   *
   * The trap this avoids: defaulting such a column to `new Date()` stores an
   * instant, and the same column then means two different things depending on
   * which row you look at.
   */
  async dateOnlyFor(userId: string, at: Date = this.now()): Promise<Date> {
    return new Date(`${await this.todayFor(userId, at)}T00:00:00.000Z`);
  }

  /** The instant a zone's calendar day began, as a UTC Date. */
  startOfDayIn(tz: string, at: Date = this.now()): Date {
    const day = this.todayIn(tz, at);
    // Offset is derived from the zone's own rendering of `at`, so it is correct
    // across DST changes rather than assuming a fixed offset for the zone.
    const asUtc = new Date(`${day}T00:00:00Z`);
    const shown = new Date(this.formatInZone(tz, asUtc));
    const offsetMs = shown.getTime() - asUtc.getTime();
    return new Date(asUtc.getTime() - offsetMs);
  }

  private formatInZone(tz: string, at: Date): string {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(at).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
    return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}Z`;
  }
}
