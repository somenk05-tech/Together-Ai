import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminAccessService } from '../admin/admin-access.service';
import { QueueService } from '../shared/queue/queue.service';
import { SocialAccountsService } from './accounts.service';
import { deskDb, type MediaPostWithTargets, type MediaTargetRow } from './desk.db';
import {
  bestAndWorst, change, dailyGrowth, daysBetween, engagements, grew, istDay, pct, sum, windowOf,
  type CountKey, type RangeKey, type Reading, type Sum, type Window,
} from './content-analytics-math';
import { instagramAccountCounts, instagramMediaCounts, youtubeChannelCounts, youtubeVideoCounts, type PublicCounts } from './public-counts';
import { CAMPAIGN, tagOf } from './tracking';
import { topic as topicOf, TOPICS } from './topics';

export const JOB_METRICS = 'social.metrics';
/** A refresh pressed twice in a row asks the platforms once. */
const REFRESH_GAP_MS = 5 * 60_000;
const MAX_CONTENT = 500;

/** Why a number is "—", in the owner's words where the owner decided it. */
export const NOT_MEASURED = {
  insights: 'Not collected — the platforms give this only with their insights permission, and public counts were chosen (17 Sep).',
  threads: 'Threads gives no public counts; likes, views and followers are all insights.',
  tvViews: 'Together TV does not count plays yet.',
  saves: 'No connected platform gives saves publicly.',
  conversions: 'Not yet monetised — no payment partner is live, so nothing can convert.',
  followersPerPost: 'Platforms say how many followers an account gained, not which post gained them.',
  uniqueReach: 'Platforms do not share who watched, so the same person on two platforms cannot be counted once. The de-duplicated number the city has is people who clicked through (by browser).',
} as const;

export interface AnalyticsQuery {
  range: RangeKey; from?: string; to?: string;
  platform?: string; topic?: string; series?: string; episode?: string; campaign?: string;
  /** The MediaPost kind (today every upload is a 'video'). */
  type?: string;
  /** 'period': only content published inside the range. */
  published?: 'all' | 'period';
}

export interface Figure { value: number | null; previous: number | null; change: number | null; basis: string; reason: string | null }

interface Counted { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }
interface Traffic { clicks: number; unique: number; registrations: number }
type TargetCounts = Counted & Traffic;

const PLATFORM_LABEL: Record<string, string> = { youtube: 'YouTube', instagram: 'Instagram', threads: 'Threads', tv: 'Together TV' };
const NO_COUNTS: Counted = { views: null, likes: null, comments: null, shares: null, saves: null };
const posted = (t: MediaTargetRow) => t.state === 'posted';

/**
 * ── THE CONTENT ANALYTICS (owner, 17 Sep) ──────────────────────────────────
 *
 * "Create a permanent Combined View that aggregates performance from every
 * video and post across every connected platform … every video/post gets its
 * own analytics page … click-through … a content audit … cross-platform
 * comparison … distinguish views from unique people … an executive summary."
 *
 * Founder-only, on /dev (the owner's choice): the /dev locks, and then the
 * console grant the investor dashboard's founder view needs, `analytics.read`.
 * Public counts only (the owner's choice too).
 *
 * THE READINGS. `collect` asks YouTube and Instagram what each published
 * post has now, reads Together TV's own counters, and stores one row per
 * post (MediaMetric) and one per account (ChannelMetric) — every three
 * hours, and when the owner presses Refresh. Threads is not asked: it gives
 * nothing without insights.
 *
 * THE CLICKS are the city's own: every arrival through a tagged link
 * (SocialArrival), and every member whose first visit was one (MemberOrigin).
 *
 * ONE CONTENT ID. A MediaPost is one creative; its targets are where it went.
 * Every total is the creative's, with its platforms beside it.
 */
