import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { sandboxAllowed } from '../commerce/provider';
import {
  ACTIVATION, ACTIVE_WINDOWS, CACHE_MS, CITY_TIME_ZONE, MIN_GROUP, RETAINED, RETENTION_DAYS, RETENTION_WIDTH,
  SOURCES, SYSTEMS, type RangeKey, type SourceKey,
} from './insights.config';
import {
  addDays, ageBandOf, boundsOf, change, cityDay, cityOf, daysBetween, foldSmall, pointChange, rate,
  type Bounds, type Change,
} from './insights-math';
import { REQUEST_STATS } from './insights.interceptor';

/**
 * ── THE CONTROL ROOM BEHIND THE CITY (owner, 16 Sep) ───────────────────────
 *
 * Every number on /investor/analytics is read here, from the city's own
 * tables, and nowhere else. The rules are in insights.config.ts; the arithmetic
 * in insights-math.ts; what each number means in docs/insights.md.
 *
 * THREE KINDS OF ANSWER, AND THE PAGE PRINTS EACH DIFFERENTLY:
 *   a number   — measured;
 *   null       — could not be measured (the reason travels in `notes`);
 *   a Metric with `status: 'not-measured'` — nothing records it yet.
 * Nothing here invents a figure. Sample data exists only in the web client,
 * behind a switch, and is labelled on every card.
 *
 * AGGREGATES ONLY. No name, email, phone, message, record or document leaves
 * this file. Group tables fold anything smaller than MIN_GROUP into "Other".
 * The activity feed says what happened and when — never who.
 */

export type View = 'founder' | 'investor';
export type MetricStatus = 'live' | 'not-measured' | 'not-enough-data';

export interface Metric {
  value: number | null;
  /** Same metric, previous equal window. */
  previous: number | null;
  change: Change;
  /** 'pct' changes are relative; 'pts' are percentage-point moves of a rate. */
  changeKind: 'pct' | 'pts';
  status: MetricStatus;
  note: string | null;
}

const MS_DAY = 86_400_000;
/** How the phone apps' platform codes are said on the page. */
const APP_LABEL: Record<string, string> = { ios: 'iOS', android: 'Android', web: 'Web' };
const TZ = CITY_TIME_ZONE;

/** A day's first instant as an ISO string with the city's offset. */
const startOf = (day: string) => `${day}T00:00:00+05:30`;

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

function metric(value: number | null, previous: number | null, opts: { kind?: 'pct' | 'pts'; base?: number; status?: MetricStatus; note?: string | null } = {}): Metric {
  const kind = opts.kind ?? 'pct';
  const ch = kind === 'pts' ? pointChange(value, previous, opts.base ?? 0) : change(value, previous);
  return { value, previous, change: ch, changeKind: kind, status: opts.status ?? 'live', note: opts.note ?? null };
}

const notMeasured = (note: string): Metric => ({
  value: null, previous: null, change: { pct: null, note }, changeKind: 'pct', status: 'not-measured', note,
});

/**
 * ONE SQL FRAGMENT FOR "WHO WAS ACTIVE WHEN": a member-day from member-day.ts,
 * or any record a member created in one of the eight systems, as
 * (userId, day, system). Table and column names come from insights.config.ts,
 * never from a request; the window arrives as parameters.
 */
function activitySql(fromParam: string, toParam: string): string {
  const parts = [
    `SELECT md."userId" AS uid, md."day" AS day, s.sys AS system
       FROM "MemberDay" md LEFT JOIN LATERAL unnest(md."systems") AS s(sys) ON true
      WHERE md."day" >= to_char((${fromParam})::timestamptz AT TIME ZONE '${TZ}', 'YYYY-MM-DD')
        AND md."day" < to_char((${toParam})::timestamptz AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`,
  ];
  for (const sys of SYSTEMS) {
    for (const src of sys.sources) {
      parts.push(
        `SELECT "${src.user}" AS uid,
                to_char(("${src.at}" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day,
                '${sys.key}' AS system
           FROM "${src.table}"
          WHERE "${src.user}" IS NOT NULL
            AND "${src.at}" >= ((${fromParam})::timestamptz AT TIME ZONE 'UTC')
            AND "${src.at}" < ((${toParam})::timestamptz AT TIME ZONE 'UTC')
            ${src.where ? `AND ${src.where}` : ''}`,
      );
    }
  }
  return parts.join('\nUNION ALL\n');
}

/** The first moment the city has any record of, for "all time". */
const EPOCH = '2020-01-01T00:00:00+05:30';

@Injectable()
export class InsightsService {
  private readonly log = new Logger('Insights');
  private readonly cache = new Map<string, { until: number; value: unknown }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Read once a minute per section, range and view; concurrent asks share the read. */
  private async cached<T>(key: string, read: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value as T;
    const value = await read();
    if (this.cache.size > 200) this.cache.clear();
    this.cache.set(key, { until: Date.now() + CACHE_MS, value });
    return value;
  }

