import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';
import { timingSafeEqualStr } from '../mail/mail-inbound';

/**
 * ── THE CITY COUNTS ITS VISITORS (owner, 16 Sep) ────────────────────────────
 *
 * "Add a counter for number of website visits, number of unique visits and
 * number of city members, let this be live counting, anyone clicking on
 * together city link should be counted here and mention start date too —
 * also password protect this page and keep the password Togethercity."
 *
 * WHAT A VISIT IS. One opening of togethercity.app in a browser tab: the app
 * sends one beacon when it boots, and not again while that tab lives (the
 * client remembers it in sessionStorage). A reload or a walk between rooms is
 * the same visit; a new tab, a new click on the link, or tomorrow is a new
 * one.
 *
 * WHAT A UNIQUE VISITOR IS. One browser. The app keeps a random id in
 * localStorage and sends it with the beacon; a browser that will not keep one
 * (private mode, storage blocked) is keyed by a one-way hash of its address
 * and user agent instead. Nothing personal is stored — no address, no agent,
 * no account: a key, a count and two dates.
 *
 * ONE ROW PER VISITOR, NOT ONE PER VISIT, and no shared counter row. A visit
 * is one upsert on the visitor's own row, so a thousand people arriving at
 * once never queue behind one lock. The totals are read by aggregating the
 * table, and that read is cached for a few seconds, because it is only ever
 * asked for by the Investor page.
 *
 * THE START DATE IS THE FIRST VISIT THE TABLE HOLDS — the day the counter
 * went live on that database — rather than a date typed into the source that
 * could disagree with the numbers under it.
 */

/** The shipped password, exactly as asked for. The check is here on the
 *  server; the web bundle never contains it. */
export const INVESTOR_PASSWORD = 'Togethercity';

export const investorPasswordOk = (presented: unknown): boolean =>
  typeof presented === 'string' && presented.length > 0 && timingSafeEqualStr(presented, INVESTOR_PASSWORD);

/** Crawlers, link previewers and uptime probes are not people clicking a link. */
const NOT_A_PERSON = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios\//i;

export const isAutomated = (ua: string): boolean => !ua || NOT_A_PERSON.test(ua);

const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The key a visit is counted under: the browser's own id when it sent a
 *  well-formed one, otherwise a hash that cannot be turned back into the
 *  address it came from. */
export function visitorKey(id: unknown, ip: string, ua: string): string {
  if (typeof id === 'string' && VISITOR_ID.test(id)) return `v:${id.toLowerCase()}`;
  return `h:${createHash('sha256').update(`tc-visit|${ip}|${ua}`).digest('hex').slice(0, 32)}`;
}

export interface VisitStats {
  visits: number;
  uniqueVisitors: number;
  members: number;
  /** The first visit counted, ISO. Null until somebody has visited. */
  countingSince: string | null;
  /** When these numbers were read, ISO. */
  at: string;
}

/** How long one reading is shared between everybody watching the page. */
const FRESH_MS = 4_000;

@Injectable()
export class VisitsService {
  private cached: { value: VisitStats; until: number } | null = null;
  private pending: Promise<VisitStats> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** One visit. Idempotent per key only in the sense that it adds one. */
  async record(key: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "SiteVisitor" ("id") VALUES (${key})
      ON CONFLICT ("id") DO UPDATE
        SET "visits" = "SiteVisitor"."visits" + 1, "lastAt" = CURRENT_TIMESTAMP`;
  }

  async stats(): Promise<VisitStats> {
    const now = Date.now();
    if (this.cached && this.cached.until > now) return this.cached.value;
    // Everybody asking during one read shares it.
    if (!this.pending) {
      this.pending = this.read()
        .then((value) => { this.cached = { value, until: Date.now() + FRESH_MS }; return value; })
        .finally(() => { this.pending = null; });
    }
    return this.pending;
  }

  private async read(): Promise<VisitStats> {
    const [rows, members] = await Promise.all([
      this.prisma.$queryRaw<Array<{ uniques: bigint; visits: bigint | null; since: Date | null }>>`
        SELECT COUNT(*) AS "uniques", SUM("visits") AS "visits", MIN("firstAt") AS "since"
        FROM "SiteVisitor"`,
      // A member is an account that exists: a deleted account is not one.
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);
    const r = rows[0];
    return {
      visits: Number(r?.visits ?? 0),
      uniqueVisitors: Number(r?.uniques ?? 0),
      members,
      countingSince: r?.since ? new Date(r.since).toISOString() : null,
      at: new Date().toISOString(),
    };
  }
}