@Injectable()
export class ContentAnalyticsService implements OnModuleInit {
  private readonly logger = new Logger('ContentAnalytics');
  private lastRun = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService,
    private readonly accounts: SocialAccountsService,
    private readonly jobs: QueueService,
  ) {}

  private get db() { return deskDb(this.prisma); }

  onModuleInit(): void {
    this.jobs.handle(JOB_METRICS, async () => { await this.collect(); });
    void this.jobs.schedule(JOB_METRICS, '41 */3 * * *');
  }

  /* ── READING THE PLATFORMS ─────────────────────────────────────────────── */

  /** The Refresh button: read now, unless a reading was taken minutes ago. */
  async refresh(actorId: string) {
    await this.access.assert(actorId, 'analytics.read');
    if (Date.now() - this.lastRun < REFRESH_GAP_MS) {
      return { read: 0, failed: [], skipped: 'Read less than five minutes ago — the platforms were not asked again.' };
    }
    return { ...(await this.collect()), skipped: null };
  }

  async collect(): Promise<{ read: number; failed: Array<{ channel: string; topic: string; error: string }> }> {
    this.lastRun = Date.now();
    const failed: Array<{ channel: string; topic: string; error: string }> = [];
    const note = (channel: string, topic: string, e: unknown) => {
      const error = String((e as Error)?.message ?? e).slice(0, 300);
      failed.push({ channel, topic, error });
      this.logger.warn(`${channel} ${topic}: ${error}`);
    };
    const posts = await this.db.mediaPost.findMany({
      where: { targets: { some: { state: 'posted' } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_CONTENT,
      include: { targets: { where: { state: 'posted' } } },
    });
    const rows: Array<{ targetId: string; postId: string; channel: string } & Counted> = [];
    const put = (t: MediaTargetRow, c: Counted) => rows.push({ targetId: t.id, postId: t.postId, channel: t.channel, ...c });

    for (const topic of TOPICS) {
      const mine = posts.filter((p) => p.topic === topic.key);
      const yt = mine.flatMap((p) => p.targets.filter((t) => t.channel === 'youtube' && t.externalId));
      if (yt.length) {
        try {
          const acct = await this.accounts.use('youtube', topic.key);
          const counts = await youtubeVideoCounts(this.accounts.http, acct.access, yt.map((t) => t.externalId as string));
          for (const t of yt) {
            const c = counts.get(t.externalId as string);
            if (c) put(t, { ...NO_COUNTS, ...c });
          }
        } catch (e) { note('youtube', topic.key, e); }
      }
      const ig = mine.flatMap((p) => p.targets.filter((t) => t.channel === 'instagram' && t.externalId));
      if (ig.length) {
        try {
          const acct = await this.accounts.use('instagram', topic.key);
          for (const t of ig) {
            const c: PublicCounts = await instagramMediaCounts(this.accounts.http, acct.access, t.externalId as string);
            put(t, { ...NO_COUNTS, ...c });
          }
        } catch (e) { note('instagram', topic.key, e); }
      }
    }

    const tv = posts.flatMap((p) => p.targets.filter((t) => t.channel === 'tv' && t.externalId));
    if (tv.length) {
      const ids = tv.map((t) => t.externalId as string);
      const own = await this.prisma.$queryRaw<Array<{ id: string; likes: number; comments: number; shares: bigint }>>`
        SELECT p."id", p."likeCount" AS "likes", p."commentCount" AS "comments",
               (SELECT COUNT(*) FROM "Post" r WHERE r."repostOfId" = p."id") AS "shares"
        FROM "Post" p WHERE p."id" = ANY(${ids}::text[])`;
      for (const t of tv) {
        const o = own.find((x) => x.id === t.externalId);
        if (o) put(t, { ...NO_COUNTS, likes: Math.max(0, o.likes), comments: Math.max(0, o.comments), shares: Number(o.shares) });
      }
    }
    if (rows.length) await this.db.mediaMetric.createMany({ data: rows });

    const accts = await this.accounts.list();
    const reads: Array<{ platform: string; topic: string; followers: number | null; views: number | null; posts: number | null }> = [];
    for (const a of accts) {
      if (!a.connected || (a.platform !== 'youtube' && a.platform !== 'instagram')) continue;
      try {
        const acct = await this.accounts.use(a.platform, a.topic);
        const c = a.platform === 'youtube'
          ? await youtubeChannelCounts(this.accounts.http, acct.access)
          : await instagramAccountCounts(this.accounts.http, acct.access);
        reads.push({ platform: a.platform, topic: a.topic, ...c });
      } catch (e) { note(a.platform, a.topic, e); }
    }
    if (reads.length) await this.db.channelMetric.createMany({ data: reads });
    return { read: rows.length + reads.length, failed };
  }

  /* ── THE COMBINED VIEW ─────────────────────────────────────────────────── */

  async overview(actorId: string, q: AnalyticsQuery) {
    await this.access.assert(actorId, 'analytics.read');
    const now = new Date();
    const w = windowOf(q.range, now, { from: q.from, to: q.to });
    const all = await this.content(q, w);
    const targets = all.flatMap((p) => p.targets);
    const [cur, prev, measuredAt, followers, choices] = await Promise.all([
      this.countsFor(all, w.from, w.to),
      w.prevFrom && w.prevTo ? this.countsFor(all, w.prevFrom, w.prevTo) : Promise.resolve(null),
      this.lastReading(),
      this.followers(w, q),
      this.choices(),
    ]);

    const rowOf = (p: MediaPostWithTargets, m: Map<string, TargetCounts>) => {
      const per = p.targets.map((t) => ({ t, c: m.get(t.id) ?? blank() }));
      const views = sum(per.map((x) => x.c.views)).value;
      const eng = sum(per.map((x) => engagements(x.c))).value;
      return {
        id: p.id, title: p.title ?? topicOf(p.topic)?.label ?? 'Untitled', topic: p.topic,
        series: p.series, episode: p.episode, campaign: p.campaign, kind: p.kind,
        createdAt: p.createdAt.toISOString(), tag: tagOf(p.id),
        views, likes: sum(per.map((x) => x.c.likes)).value, comments: sum(per.map((x) => x.c.comments)).value,
        shares: sum(per.map((x) => x.c.shares)).value, engagements: eng,
        engagementRate: pct(sum(per.filter((x) => x.c.views !== null).map((x) => engagements(x.c))).value, views),
        clicks: per.reduce((n, x) => n + x.c.clicks, 0),
        uniqueClicks: per.reduce((n, x) => n + x.c.unique, 0),
        registrations: per.reduce((n, x) => n + x.c.registrations, 0),
        ctr: pct(sum(per.filter((x) => x.c.views !== null).map((x) => x.c.clicks)).value, views),
        reach: null, watchTime: null, followers: null, conversions: null,
        platforms: per.map((x) => ({
          channel: x.t.channel, label: PLATFORM_LABEL[x.t.channel] ?? x.t.channel, url: x.t.externalUrl,
          views: x.c.views, likes: x.c.likes, comments: x.c.comments, shares: x.c.shares, clicks: x.c.clicks,
        })),
      };
    };
    const rows = all.map((p) => rowOf(p, cur));
    const prevRows = prev ? all.map((p) => rowOf(p, prev)) : null;

    const total = (key: 'views' | 'likes' | 'comments' | 'shares' | 'engagements', rs: typeof rows) => sum(rs.map((r) => r[key]));
    const clicks = (rs: typeof rows) => rs.reduce((n, r) => n + r.clicks, 0);
    const regs = (rs: typeof rows) => rs.reduce((n, r) => n + r.registrations, 0);
    const unique = await this.uniqueClickers(all, w.from, w.to);
    const uniquePrev = w.prevFrom && w.prevTo ? await this.uniqueClickers(all, w.prevFrom, w.prevTo) : null;

    const covered = (c: string[]) => c.length ? `Measured on ${c.join(', ')}` : 'Nothing measured yet';
    const onWhat = (key: CountKey) => covered([...new Set(targets.filter((t) => (cur.get(t.id)?.[key] ?? null) !== null).map((t) => PLATFORM_LABEL[t.channel]))]);
    const fig = (value: Sum | number | null, previous: Sum | number | null, basis: string, reason: string | null = null): Figure => {
      const v = value === null || typeof value === 'number' ? value : value.value;
      const p = previous === null || typeof previous === 'number' ? previous : previous.value;
      return { value: v, previous: prevRows ? p : null, change: prevRows ? change(v, p) : null, basis, reason: v === null ? reason ?? 'Nothing measured in this period yet.' : null };
    };
    const ytViews = (m: Map<string, TargetCounts> | null) =>
      m ? sum(targets.filter((t) => (m.get(t.id)?.views ?? null) !== null).map((t) => m.get(t.id)!.views)).value : null;
    const measuredClicks = (m: Map<string, TargetCounts> | null) =>
      m ? sum(targets.filter((t) => (m.get(t.id)?.views ?? null) !== null).map((t) => m.get(t.id)!.clicks)).value : null;
    const measuredEng = (m: Map<string, TargetCounts> | null) =>
      m ? sum(targets.filter((t) => (m.get(t.id)?.views ?? null) !== null).map((t) => engagements(m.get(t.id)!))).value : null;

    const summary = {
      views: fig(total('views', rows), prevRows && total('views', prevRows), `Total platform views · ${onWhat('views')}. Instagram and Threads views need insights.`),
      uniqueReach: fig(null, null, 'Estimated unique reach', NOT_MEASURED.uniqueReach),
      uniqueClickers: fig(unique, uniquePrev, 'Unique people who clicked through — distinct browsers, de-duplicated across platforms'),
      reach: fig(null, null, 'Total reach', NOT_MEASURED.insights),
      impressions: fig(null, null, 'Total impressions', NOT_MEASURED.insights),
      engagements: fig(total('engagements', rows), prevRows && total('engagements', prevRows), 'Likes + comments + shares, where measured'),
      likes: fig(total('likes', rows), prevRows && total('likes', prevRows), onWhat('likes')),
      comments: fig(total('comments', rows), prevRows && total('comments', prevRows), onWhat('comments')),
      shares: fig(total('shares', rows), prevRows && total('shares', prevRows), `${onWhat('shares')} (reposts)`, 'Only Together TV counts shares (reposts) publicly.'),
      saves: fig(null, null, 'Total saves', NOT_MEASURED.saves),
      clicks: fig(null, null, 'Clicks on the post itself', NOT_MEASURED.insights),
      linkClicks: fig(clicks(rows), prevRows && clicks(prevRows), 'Arrivals on togethercity.app through a post’s link'),
      profileVisits: fig(null, null, 'Profile visits', NOT_MEASURED.insights),
      followersGained: fig(followers.gained, followers.prevGained, followers.basis, 'No account has two readings in this period yet.'),
      avgWatchTime: fig(null, null, 'Average watch time', NOT_MEASURED.insights),
      engagementRate: fig(pct(measuredEng(cur), ytViews(cur)), prev ? pct(measuredEng(prev), ytViews(prev)) : null,
        'Engagements ÷ views, % — only where views are measured (YouTube)'),
      ctr: fig(pct(measuredClicks(cur), ytViews(cur)), prev ? pct(measuredClicks(prev), ytViews(prev)) : null,
        'Link clicks ÷ views, % — only where views are measured (YouTube)'),
      completionRate: fig(null, null, 'Completion rate', NOT_MEASURED.insights),
      registrations: fig(regs(rows), prevRows && regs(prevRows), 'Members whose first visit came through a post’s link'),
      conversions: fig(null, null, 'Conversions', NOT_MEASURED.conversions),
    };

    const { best, worst } = bestAndWorst(rows.filter((r) => r.platforms.length));
    const byPlatform = ['youtube', 'instagram', 'threads', 'tv']
      .filter((c) => !q.platform || q.platform === c)
      .map((c) => {
        const ts = targets.filter((t) => t.channel === c);
        const counts = ts.map((t) => cur.get(t.id) ?? blank());
        return {
          channel: c, label: PLATFORM_LABEL[c], posts: ts.length,
          views: sum(counts.map((x) => x.views)).value, likes: sum(counts.map((x) => x.likes)).value,
          comments: sum(counts.map((x) => x.comments)).value, shares: sum(counts.map((x) => x.shares)).value,
          clicks: counts.reduce((n, x) => n + x.clicks, 0), registrations: counts.reduce((n, x) => n + x.registrations, 0),
          followers: followers.byPlatform[c] ?? null,
          note: c === 'threads' ? NOT_MEASURED.threads : c === 'tv' ? NOT_MEASURED.tvViews : c === 'instagram' ? 'Views, reach and saves need insights.' : 'Watch time, impressions and CTR need YouTube Analytics.',
        };
      });

    const groups = (key: 'campaign' | 'series') => {
      const names = [...new Set(rows.map((r) => r[key]).filter((x): x is string => Boolean(x)))];
      return names.map((name) => {
        const rs = rows.filter((r) => r[key] === name);
        return {
          name, contents: rs.length, views: total('views', rs).value, engagements: total('engagements', rs).value,
          clicks: clicks(rs), registrations: regs(rs),
        };
      }).sort((a, b) => b.clicks - a.clicks || (b.views ?? 0) - (a.views ?? 0));
    };

    const posts = all.flatMap((p) => p.targets.map((t) => {
      const c = cur.get(t.id) ?? blank();
      return {
        contentId: p.id, title: p.title ?? 'Untitled', topic: p.topic, channel: t.channel, label: PLATFORM_LABEL[t.channel],
        url: t.externalUrl, postedAt: (t.finishedAt ?? p.createdAt).toISOString(),
        views: c.views, likes: c.likes, comments: c.comments, shares: c.shares, engagements: engagements(c),
        clicks: c.clicks, uniqueClicks: c.unique, registrations: c.registrations,
      };
    }));

    return {
      window: winJson(w, q.range), measuredAt, choices,
      summary, best, worst, content: rows, posts, platforms: byPlatform,
      campaigns: groups('campaign'), series: groups('series'),
      funnel: funnelOf({
        views: summary.views.value, clicks: clicks(rows), unique, registrations: regs(rows),
        byPlatform: byPlatform.map((b) => ({ channel: b.channel, label: b.label, views: b.views, clicks: b.clicks, registrations: b.registrations })),
      }),
    };
  }

  /* ── ONE CONTENT ID ────────────────────────────────────────────────────── */

  async detail(actorId: string, id: string, q: AnalyticsQuery) {
    await this.access.assert(actorId, 'analytics.read');
    const p = await this.db.mediaPost.findUnique({ where: { id }, include: { targets: true } });
    if (!p) throw new NotFoundException('No such content');
    const post = { ...p, targets: p.targets.filter((t) => posted(t) && (!q.platform || t.channel === q.platform)) };
    const now = new Date();
    const w = windowOf(q.range, now, { from: q.from, to: q.to });
    const start = w.from && w.from > p.createdAt ? w.from : p.createdAt;
    const days = daysBetween(start, w.to);
    const ids = post.targets.map((t) => t.id);
    // unbounded: one post's readings, at most eight a day for its platforms, and the chart needs every day
    const readings = ids.length ? await this.db.mediaMetric.findMany({ where: { targetId: { in: ids } }, orderBy: { capturedAt: 'asc' } }) : [];
    const byTarget = new Map<string, Reading[]>();
    for (const r of readings) {
      const list = byTarget.get(r.targetId) ?? [];
      list.push({ at: r.capturedAt, views: r.views, likes: r.likes, comments: r.comments, shares: r.shares, saves: r.saves });
      byTarget.set(r.targetId, list);
    }
    const tag = tagOf(p.id);
    const [traffic, perDay] = await Promise.all([this.traffic([tag], w.from, w.to), this.trafficByDay(tag, start, w.to)]);

    const platforms = post.targets.map((t) => {
      const rs = byTarget.get(t.id) ?? [];
      const at = t.finishedAt ?? p.createdAt;
      const c: Counted = {
        views: grew(rs, 'views', at, w.from, w.to), likes: grew(rs, 'likes', at, w.from, w.to),
        comments: grew(rs, 'comments', at, w.from, w.to), shares: grew(rs, 'shares', at, w.from, w.to), saves: null,
      };
      const tr = traffic.get(`${tag}|${t.channel}`) ?? { clicks: 0, unique: 0, registrations: 0 };
      const latest = rs[rs.length - 1] ?? null;
      return {
        channel: t.channel, label: PLATFORM_LABEL[t.channel], url: t.externalUrl, postedAt: at.toISOString(),
        ...c, engagements: engagements(c), clicks: tr.clicks, uniqueClicks: tr.unique, registrations: tr.registrations,
        ctr: pct(tr.clicks, c.views), readAt: latest ? latest.at.toISOString() : null, readings: rs.length,
      };
    });

    const timeline = days.map((d, i) => {
      const growth = (f: CountKey) => sum(post.targets.map((t) => dailyGrowth(byTarget.get(t.id) ?? [], f, t.finishedAt ?? p.createdAt, [d])[0])).value;
      const eng = sum((['likes', 'comments', 'shares'] as CountKey[]).map((f) => growth(f))).value;
      const day = perDay.get(d);
      return { day: d, index: i, views: growth('views'), engagements: eng, clicks: day?.clicks ?? 0, registrations: day?.registrations ?? 0 };
    });

    const views = sum(platforms.map((x) => x.views)).value;
    const clicks = platforms.reduce((n, x) => n + x.clicks, 0);
    const unique = await this.uniqueClickers([p], w.from, w.to);
    const registrations = platforms.reduce((n, x) => n + x.registrations, 0);
    const likes = sum(platforms.map((x) => x.likes)).value;
    const comments = sum(platforms.map((x) => x.comments)).value;
    const shares = sum(platforms.map((x) => x.shares)).value;
    return {
      window: winJson(w, q.range),
      content: {
        id: p.id, tag, title: p.title ?? 'Untitled', topic: p.topic, series: p.series, episode: p.episode, campaign: p.campaign,
        kind: p.kind, createdAt: p.createdAt.toISOString(), hub: topicOf(p.topic)?.hubPath ?? '/',
      },
      totals: {
        views, reach: null, impressions: null, likes, comments, shares, saves: null,
        engagements: sum([likes, comments, shares]).value, clicks, uniqueClicks: unique,
        ctr: pct(sum(platforms.filter((x) => x.views !== null).map((x) => x.clicks)).value, views),
        profileVisits: null, followers: null, watchTime: null, avgWatchDuration: null,
        completion: null, rewatch: null, dropOff: null, registrations, conversions: null,
      },
      notMeasured: NOT_MEASURED,
      platforms, timeline,
      funnel: funnelOf({
        views, clicks, unique, registrations,
        byPlatform: platforms.map((x) => ({ channel: x.channel, label: x.label, views: x.views, clicks: x.clicks, registrations: x.registrations })),
        byDay: timeline.map((t) => ({ day: t.day, views: t.views, clicks: t.clicks, registrations: t.registrations })),
      }),
    };
  }

  /* ── READS ─────────────────────────────────────────────────────────────── */

  private async content(q: AnalyticsQuery, w: Window): Promise<MediaPostWithTargets[]> {
    const created: Record<string, Date> = { lte: w.to };
    if (q.published === 'period' && w.from) created.gte = w.from;
    const posts = await this.db.mediaPost.findMany({
      where: {
        createdAt: created,
        ...(q.topic ? { topic: q.topic } : {}),
        ...(q.type ? { kind: q.type } : {}),
        ...(q.series ? { series: q.series } : {}),
        ...(q.episode ? { episode: q.episode } : {}),
        ...(q.campaign ? { campaign: q.campaign } : {}),
        targets: { some: { state: 'posted', ...(q.platform ? { channel: q.platform } : {}) } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_CONTENT,
      include: { targets: { where: { state: 'posted', ...(q.platform ? { channel: q.platform } : {}) }, orderBy: { channel: 'asc' } } },
    });
    return posts;
  }

  /** Each target's growth between `from` and `to`, with its clicks and members. */
  private async countsFor(posts: MediaPostWithTargets[], from: Date | null, to: Date): Promise<Map<string, TargetCounts>> {
    const targets = posts.flatMap((p) => p.targets);
    const out = new Map<string, TargetCounts>();
    if (!targets.length) return out;
    const ids = targets.map((t) => t.id);
    const at = async (t: Date | null, first = false) => {
      const rows = first
        ? await this.prisma.$queryRaw<ReadingRow[]>`
            SELECT DISTINCT ON ("targetId") "targetId", "capturedAt", "views", "likes", "comments", "shares", "saves"
            FROM "MediaMetric" WHERE "targetId" = ANY(${ids}::text[]) ORDER BY "targetId", "capturedAt" ASC`
        : await this.prisma.$queryRaw<ReadingRow[]>`
            SELECT DISTINCT ON ("targetId") "targetId", "capturedAt", "views", "likes", "comments", "shares", "saves"
            FROM "MediaMetric" WHERE "targetId" = ANY(${ids}::text[]) AND "capturedAt" <= ${t as Date}
            ORDER BY "targetId", "capturedAt" DESC`;
      return new Map(rows.map((r) => [r.targetId, r]));
    };
    const [first, atFrom, atTo] = await Promise.all([at(null, true), from ? at(from) : Promise.resolve(new Map<string, ReadingRow>()), at(to)]);
    const traffic = await this.traffic(posts.map((p) => tagOf(p.id)), from, to);
    const postOf = new Map(posts.flatMap((p) => p.targets.map((t) => [t.id, p] as const)));
    for (const t of targets) {
      const points = [first.get(t.id), atFrom.get(t.id), atTo.get(t.id)]
        .filter((r): r is ReadingRow => Boolean(r))
        .map(readingOf)
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      const p = postOf.get(t.id)!;
      const publishedAt = t.finishedAt ?? p.createdAt;
      const c: Counted = {
        views: grew(points, 'views', publishedAt, from, to),
        likes: grew(points, 'likes', publishedAt, from, to),
        comments: grew(points, 'comments', publishedAt, from, to),
        shares: grew(points, 'shares', publishedAt, from, to),
        saves: grew(points, 'saves', publishedAt, from, to),
      };
      const tr = traffic.get(`${tagOf(p.id)}|${t.channel}`) ?? { clicks: 0, unique: 0, registrations: 0 };
      out.set(t.id, { ...c, ...tr });
    }
    return out;
  }

  /** Arrivals and members per post tag and platform, inside a window. */
  private async traffic(tags: string[], from: Date | null, to: Date): Promise<Map<string, Traffic>> {
    const out = new Map<string, Traffic>();
    if (!tags.length) return out;
    const since = from ?? new Date(0);
    const [arrivals, members] = await Promise.all([
      this.prisma.$queryRaw<Array<{ tag: string; channel: string; clicks: bigint; unique: bigint }>>`
        SELECT "tag", "channel", COUNT(*) AS "clicks", COUNT(DISTINCT "visitor") AS "unique"
        FROM "SocialArrival" WHERE "tag" = ANY(${tags}::text[]) AND "at" >= ${since} AND "at" <= ${to}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<Array<{ tag: string; channel: string | null; n: bigint }>>`
        SELECT lower("content") AS "tag", "utmSource" AS "channel", COUNT(*) AS "n"
        FROM "MemberOrigin"
        WHERE "campaign" = ${CAMPAIGN} AND lower("content") = ANY(${tags}::text[])
          AND "createdAt" >= ${since} AND "createdAt" <= ${to}
        GROUP BY 1, 2`,
    ]);
    const cell = (k: string) => { const c = out.get(k) ?? { clicks: 0, unique: 0, registrations: 0 }; out.set(k, c); return c; };
    for (const a of arrivals) {
      const c = cell(`${a.tag}|${a.channel}`);
      c.clicks += Number(a.clicks); c.unique += Number(a.unique);
    }
    for (const m of members) cell(`${m.tag}|${m.channel ?? 'unknown'}`).registrations += Number(m.n);
    return out;
  }

  private async trafficByDay(tag: string, from: Date, to: Date): Promise<Map<string, { clicks: number; registrations: number }>> {
    const [arrivals, members] = await Promise.all([
      this.prisma.$queryRaw<Array<{ at: Date }>>`
        SELECT "at" FROM "SocialArrival" WHERE "tag" = ${tag} AND "at" >= ${from} AND "at" <= ${to}
        ORDER BY "at" LIMIT 200000`,
      this.prisma.$queryRaw<Array<{ at: Date }>>`
        SELECT "createdAt" AS "at" FROM "MemberOrigin"
        WHERE "campaign" = ${CAMPAIGN} AND lower("content") = ${tag} AND "createdAt" >= ${from} AND "createdAt" <= ${to}
        LIMIT 200000`,
    ]);
    const out = new Map<string, { clicks: number; registrations: number }>();
    const cell = (d: string) => { const c = out.get(d) ?? { clicks: 0, registrations: 0 }; out.set(d, c); return c; };
    for (const a of arrivals) cell(istDay(new Date(a.at))).clicks += 1;
    for (const m of members) cell(istDay(new Date(m.at))).registrations += 1;
    return out;
  }

  /** Distinct browsers that arrived through any of these posts' links — counted once however many links they used. */
  private async uniqueClickers(posts: Array<{ id: string }>, from: Date | null, to: Date): Promise<number> {
    const tags = posts.map((p) => tagOf(p.id));
    if (!tags.length) return 0;
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(DISTINCT "visitor") AS "n" FROM "SocialArrival"
      WHERE "tag" = ANY(${tags}::text[]) AND "at" >= ${from ?? new Date(0)} AND "at" <= ${to}`;
    return Number(rows[0]?.n ?? 0);
  }

  /** Followers gained per account, from its readings nearest each end of the window. */
  private async followers(w: Window, q: AnalyticsQuery) {
    const rows = await this.db.channelMetric.findMany({
      where: {
        ...(q.topic ? { topic: q.topic } : {}),
        ...(q.platform ? { platform: q.platform } : {}),
        ...(w.prevFrom ? { capturedAt: { gte: new Date(w.prevFrom.getTime() - 86_400_000), lte: w.to } } : { capturedAt: { lte: w.to } }),
      },
      orderBy: { capturedAt: 'asc' },
      take: 20_000,
    });
    const keys = [...new Set(rows.map((r) => `${r.platform}|${r.topic}`))];
    const gain = (from: Date | null, to: Date, only?: string) => {
      const parts = keys.filter((k) => !only || k.startsWith(`${only}|`)).map((k) => {
        const mine = rows.filter((r) => `${r.platform}|${r.topic}` === k && r.followers !== null);
        const end = [...mine].reverse().find((r) => r.capturedAt <= to);
        const start = from ? [...mine].reverse().find((r) => r.capturedAt <= from) ?? mine[0] : mine[0];
        return end && start && end !== start ? Math.max(0, (end.followers as number) - (start.followers as number)) : null;
      });
      return sum(parts).value;
    };
    const latest = (platform: string) => sum(keys.filter((k) => k.startsWith(`${platform}|`)).map((k) => {
      const mine = rows.filter((r) => `${r.platform}|${r.topic}` === k && r.followers !== null);
      return mine.length ? (mine[mine.length - 1].followers as number) : null;
    })).value;
    return {
      gained: gain(w.from, w.to),
      prevGained: w.prevFrom && w.prevTo ? gain(w.prevFrom, w.prevTo) : null,
      byPlatform: {
        youtube: { total: latest('youtube'), gained: gain(w.from, w.to, 'youtube') },
        instagram: { total: latest('instagram'), gained: gain(w.from, w.to, 'instagram') },
      } as Record<string, { total: number | null; gained: number | null } | undefined>,
      basis: 'YouTube subscribers + Instagram followers gained, from the accounts’ own counts (Threads needs insights)',
    };
  }

  private async lastReading(): Promise<string | null> {
    const r = await this.prisma.$queryRaw<Array<{ at: Date | null }>>`SELECT MAX("capturedAt") AS "at" FROM "MediaMetric"`;
    return r[0]?.at ? new Date(r[0].at).toISOString() : null;
  }

  /** What the filters can be set to. */
  private async choices() {
    const rows = await this.prisma.$queryRaw<Array<{ series: string | null; episode: string | null; campaign: string | null }>>`
      SELECT DISTINCT "series", "episode", "campaign" FROM "MediaPost"
      WHERE "series" IS NOT NULL OR "episode" IS NOT NULL OR "campaign" IS NOT NULL LIMIT 1000`;
    const uniq = (k: 'series' | 'episode' | 'campaign') => [...new Set(rows.map((r) => r[k]).filter((x): x is string => Boolean(x)))].sort();
    const kinds = await this.prisma.$queryRaw<Array<{ kind: string }>>`SELECT DISTINCT "kind" FROM "MediaPost" LIMIT 20`;
    const accounts = await this.accounts.list();
    return {
      types: kinds.map((k) => k.kind).sort(),
      series: uniq('series'), episodes: uniq('episode'), campaigns: uniq('campaign'),
      topics: TOPICS.map((t) => ({ key: t.key, label: t.label })),
      channels: accounts.filter((a) => a.connected).map((a) => ({ platform: a.platform, topic: a.topic, handle: a.handle ?? a.expected })),
      platforms: Object.entries(PLATFORM_LABEL).map(([key, label]) => ({ key, label })),
    };
  }
}

interface ReadingRow { targetId: string; capturedAt: Date; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }
const readingOf = (r: ReadingRow): Reading => ({ at: new Date(r.capturedAt), views: r.views, likes: r.likes, comments: r.comments, shares: r.shares, saves: r.saves });
const blank = (): TargetCounts => ({ ...NO_COUNTS, clicks: 0, unique: 0, registrations: 0 });

function winJson(w: Window, range: RangeKey) {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return { range, from: iso(w.from), to: w.to.toISOString(), prevFrom: iso(w.prevFrom), prevTo: iso(w.prevTo) };
}

interface FunnelInput {
  views: number | null; clicks: number; unique: number; registrations: number;
  byPlatform: Array<{ channel: string; label: string; views: number | null; clicks: number; registrations: number }>;
  byDay?: Array<{ day: string; views: number | null; clicks: number; registrations: number }>;
}

/**
 * Impressions → Views → Profile visits → Link clicks → Landing page →
 * Registration → Conversion. A stage the city cannot count is in the funnel
 * with its reason, so the chain reads whole and says where it is blind.
 */
function funnelOf(f: FunnelInput) {
  const split = (k: 'views' | 'clicks' | 'registrations') => f.byPlatform.map((p) => ({ channel: p.channel, label: p.label, value: p[k] }));
  const days = (k: 'views' | 'clicks' | 'registrations') => (f.byDay ?? []).map((d) => ({ day: d.day, value: d[k] }));
  return [
    { key: 'impressions', label: 'Impressions', value: null, rate: null, reason: NOT_MEASURED.insights, byPlatform: [], byDay: [] },
    { key: 'views', label: 'Views', value: f.views, rate: null, reason: f.views === null ? 'No platform has reported views yet.' : 'YouTube only — Instagram and Threads views need insights.', byPlatform: split('views'), byDay: days('views') },
    { key: 'profileVisits', label: 'Profile visits', value: null, rate: null, reason: NOT_MEASURED.insights, byPlatform: [], byDay: [] },
    { key: 'linkClicks', label: 'Link clicks', value: f.clicks, rate: pct(f.clicks, f.views), reason: null, byPlatform: split('clicks'), byDay: days('clicks') },
    { key: 'landing', label: 'Landing page — unique people', value: f.unique, rate: pct(f.unique, f.clicks), reason: null, byPlatform: [], byDay: [] },
    { key: 'registrations', label: 'Registrations', value: f.registrations, rate: pct(f.registrations, f.unique), reason: null, byPlatform: split('registrations'), byDay: days('registrations') },
    { key: 'conversions', label: 'Conversions', value: null, rate: null, reason: NOT_MEASURED.conversions, byPlatform: [], byDay: [] },
  ];
}
