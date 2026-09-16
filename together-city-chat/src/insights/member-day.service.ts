import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { swallow } from '../shared/swallow';
import { cityDay, systemOfPath } from './insights-math';

/**
 * ── ONE ROW A DAY PER MEMBER (owner, 16 Sep) ───────────────────────────────
 *
 * What the dashboard needs and the city did not keep: WHICH DAYS a member was
 * here and WHICH SYSTEMS they used on them. `User.lastSeen` is one date and
 * forgets yesterday, so "active this week" could be counted for today and never
 * for last week — no trend, no retention, no cohort.
 *
 * A signed-in API request marks the member active for the city day, and names
 * the system its path belongs to. At most one write per member, per day, per
 * system, per server: the set below remembers what has been written. Losing
 * that set to a restart costs one repeated upsert, never a wrong number.
 *
 * Nothing about the request is stored — no path, no body, no address. A day,
 * and the names of the systems used on it.
 */
@Injectable()
export class MemberDayService {
  private readonly seen = new Set<string>();
  private seenDay = '';

  constructor(private readonly prisma: PrismaService) {}

  /** Called for every signed-in request; returns at once. */
  touch(userId: string, path: string, now = new Date()): void {
    const day = cityDay(now);
    if (day !== this.seenDay) { this.seen.clear(); this.seenDay = day; }
    const system = systemOfPath(path) ?? '';
    const key = `${userId}|${system}`;
    if (this.seen.has(key)) return;
    if (this.seen.size > 200_000) this.seen.clear();
    this.seen.add(key);
    void swallow(this.write(userId, day, system), 'insights: member day', {});
  }

  private write(userId: string, day: string, system: string): Promise<number> {
    const systems = system ? [system] : [];
    return this.prisma.$executeRaw`
      INSERT INTO "MemberDay" ("userId", "day", "systems") VALUES (${userId}, ${day}, ${systems}::text[])
      ON CONFLICT ("userId", "day") DO UPDATE SET "systems" =
        CASE WHEN ${system} = '' OR ${system} = ANY("MemberDay"."systems") THEN "MemberDay"."systems"
             ELSE array_append("MemberDay"."systems", ${system}) END`;
  }
}