  private async rows<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(sql, ...params);
  }

  /** A table another piece of work adds (AiCall, UsageDay) may not exist yet. */
  private async tableExists(name: string): Promise<boolean> {
    const r = await this.rows<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, `"${name}"`).catch(() => []);
    return Boolean(r[0]?.ok);
  }

  /** Distinct members active between two instants (ISO), overall and per system. */
  private async active(fromIso: string, toIso: string): Promise<{ all: number; bySystem: Record<string, number> }> {
    const r = await this.rows<{ system: string | null; n: bigint }>(
      `SELECT system, COUNT(DISTINCT uid) AS n FROM (${activitySql('$1', '$2')}) a
        GROUP BY GROUPING SETS ((system), ())`, fromIso, toIso);
    const bySystem: Record<string, number> = {};
    let all = 0;
    for (const x of r) {
      if (x.system === null) {
        // Both the grand total and the "no system" group arrive with a null key;
        // the grand total is the larger.
        all = Math.max(all, num(x.n));
      } else bySystem[x.system] = num(x.n);
    }
    return { all, bySystem };
  }

  private async membersAt(iso: string): Promise<number> {
    const r = await this.rows<{ n: bigint }>(
      `SELECT COUNT(*) AS n FROM "User"
        WHERE "createdAt" < (($1)::timestamptz AT TIME ZONE 'UTC')
          AND ("deletedAt" IS NULL OR "deletedAt" >= (($1)::timestamptz AT TIME ZONE 'UTC'))`, iso);
    return num(r[0]?.n);
  }

  private async joined(fromIso: string, toIso: string): Promise<number> {
    const r = await this.rows<{ n: bigint }>(
      `SELECT COUNT(*) AS n FROM "User"
        WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "createdAt" < (($2)::timestamptz AT TIME ZONE 'UTC')`,
      fromIso, toIso);
    return num(r[0]?.n);
  }

  /** Window instants for a range: [from, to) and the one before it. */
  private windowOf(b: Bounds) {
    const toIso = startOf(addDays(b.to, 1));
    const fromIso = b.from ? startOf(b.from) : EPOCH;
    const prevFromIso = b.prevFrom ? startOf(b.prevFrom) : null;
    return { fromIso, toIso, prevFromIso, prevToIso: b.from ? startOf(b.from) : null };
  }

  // ───────────────────────────── OVERVIEW ─────────────────────────────

  async overview(range: RangeKey, view: View, now = new Date()) {
    return this.cached(`overview:${range}:${view}`, async () => {
      const b = boundsOf(range, now);
      const w = this.windowOf(b);
      const today = cityDay(now);
      const tomorrow = startOf(addDays(today, 1));
      const ago = (n: number) => startOf(addDays(today, -(n - 1)));

      const [
        members, membersBefore, newNow, newPrev,
        dau, dauPrev, wau, wauPrev, mau, mauPrev,
        activeRange, activePrev, retention, session, visitors, growth, funnel,
      ] = await Promise.all([
        this.membersAt(tomorrow),
        w.prevToIso ? this.membersAt(w.prevToIso) : Promise.resolve(null),
        this.joined(w.fromIso, w.toIso),
        w.prevFromIso && w.prevToIso ? this.joined(w.prevFromIso, w.prevToIso) : Promise.resolve(null),
        this.active(ago(ACTIVE_WINDOWS.today), tomorrow),
        this.active(ago(ACTIVE_WINDOWS.today + 1), ago(ACTIVE_WINDOWS.today)),
        this.active(ago(ACTIVE_WINDOWS.week), tomorrow),
        this.active(startOf(addDays(today, -(2 * ACTIVE_WINDOWS.week - 1))), ago(ACTIVE_WINDOWS.week)),
        this.active(ago(ACTIVE_WINDOWS.month), tomorrow),
        this.active(startOf(addDays(today, -(2 * ACTIVE_WINDOWS.month - 1))), ago(ACTIVE_WINDOWS.month)),
        this.active(w.fromIso, w.toIso),
        w.prevFromIso && w.prevToIso ? this.active(w.prevFromIso, w.prevToIso) : Promise.resolve(null),
        this.retention(now),
        this.sessionLength(w.fromIso, w.toIso, w.prevFromIso, w.prevToIso),
        this.visitorsIn(w.fromIso, w.toIso),
        this.growthSeries(b, now),
        this.funnel(b, now),
      ]);

      const aiNow = activeRange.bySystem.assistant ?? 0;
      const interactionsNow = await this.interactions(w.fromIso, w.toIso);
      const interactionsPrev = w.prevFromIso && w.prevToIso ? await this.interactions(w.prevFromIso, w.prevToIso) : null;
      const systemsPerMember = await this.systemsDepth(w.fromIso, w.toIso);

      const d7 = retention.overall.find((r) => r.day === 7) ?? null;
      const pulse = {
        members: metric(members, membersBefore),
        activeToday: metric(dau.all, dauPrev.all),
        activeWeek: metric(wau.all, wauPrev.all),
        activeMonth: metric(mau.all, mauPrev.all),
        newMembers: metric(newNow, newPrev),
        growthRate: membersBefore && membersBefore > 0
          ? metric(rate(members - membersBefore, membersBefore), null, { kind: 'pts', base: membersBefore })
          : { ...notMeasured(range === 'all' ? 'Growth needs a start date — pick a window.' : 'No members before this window to grow from.'), status: 'not-enough-data' as const },
        d7Retention: d7 && d7.rate !== null
          ? metric(d7.rate, null, { kind: 'pts', base: d7.members })
          : { ...notMeasured('Not enough data yet: the first cohorts are not seven days old.'), status: 'not-enough-data' as const },
        avgSession: session,
      };

      return {
        range, view, from: b.from, to: b.to, prevFrom: b.prevFrom, prevTo: b.prevTo,
        countingSince: visitors.since,
        tracking: await this.trackingSince(),
        pulse,
        snapshot: {
          members: pulse.members,
          newMembers: pulse.newMembers,
          activeWeek: pulse.activeWeek,
          d7Retention: pulse.d7Retention,
          systemsPerMember: metric(systemsPerMember.average, null),
          aiUsers: metric(aiNow, activePrev?.bySystem.assistant ?? null),
          paying: (await this.money(view)).paying,
          visitors: metric(visitors.unique, null),
        },
        changes: [
          { key: 'members', label: 'Members', change: pulse.members.change, kind: 'pct' },
          { key: 'active', label: 'Active members', change: change(activeRange.all, activePrev?.all ?? null), kind: 'pct' },
          { key: 'ai', label: 'City Assistant use', change: change(interactionsNow.assistant ?? 0, interactionsPrev ? (interactionsPrev.assistant ?? 0) : null), kind: 'pct' },
          { key: 'signups', label: 'New members', change: pulse.newMembers.change, kind: 'pct' },
          { key: 'interactions', label: 'Interactions', change: change(sum(interactionsNow), interactionsPrev ? sum(interactionsPrev) : null), kind: 'pct' },
        ],
        growth,
        funnel,
      };
    });
  }

  private async trackingSince(): Promise<{ memberDays: string | null; origins: string | null; visitors: string | null }> {
    const r = await this.rows<{ md: string | null; mo: Date | null; sv: Date | null }>(
      `SELECT (SELECT MIN("day") FROM "MemberDay") AS md,
              (SELECT MIN("createdAt") FROM "MemberOrigin") AS mo,
              (SELECT MIN("firstAt") FROM "SiteVisitor" WHERE "source" IS NOT NULL) AS sv`).catch(() => []);
    const x = r[0];
    return {
      memberDays: x?.md ?? null,
      origins: x?.mo ? new Date(x.mo).toISOString() : null,
      visitors: x?.sv ? new Date(x.sv).toISOString() : null,
    };
  }

  private async visitorsIn(fromIso: string, toIso: string): Promise<{ unique: number; visits: number; since: string | null }> {
    const r = await this.rows<{ u: bigint; v: bigint | null; since: Date | null }>(
      `SELECT COUNT(*) FILTER (WHERE "firstAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "firstAt" < (($2)::timestamptz AT TIME ZONE 'UTC')) AS u,
              SUM("visits") FILTER (WHERE "lastAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')) AS v,
              MIN("firstAt") AS since
         FROM "SiteVisitor"`, fromIso, toIso);
    return { unique: num(r[0]?.u), visits: num(r[0]?.v), since: r[0]?.since ? new Date(r[0].since).toISOString() : null };
  }

  /** Time in the app, from the heartbeat table another piece of work adds (UsageDay). */
  private async sessionLength(fromIso: string, toIso: string, prevFromIso: string | null, prevToIso: string | null): Promise<Metric> {
    if (!(await this.tableExists('UsageDay'))) {
      return notMeasured('Time in the app is not measured yet — the heartbeat that records it has not shipped.');
    }
    const read = async (a: string, z: string) => {
      const r = await this.rows<{ s: number | null }>(
        `SELECT AVG("seconds")::float AS s FROM "UsageDay"
          WHERE "seconds" > 0
            AND "day" >= to_char(($1)::timestamptz AT TIME ZONE '${TZ}', 'YYYY-MM-DD')
            AND "day" < to_char(($2)::timestamptz AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`, a, z);
      return r[0]?.s === null || r[0]?.s === undefined ? null : Math.round(r[0].s);
    };
    const now = await read(fromIso, toIso);
    const prev = prevFromIso && prevToIso ? await read(prevFromIso, prevToIso) : null;
    return now === null
      ? { ...notMeasured('No time recorded in this window yet.'), status: 'not-enough-data' }
      : metric(now, prev, { note: 'Average seconds in the app per member per active day.' });
  }

  /** Members per day across the window, and the milestones that really happened. */
  private async growthSeries(b: Bounds, now: Date) {
    const first = await this.rows<{ at: Date | null }>(`SELECT MIN("createdAt") AS at FROM "User"`);
    const firstDay = first[0]?.at ? cityDay(new Date(first[0].at)) : null;
    if (!firstDay) return { points: [], milestones: [] };
    const from = b.from && b.from > firstDay ? b.from : firstDay;
    const days = Math.min(daysBetween(from, b.to), 3650);
    const r = await this.rows<{ day: string; joined: bigint; left: bigint }>(
      `SELECT d AS day,
              (SELECT COUNT(*) FROM "User" u WHERE u."createdAt" < ((d || 'T00:00:00+05:30')::timestamptz + interval '1 day') AT TIME ZONE 'UTC') AS joined,
              (SELECT COUNT(*) FROM "User" u WHERE u."deletedAt" IS NOT NULL AND u."deletedAt" < ((d || 'T00:00:00+05:30')::timestamptz + interval '1 day') AT TIME ZONE 'UTC') AS left
         FROM (SELECT to_char(($1)::date + g, 'YYYY-MM-DD') AS d FROM generate_series(0, $2::int) g) days
        ORDER BY d`, from, days);
    const newPerDay = await this.rows<{ day: string; n: bigint }>(
      `SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, COUNT(*) AS n
         FROM "User" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') GROUP BY 1`, startOf(from));
    const joinedOn = new Map(newPerDay.map((x) => [x.day, num(x.n)]));
    const points = r.map((x) => ({ day: x.day, members: num(x.joined) - num(x.left), joined: joinedOn.get(x.day) ?? 0 }));
    const marks = [1, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000, 100000];
    const ms = await this.rows<{ n: number; at: Date }>(
      `SELECT n, at FROM (SELECT ROW_NUMBER() OVER (ORDER BY "createdAt") AS n, "createdAt" AS at FROM "User") x
        WHERE n = ANY($1::int[])`, marks);
    const milestones = ms.map((m) => ({
      day: cityDay(new Date(m.at)),
      label: num(m.n) === 1 ? 'First member' : `Member ${num(m.n).toLocaleString('en-IN')}`,
    }));
    void now;
    return { points, milestones };
  }

  /** Interactions per system in a window (records created). */
  private async interactions(fromIso: string, toIso: string): Promise<Record<string, number>> {
    const parts: string[] = [];
    for (const sys of SYSTEMS) {
      for (const src of sys.sources) {
        parts.push(`SELECT '${sys.key}' AS system, COUNT(*) AS n FROM "${src.table}"
          WHERE "${src.user}" IS NOT NULL
            AND "${src.at}" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "${src.at}" < (($2)::timestamptz AT TIME ZONE 'UTC')
            ${src.where ? `AND ${src.where}` : ''}`);
      }
    }
    const r = await this.rows<{ system: string; n: bigint }>(
      `SELECT system, SUM(n) AS n FROM (${parts.join(' UNION ALL ')}) x GROUP BY system`, fromIso, toIso);
    const out: Record<string, number> = {};
    for (const x of r) out[x.system] = num(x.n);
    return out;
  }

  /** How many of the eight systems each active member used in the window. */
  private async systemsDepth(fromIso: string, toIso: string) {
    const r = await this.rows<{ k: number; n: bigint }>(
      `SELECT k, COUNT(*) AS n FROM (
         SELECT uid, COUNT(DISTINCT system)::int AS k FROM (${activitySql('$1', '$2')}) a GROUP BY uid
       ) m GROUP BY k ORDER BY k`, fromIso, toIso);
    const distribution = Array.from({ length: SYSTEMS.length + 1 }, (_, k) => ({ systems: k, members: 0 }));
    for (const x of r) if (x.k >= 0 && x.k <= SYSTEMS.length) distribution[x.k].members = num(x.n);
    const users = distribution.reduce((n, d) => n + d.members, 0);
    const usedAny = distribution.filter((d) => d.systems > 0);
    const withAny = usedAny.reduce((n, d) => n + d.members, 0);
    const average = withAny ? Math.round((usedAny.reduce((n, d) => n + d.systems * d.members, 0) / withAny) * 10) / 10 : null;
    return { average, of: SYSTEMS.length, activeMembers: users, membersUsingASystem: withAny, distribution: usedAny };
  }

  // ───────────────────────────── FUNNEL ─────────────────────────────

  /**
   * THE JOURNEY, for members who JOINED in the window (all time: everyone).
   * Visitors are browsers first seen in the window. Each later stage is a
   * subset of "joined in the window", so every step is a real conversion.
   */
  private async funnel(b: Bounds, now: Date) {
    const w = this.windowOf(b);
    const today = cityDay(now);
    const read = async (fromIso: string, toIso: string) => {
      const [visitors, stages] = await Promise.all([
        this.visitorsIn(fromIso, toIso),
        this.rows<{ signups: bigint; members: bigint; activated: bigint; weekly: bigint; retained: bigint }>(
          `WITH joined AS (
             SELECT id, "createdAt", "deletedAt" FROM "User"
              WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "createdAt" < (($2)::timestamptz AT TIME ZONE 'UTC')
           ),
           act AS (SELECT * FROM (${activitySql('$1', '$3')}) a),
           early AS (
             SELECT j.id, COUNT(DISTINCT a.system) AS k FROM joined j
               JOIN act a ON a.uid = j.id AND a.system IS NOT NULL
                AND a.day <= to_char((j."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}' + ($4::int || ' days')::interval, 'YYYY-MM-DD')
              GROUP BY j.id
           ),
           recent AS (SELECT DISTINCT uid FROM act WHERE day >= $5)
           SELECT
             (SELECT COUNT(*) FROM joined) AS signups,
             (SELECT COUNT(*) FROM joined WHERE "deletedAt" IS NULL) AS members,
             (SELECT COUNT(*) FROM early e JOIN joined j ON j.id = e.id WHERE e.k >= $6 AND j."deletedAt" IS NULL) AS activated,
             (SELECT COUNT(*) FROM early e JOIN joined j ON j.id = e.id
               WHERE e.k >= $6 AND j."deletedAt" IS NULL AND j.id IN (SELECT uid FROM recent)) AS weekly,
             (SELECT COUNT(*) FROM early e JOIN joined j ON j.id = e.id
               WHERE e.k >= $6 AND j."deletedAt" IS NULL AND j.id IN (SELECT uid FROM recent)
                 AND j."createdAt" < (($7)::timestamptz AT TIME ZONE 'UTC')) AS retained`,
          fromIso, toIso, startOf(addDays(today, 1)), ACTIVATION.withinDays,
          addDays(today, -(RETAINED.activeWithinDays - 1)), ACTIVATION.minSystems,
          startOf(addDays(today, -RETAINED.joinedAtLeastDaysAgo)),
        ),
      ]);
      const s = stages[0];
      return {
        visitors: visitors.unique, signups: num(s?.signups), members: num(s?.members), activated: num(s?.activated),
        weekly: num(s?.weekly), retained: num(s?.retained),
      };
    };
    const cur = await read(w.fromIso, w.toIso);
    const prev = w.prevFromIso && w.prevToIso ? await read(w.prevFromIso, w.prevToIso) : null;
    /* EACH STAGE IS INSIDE THE ONE BEFORE IT (weekly and retained are
       activated members too), so every percentage is a real conversion and
       none can pass 100%. Paying is the last stage and has no members yet:
       nothing is sold for money until a payment partner is live. */
    const order = ['visitors', 'signups', 'members', 'activated', 'weekly', 'retained'] as const;
    return {
      activation: ACTIVATION,
      retained: RETAINED,
      stages: [
        ...order.map((key, i) => ({
          key,
          value: cur[key] as number | null,
          ofPrevious: i === 0 ? null : rate(cur[key], cur[order[i - 1]]),
          change: change(cur[key], prev ? prev[key] : null),
          note: null as string | null,
        })),
        { key: 'paying', value: null, ofPrevious: null, change: change(null, null),
          note: 'Not yet monetised — no payment partner is live.' },
      ],
    };
  }

  // ───────────────────────────── CITY ACTIVITY ─────────────────────────────

  async city(range: RangeKey, view: View, now = new Date()) {
    return this.cached(`city:${range}:${view}`, async () => {
      const b = boundsOf(range, now);
      const w = this.windowOf(b);
      const today = cityDay(now);
      const tomorrow = startOf(addDays(today, 1));
      const d = (n: number) => startOf(addDays(today, -n));
      const [inRange, users, last7, prev7, last30, prev30, depth, perMember, messages, ai] = await Promise.all([
        this.interactions(w.fromIso, w.toIso),
        this.active(w.fromIso, w.toIso),
        this.interactions(d(6), tomorrow),
        this.interactions(d(13), d(6)),
        this.interactions(d(29), tomorrow),
        this.interactions(d(59), d(29)),
        this.systemsDepth(w.fromIso, w.toIso),
        this.rows<{ members: bigint; days: bigint }>(
          `SELECT COUNT(DISTINCT uid) AS members, COUNT(DISTINCT (uid, day)) AS days FROM (${activitySql('$1', '$2')}) a`,
          w.fromIso, w.toIso),
        this.rows<{ n: bigint; senders: bigint }>(
          `SELECT COUNT(*) AS n, COUNT(DISTINCT "senderId") AS senders FROM "Message"
            WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "createdAt" < (($2)::timestamptz AT TIME ZONE 'UTC')`,
          w.fromIso, w.toIso),
        this.rows<{ n: bigint }>(
          `SELECT COUNT(*) AS n FROM "MiraTurn" WHERE "who" = 'you'
            AND "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "createdAt" < (($2)::timestamptz AT TIME ZONE 'UTC')`,
          w.fromIso, w.toIso),
      ]);
      const active = users.all;
      const systems = SYSTEMS.map((s) => {
        const u = users.bySystem[s.key] ?? 0;
        const n = inRange[s.key] ?? 0;
        return {
          key: s.key, label: s.label,
          users: u, interactions: n,
          perUser: u ? Math.round((n / u) * 10) / 10 : null,
          adoption: rate(u, active),
          trend7: change(last7[s.key] ?? 0, prev7[s.key] ?? 0),
          trend30: change(last30[s.key] ?? 0, prev30[s.key] ?? 0),
        };
      });
      const members = num(perMember[0]?.members);
      const totalInteractions = sum(inRange);
      return {
        range, from: b.from, to: b.to,
        activeMembers: active,
        systems,
        depth,
        engagement: {
          activeDaysPerMember: members ? Math.round((num(perMember[0]?.days) / members) * 10) / 10 : null,
          interactionsPerMember: members ? Math.round((totalInteractions / members) * 10) / 10 : null,
          aiPerMember: members ? Math.round((num(ai[0]?.n) / members) * 10) / 10 : null,
          messagesPerSender: num(messages[0]?.senders) ? Math.round((num(messages[0]?.n) / num(messages[0]?.senders)) * 10) / 10 : null,
          messages: num(messages[0]?.n),
          returning: await this.returning(w.fromIso, w.toIso),
        },
      };
    });
  }

  /** Active members in the window who were also active on an earlier day. */
  private async returning(fromIso: string, toIso: string): Promise<{ members: number; of: number }> {
    const r = await this.rows<{ ret: bigint; total: bigint }>(
      `WITH a AS (SELECT DISTINCT uid, day FROM (${activitySql('$3', '$2')}) x)
       SELECT COUNT(DISTINCT uid) FILTER (WHERE day >= to_char(($1)::timestamptz AT TIME ZONE '${TZ}', 'YYYY-MM-DD')
                AND uid IN (SELECT uid FROM a WHERE day < to_char(($1)::timestamptz AT TIME ZONE '${TZ}', 'YYYY-MM-DD'))) AS ret,
              COUNT(DISTINCT uid) FILTER (WHERE day >= to_char(($1)::timestamptz AT TIME ZONE '${TZ}', 'YYYY-MM-DD')) AS total
         FROM a`, fromIso, toIso, EPOCH);
    return { members: num(r[0]?.ret), of: num(r[0]?.total) };
  }

  // ───────────────────────────── RETENTION ─────────────────────────────

  async retention(now = new Date()) {
    return this.cached('retention', async () => {
      const today = cityDay(now);
      const r = await this.rows<{ uid: string; joined: string; day: string | null }>(
        `WITH m AS (
           SELECT id, to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS joined
             FROM "User" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')
         )
         SELECT m.id AS uid, m.joined, a.day
           FROM m LEFT JOIN (SELECT DISTINCT uid, day FROM (${activitySql('$1', '$2')}) x) a ON a.uid = m.id AND a.day > m.joined`,
        startOf(addDays(today, -7 * 12 - 40)), startOf(addDays(today, 1)));
      // Per member: joined day and the set of later active days.
      const byMember = new Map<string, { joined: string; days: Set<number> }>();
      for (const x of r) {
        const m = byMember.get(x.uid) ?? { joined: x.joined, days: new Set<number>() };
        if (x.day) m.days.add(daysBetween(x.joined, x.day));
        byMember.set(x.uid, m);
      }
      const weekOf = (day: string) => {
        const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
        return addDays(day, -dow);
      };
      const cohorts = new Map<string, Array<{ joined: string; days: Set<number> }>>();
      for (const m of byMember.values()) {
        const k = weekOf(m.joined);
        cohorts.set(k, [...(cohorts.get(k) ?? []), m]);
      }
      const age = (day: string) => daysBetween(day, today);
      const cell = (members: Array<{ joined: string; days: Set<number> }>, n: number) => {
        const width = RETENTION_WIDTH[n] ?? 1;
        const mature = members.filter((m) => age(m.joined) >= n + width);
        if (!mature.length) return { rate: null, members: 0, returned: 0 };
        const back = mature.filter((m) => [...m.days].some((d) => d >= n && d < n + width)).length;
        return { rate: rate(back, mature.length), members: mature.length, returned: back };
      };
      const rows = [...cohorts.entries()]
        .sort(([a], [z]) => z.localeCompare(a))
        .slice(0, 12)
        .map(([week, members]) => ({
          week, size: members.length,
          cells: RETENTION_DAYS.map((n) => ({ day: n, ...cell(members, n) })),
        }));
      const all = [...byMember.values()];
      const overall = RETENTION_DAYS.map((n) => ({ day: n, ...cell(all, n) }));
      return { definition: { days: RETENTION_DAYS, width: RETENTION_WIDTH, cohort: 'city week, Monday start' }, overall, cohorts: rows };
    });
  }

  // ───────────────────────────── REACH ─────────────────────────────

  async reach(range: RangeKey, view: View, now = new Date()) {
    return this.cached(`reach:${range}:${view}`, async () => {
      const b = boundsOf(range, now);
      const w = this.windowOf(b);
      const today = cityDay(now);
      const [visitorsBySource, membersBySource, places, ages, devices, apps, tracking] = await Promise.all([
        this.rows<{ source: string | null; n: bigint }>(
          `SELECT "source", COUNT(*) AS n FROM "SiteVisitor"
            WHERE "firstAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "firstAt" < (($2)::timestamptz AT TIME ZONE 'UTC')
            GROUP BY 1`, w.fromIso, w.toIso),
        this.rows<{ source: string | null; signups: bigint; activated: bigint; retained: bigint }>(
          `WITH j AS (
             SELECT u.id, u."createdAt", o."source" FROM "User" u LEFT JOIN "MemberOrigin" o ON o."userId" = u.id
              WHERE u."createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND u."createdAt" < (($2)::timestamptz AT TIME ZONE 'UTC')
           ),
           act AS (SELECT DISTINCT uid, day, system FROM (${activitySql('$1', '$3')}) a)
           SELECT j."source",
                  COUNT(*) AS signups,
                  COUNT(*) FILTER (WHERE (SELECT COUNT(DISTINCT a.system) FROM act a WHERE a.uid = j.id AND a.system IS NOT NULL
                     AND a.day <= to_char((j."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}' + ($4::int || ' days')::interval, 'YYYY-MM-DD')) >= $5) AS activated,
                  COUNT(*) FILTER (WHERE j."createdAt" < (($6)::timestamptz AT TIME ZONE 'UTC')
                     AND EXISTS (SELECT 1 FROM act a WHERE a.uid = j.id AND a.day >= $7)) AS retained
             FROM j GROUP BY 1`,
          w.fromIso, w.toIso, startOf(addDays(today, 1)), ACTIVATION.withinDays, ACTIVATION.minSystems,
          startOf(addDays(today, -RETAINED.joinedAtLeastDaysAgo)), addDays(today, -(RETAINED.activeWithinDays - 1))),
        this.rows<{ city: string | null; country: string | null }>(
          `SELECT COALESCE(NULLIF(mp."city", ''), NULLIF(u."city", '')) AS city, NULLIF(mp."country", '') AS country
             FROM "User" u LEFT JOIN "MasterProfile" mp ON mp."userId" = u.id WHERE u."deletedAt" IS NULL`),
        this.rows<{ dob: Date | null }>(
          `SELECT mp."dateOfBirth" AS dob FROM "User" u LEFT JOIN "MasterProfile" mp ON mp."userId" = u.id WHERE u."deletedAt" IS NULL`),
        this.rows<{ device: string | null; n: bigint }>(
          `SELECT "device", COUNT(*) AS n FROM "SiteVisitor"
            WHERE "firstAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "firstAt" < (($2)::timestamptz AT TIME ZONE 'UTC') GROUP BY 1`,
          w.fromIso, w.toIso),
        this.rows<{ platform: string; n: bigint }>(
          `SELECT "platform", COUNT(DISTINCT "userId") AS n FROM "DeviceToken" GROUP BY 1`),
        this.trackingSince(),
      ]);

      const sources = SOURCES.map((key) => {
        const v = visitorsBySource.find((x) => x.source === key);
        const m = membersBySource.find((x) => x.source === key);
        const signups = num(m?.signups);
        return {
          key, visitors: num(v?.n), signups, activated: num(m?.activated), retained: num(m?.retained),
          signupRate: rate(signups, num(v?.n)), activationRate: rate(num(m?.activated), signups),
        };
      });
      const untracked = membersBySource.find((x) => x.source === null);
      const unknownVisitors = visitorsBySource.find((x) => x.source === null);

      const inIndia = (c: string | null) => !c || /^(india|in|bharat)$/i.test(c.trim());
      const cityRows = new Map<string, number>();
      const countryRows = new Map<string, number>();
      let noPlace = 0;
      for (const p of places) {
        if (!inIndia(p.country)) {
          const k = (p.country ?? '').trim();
          countryRows.set(k, (countryRows.get(k) ?? 0) + 1);
          continue;
        }
        const c = cityOf(p.city);
        if (!c) { noPlace++; continue; }
        cityRows.set(c, (cityRows.get(c) ?? 0) + 1);
      }
      const ageRows = new Map<string, number>();
      let noAge = 0;
      for (const a of ages) {
        const band = ageBandOf(a.dob ? new Date(a.dob) : null, now);
        if (!band) { noAge++; continue; }
        ageRows.set(band, (ageRows.get(band) ?? 0) + 1);
      }
      const table = (m: Map<string, number>) => foldSmall([...m.entries()].map(([label, count]) => ({ label, count })));

      return {
        range, from: b.from, to: b.to,
        minGroup: MIN_GROUP,
        tracking,
        acquisition: {
          sources,
          untrackedSignups: num(untracked?.signups),
          untrackedVisitors: num(unknownVisitors?.n),
        },
        geography: {
          india: table(cityRows),
          abroad: table(countryRows),
          indiaTotal: [...cityRows.values()].reduce((n, x) => n + x, 0),
          abroadTotal: [...countryRows.values()].reduce((n, x) => n + x, 0),
          unknown: noPlace,
        },
        demographics: {
          ages: table(ageRows),
          agesUnknown: noAge,
          devices: foldSmall(devices.map((d) => ({ label: d.device ?? 'Not recorded', count: num(d.n) }))),
          apps: foldSmall(apps.map((a) => ({ label: APP_LABEL[a.platform.toLowerCase()] ?? a.platform, count: num(a.n) }))),
        },
      };
    });
  }

  // ───────────────────────────── AI ─────────────────────────────

  async ai(range: RangeKey, view: View, now = new Date()) {
    return this.cached(`ai:${range}:${view}`, async () => {
      const b = boundsOf(range, now);
      const w = this.windowOf(b);
      const [talk, active, calls] = await Promise.all([
        this.rows<{ messages: bigint; replies: bigint; members: bigint; conversations: bigint; continued: bigint; returning: bigint }>(
          `WITH t AS (
             SELECT "userId", "room", "who", to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day
               FROM "MiraTurn"
              WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "createdAt" < (($2)::timestamptz AT TIME ZONE 'UTC')
           ),
           c AS (SELECT "userId", "room", day, COUNT(*) FILTER (WHERE "who" = 'you') AS asked FROM t GROUP BY 1, 2, 3)
           SELECT (SELECT COUNT(*) FROM t WHERE "who" = 'you') AS messages,
                  (SELECT COUNT(*) FROM t WHERE "who" <> 'you') AS replies,
                  (SELECT COUNT(DISTINCT "userId") FROM t WHERE "who" = 'you') AS members,
                  (SELECT COUNT(*) FROM c WHERE asked > 0) AS conversations,
                  (SELECT COUNT(*) FROM c WHERE asked > 1) AS continued,
                  (SELECT COUNT(*) FROM (SELECT "userId" FROM c WHERE asked > 0 GROUP BY 1 HAVING COUNT(DISTINCT day) > 1) r) AS returning`,
          w.fromIso, w.toIso),
        this.active(w.fromIso, w.toIso),
        this.aiCalls(w.fromIso, w.toIso),
      ]);
      const t = talk[0];
      const messages = num(t?.messages);
      const members = num(t?.members);
      const conversations = num(t?.conversations);
      return {
        range, from: b.from, to: b.to,
        conversations, messages, replies: num(t?.replies), members,
        perMember: members ? Math.round((messages / members) * 10) / 10 : null,
        avgConversation: conversations ? Math.round((messages / conversations) * 10) / 10 : null,
        continuationRate: rate(num(t?.continued), conversations),
        returningMembers: num(t?.returning),
        adoption: rate(members, active.all),
        calls: view === 'founder' ? calls : { ...calls, byModel: [] },
        economics: {
          costPerActiveMember: null as number | null,
          costPerConversation: null as number | null,
          monthlyEstimate: null as number | null,
          note: calls.available
            ? 'Tokens are counted; a cost needs the rate for each model, which is not set on this server yet.'
            : 'AI calls are not metered yet — the ledger that records each call has not shipped.',
        },
        latency: { status: 'not-measured' as const, note: 'Response time of AI calls is not recorded yet.' },
        failures: { status: 'not-measured' as const, note: 'Failed AI calls are not recorded yet.' },
      };
    });
  }

  /** From the per-call ledger (AiCall), when that table exists. Provider-agnostic: models are names. */
  private async aiCalls(fromIso: string, toIso: string) {
    if (!(await this.tableExists('AiCall'))) {
      return { available: false, calls: null as number | null, tokensIn: null as number | null, tokensOut: null as number | null, byModel: [] as Array<{ model: string; calls: number; tokensIn: number; tokensOut: number }> };
    }
    const r = await this.rows<{ model: string; calls: bigint; tin: bigint; tout: bigint }>(
      `SELECT "model", COUNT(*) AS calls, SUM("tokensIn") AS tin, SUM("tokensOut") AS tout FROM "AiCall"
        WHERE "at" >= (($1)::timestamptz AT TIME ZONE 'UTC') AND "at" < (($2)::timestamptz AT TIME ZONE 'UTC') GROUP BY 1`,
      fromIso, toIso).catch(() => []);
    const byModel = r.map((x) => ({ model: x.model, calls: num(x.calls), tokensIn: num(x.tin), tokensOut: num(x.tout) }));
    return {
      available: true,
      calls: byModel.reduce((n, x) => n + x.calls, 0),
      tokensIn: byModel.reduce((n, x) => n + x.tokensIn, 0),
      tokensOut: byModel.reduce((n, x) => n + x.tokensOut, 0),
      byModel,
    };
  }

  // ───────────────────────────── MONEY ─────────────────────────────

  async money(view: View) {
    return this.cached(`money:${view}`, async () => {
      const live = !sandboxAllowed();
      const r = await this.rows<{ members: bigint; charges: bigint; inr: bigint | null }>(
        `SELECT COUNT(DISTINCT "userId") AS members, COUNT(*) AS charges, SUM("amountInr") AS inr
           FROM "WalletTxn" WHERE "kind" = 'payment' AND "category" = 'subscription'`);
      const subscribers = num(r[0]?.members);
      const reason = 'Not yet monetised — no payment partner is live, so no money has been taken.';
      return {
        monetised: false,
        paymentsLive: live,
        note: reason,
        mrr: notMeasured(reason),
        arr: notMeasured(reason),
        paying: { ...notMeasured(reason), value: null },
        conversion: notMeasured(reason),
        arpu: notMeasured(reason),
        cac: notMeasured('Acquisition spend is not recorded.'),
        ltv: notMeasured('Needs revenue and churn, neither of which exists yet.'),
        grossMargin: notMeasured('Needs revenue and AI cost, neither of which is measured yet.'),
        /** In-app subscriptions booked against wallet credit — a signal of intent, never revenue. */
        intent: view === 'founder'
          ? { subscribers, charges: num(r[0]?.charges), creditInr: num(r[0]?.inr) }
          : { subscribers, charges: num(r[0]?.charges), creditInr: null },
        plans: [{ key: 'assistant-30d', label: 'City Assistant, 30 days', priceInr: 999 }],
      };
    });
  }

  // ───────────────────────────── HEALTH ─────────────────────────────

  async health(view: View) {
    const started = Date.now();
    const db = await this.rows<{ ok: number }>('SELECT 1 AS ok').then(() => true).catch(() => false);
    const dbMs = Date.now() - started;
    const s = REQUEST_STATS.snapshot();
    const status: 'operational' | 'degraded' | 'incident' =
      !db ? 'incident'
        : s.successRate !== null && s.successRate < 95 ? 'incident'
          : (s.successRate !== null && s.successRate < 99) || (s.p95ms !== null && s.p95ms > 2000) || dbMs > 500 ? 'degraded'
            : 'operational';
    return {
      status,
      since: s.startedAt,
      uptimeSeconds: Math.round((Date.now() - Date.parse(s.startedAt)) / 1000),
      database: { ok: db, ms: dbMs },
      requests: s.requests,
      failedRequests: s.errors,
      successRate: s.successRate,
      p50ms: s.p50ms,
      p95ms: s.p95ms,
      timeline: view === 'founder' ? s.timeline : s.timeline.map((x) => ({ at: x.at, requests: x.requests, errors: x.errors > 0 ? 1 : 0 })),
      notMeasured: ['Crash-free sessions (the apps do not report crashes yet)', 'AI failures', 'Uptime across deploys (this server counts since it started)'],
    };
  }

  // ───────────────────────────── LIVE ─────────────────────────────

  /**
   * What happened in the city lately — what, and when. NEVER who: no name,
   * no handle, no number that follows one member from row to row.
   */
  async live(now = new Date()) {
    return this.cached('live', async () => {
      const since = new Date(now.getTime() - 3 * MS_DAY).toISOString();
      const sources: Array<{ sql: string; label: string }> = [
        { sql: `SELECT "createdAt" AS at FROM "User" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'A member joined Together City' },
        { sql: `SELECT MIN("createdAt") AS at FROM "MiraTurn" WHERE "who" = 'you' AND "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC') GROUP BY "userId", "room", date_trunc('hour', "createdAt")`, label: 'A City Assistant conversation started' },
        { sql: `SELECT "createdAt" AS at FROM "MealPlan" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'A nutrition plan was made' },
        { sql: `SELECT "doneAt" AS at FROM "WorkoutLog" WHERE "doneAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'A workout was logged' },
        { sql: `SELECT "createdAt" AS at FROM "MedicalRecord" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'A medical record was added' },
        { sql: `SELECT "createdAt" AS at FROM "LookAnalysis" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'A hair & skin analysis was run' },
        { sql: `SELECT "createdAt" AS at FROM "AstroReading" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'An astrology reading was made' },
        { sql: `SELECT "createdAt" AS at FROM "DatingProfile" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'A Find Love profile was started' },
        { sql: `SELECT "createdAt" AS at FROM "Pet" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'A pet profile was created' },
        { sql: `SELECT "createdAt" AS at FROM "Post" WHERE "createdAt" >= (($1)::timestamptz AT TIME ZONE 'UTC')`, label: 'A moment was shared on Together TV' },
      ];
      const lists = await Promise.all(sources.map(async (s) => {
        const r = await this.rows<{ at: Date }>(`${s.sql} ORDER BY 1 DESC LIMIT 20`, since).catch((e: Error) => {
          this.log.warn(`live feed source failed: ${e.message}`);
          return [];
        });
        return r.map((x) => ({ at: new Date(x.at).toISOString(), label: s.label }));
      }));
      return { items: lists.flat().sort((a, z) => z.at.localeCompare(a.at)).slice(0, 25) };
    });
  }
}

const sum = (m: Record<string, number>) => Object.values(m).reduce((n, x) => n + x, 0);
export type { SourceKey };
