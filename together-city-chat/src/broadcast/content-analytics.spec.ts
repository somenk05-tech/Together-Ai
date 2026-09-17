import { readFileSync } from 'fs';
import { join } from 'path';
import type { Http } from './http';
import {
  bestAndWorst, change, dailyGrowth, daysBetween, engagements, grew, istDay, pct, readingAt, sum, windowOf,
  type Reading,
} from './content-analytics-math';
import { instagramAccountCounts, instagramMediaCounts, youtubeChannelCounts, youtubeVideoCounts } from './public-counts';
import { arrivalOf, CAMPAIGN, tagOf, trackedLink } from './tracking';
import { threadsText, youtubeMeta, type Words } from './compose';
import { topic } from './topics';
import { NOT_MEASURED } from './content-analytics.service';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * ── THE CONTENT ANALYTICS (owner, 17 Sep) ──────────────────────────────────
 *
 * "Do not simply add metrics together where doing so would create misleading
 * numbers." The failures this file exists to prevent all LOOK like numbers:
 * a period's views that are really lifetime views; a zero where the platform
 * said nothing; the same person counted once per platform; a click counted
 * against the wrong post.
 */

const at = (iso: string) => new Date(iso);
const r = (iso: string, views: number | null, likes: number | null = null): Reading =>
  ({ at: at(iso), views, likes, comments: null, shares: null, saves: null });

function script(answers: Array<{ status?: number; body?: unknown }>) {
  const calls: string[] = [];
  const http: Http = async (url) => {
    calls.push(url);
    const a = answers.shift();
    if (!a) throw new Error(`unexpected call to ${url}`);
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return { http, calls };
}

describe('a period is the growth inside it, not the running total', () => {
  const rs = [r('2026-09-01T00:00:00Z', 100, 5), r('2026-09-05T00:00:00Z', 400, 9), r('2026-09-10T00:00:00Z', 1000, 20)];
  const published = at('2026-08-31T12:00:00Z');

  it('subtracts the reading at the start from the reading at the end', () => {
    expect(grew(rs, 'views', published, at('2026-09-05T00:00:00Z'), at('2026-09-10T00:00:00Z'))).toBe(600);
    expect(grew(rs, 'likes', published, at('2026-09-05T00:00:00Z'), at('2026-09-10T00:00:00Z'))).toBe(11);
  });

  it('counts a post published inside the period from zero', () => {
    expect(grew(rs, 'views', published, at('2026-08-30T00:00:00Z'), at('2026-09-05T00:00:00Z'))).toBe(400);
    expect(grew(rs, 'views', published, null, at('2026-09-10T00:00:00Z'))).toBe(1000);
  });

  it('starts an older post from its first reading when none precedes the period — never invents', () => {
    const late = [r('2026-09-05T00:00:00Z', 400), r('2026-09-10T00:00:00Z', 1000)];
    expect(grew(late, 'views', published, at('2026-09-02T00:00:00Z'), at('2026-09-10T00:00:00Z'))).toBe(600);
  });

  it('is null when nothing had been read by the end, or the platform gives no such number', () => {
    expect(grew(rs, 'views', published, null, at('2026-08-31T23:00:00Z'))).toBeNull();
    expect(grew(rs, 'comments', published, null, at('2026-09-10T00:00:00Z'))).toBeNull();
  });

  it('never goes below zero when a platform revises a count down', () => {
    const down = [r('2026-09-01T00:00:00Z', 500), r('2026-09-02T00:00:00Z', 480)];
    expect(grew(down, 'views', published, at('2026-09-01T06:00:00Z'), at('2026-09-02T06:00:00Z'))).toBe(0);
  });

  it('reads the last reading at or before a moment', () => {
    expect(readingAt(rs, at('2026-09-07T00:00:00Z'))?.views).toBe(400);
    expect(readingAt(rs, at('2026-08-01T00:00:00Z'))).toBeNull();
  });

  it('splits growth into IST days', () => {
    const days = daysBetween(at('2026-09-04T20:00:00Z'), at('2026-09-06T00:00:00Z'));
    expect(days).toEqual(['2026-09-05', '2026-09-06']);
    const daily = dailyGrowth([r('2026-09-04T18:00:00Z', 10), r('2026-09-05T12:00:00Z', 30), r('2026-09-06T12:00:00Z', 35)], 'views', at('2026-09-01T00:00:00Z'), ['2026-09-06']);
    expect(daily).toEqual([5]);
  });
});

describe('null is not zero, and rates need both sides', () => {
  it('a sum over nothing measured is null, and says how much it covers', () => {
    expect(sum([null, null])).toEqual({ value: null, measured: 0, of: 2 });
    expect(sum([null, 0, 7])).toEqual({ value: 7, measured: 2, of: 3 });
  });

  it('engagements add only what was measured', () => {
    expect(engagements({ likes: 3, comments: null, shares: 2 })).toBe(5);
    expect(engagements({ likes: null, comments: null })).toBeNull();
  });

  it('a rate or a change without its base is null, not 0% or ∞', () => {
    expect(pct(5, 200)).toBe(2.5);
    expect(pct(5, 0)).toBeNull();
    expect(pct(null, 10)).toBeNull();
    expect(change(134, 100)).toBe(34);
    expect(change(10, 0)).toBeNull();
  });

  it('ranks by views where views exist, and has no worst with one entry', () => {
    const rows = [
      { id: 'a', views: 10, engagements: 90 }, { id: 'b', views: 300, engagements: 1 }, { id: 'c', views: null, engagements: 5 },
    ];
    const bw = bestAndWorst(rows);
    expect(bw.best?.id).toBe('b');
    expect(bw.worst?.id).toBe('a');
    expect(bw.best?.by).toBe('views');
    expect(bestAndWorst([{ id: 'x', views: null, engagements: 4 }])).toMatchObject({ best: { id: 'x', by: 'engagements' }, worst: null });
    expect(bestAndWorst([])).toEqual({ best: null, worst: null });
  });
});

describe('the date filters', () => {
  const now = at('2026-09-17T10:00:00Z');

  it('a range has a previous period of the same length just before it', () => {
    const w = windowOf('7d', now);
    expect(w.from?.toISOString()).toBe('2026-09-10T10:00:00.000Z');
    expect(w.prevFrom?.toISOString()).toBe('2026-09-03T10:00:00.000Z');
    expect(w.prevTo?.toISOString()).toBe(w.from?.toISOString());
  });

  it('today starts at midnight in India, and all time has nothing to compare to', () => {
    expect(windowOf('today', now).from?.toISOString()).toBe('2026-09-16T18:30:00.000Z');
    expect(windowOf('all', now)).toMatchObject({ from: null, prevFrom: null, prevTo: null });
    expect(istDay(at('2026-09-16T19:00:00Z'))).toBe('2026-09-17');
  });

  it('a custom range covers whole IST days and never runs past now; a bad one falls back to 30 days', () => {
    const w = windowOf('custom', now, { from: '2026-09-01', to: '2026-09-30' });
    expect(w.from?.toISOString()).toBe('2026-08-31T18:30:00.000Z');
    expect(w.to).toEqual(now);
    expect(windowOf('custom', now, { from: 'yesterday' }).from?.toISOString()).toBe(windowOf('30d', now).from?.toISOString());
    expect(windowOf('custom', now, { from: '2026-09-20', to: '2026-09-01' }).from?.toISOString()).toBe(windowOf('30d', now).from?.toISOString());
  });
});

describe('a link says which post and which platform sent somebody', () => {
  const id = '3fa9c21b-77aa-4d0e-9c1e-0123456789ab';
  const dating = topic('dating')!;

  it('carries the campaign tags the city already reads, to the topic’s own hub', () => {
    const link = new URL(trackedLink(dating, 'youtube', id));
    expect(link.origin + link.pathname).toBe('https://togethercity.app/matchmaking');
    expect(Object.fromEntries(link.searchParams)).toEqual({
      utm_source: 'youtube', utm_medium: 'social', utm_campaign: CAMPAIGN, utm_content: '3fa9c21b',
    });
    expect(tagOf(id)).toBe('3fa9c21b');
  });

  it('goes into the YouTube description and the Threads post, not the Instagram caption', () => {
    const w: Words = { title: 'T', description: 'D', tags: [], caption: 'C', threadsText: 'Th', privacy: 'public', aiDisclosure: false };
    expect(youtubeMeta(w, dating, trackedLink(dating, 'youtube', id)).snippet.description).toContain('utm_content=3fa9c21b');
    expect(threadsText(w, dating, trackedLink(dating, 'threads', id))).toContain('utm_source=threads');
    expect(read('src/broadcast/broadcast.service.ts')).toContain("instagramCaption(words, t)");
    expect(read('src/broadcast/broadcast.service.ts')).toContain("trackedLink(t, 'youtube', post.id)");
    expect(read('src/broadcast/broadcast.service.ts')).toContain("trackedLink(t, 'threads', post.id)");
  });

  it('counts an arrival only for a well-formed Together Social tag from a known platform', () => {
    expect(arrivalOf({ arrival: { cmp: CAMPAIGN, cnt: '3FA9C21B', src: 'threads' } })).toEqual({ tag: '3fa9c21b', channel: 'threads' });
    expect(arrivalOf({ arrival: { cmp: 'summer-sale', cnt: '3fa9c21b', src: 'threads' } })).toBeNull();
    expect(arrivalOf({ arrival: { cmp: CAMPAIGN, cnt: "3fa9c21b' OR 1=1", src: 'threads' } })).toBeNull();
    expect(arrivalOf({ arrival: { cmp: CAMPAIGN, cnt: '3fa9c21b', src: 'myspace' } })).toBeNull();
    expect(arrivalOf({})).toBeNull();
    expect(arrivalOf(undefined)).toBeNull();
  });

  it('the beacon records every tagged arrival, not only a browser’s first', () => {
    const ctl = read('src/analytics/visits.controller.ts');
    expect(ctl).toContain('arrivalOf(body)');
    expect(ctl).toMatch(/visits\.arrival\(key, arrived\.tag, arrived\.channel\)/);
    const web = read('../together-city-react/src/api/visits.api.ts');
    expect(web).toContain('arrival');
  });
});

describe('public counts, read the way the existing sign-ins allow', () => {
  it('YouTube: views, likes and comments, fifty ids a call', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `v${i}`);
    const s = script([
      { body: { items: [{ id: 'v0', statistics: { viewCount: '1200', likeCount: '40', commentCount: '3' } }] } },
      { body: { items: [{ id: 'v50', statistics: { viewCount: '7' } }] } },
    ]);
    const m = await youtubeVideoCounts(s.http, 'tok', ids);
    expect(s.calls).toHaveLength(2);
    expect(s.calls[0]).toContain('part=statistics');
    expect(m.get('v0')).toEqual({ views: 1200, likes: 40, comments: 3 });
    // A count the video hides is null, never 0.
    expect(m.get('v50')).toEqual({ views: 7, likes: null, comments: null });
  });

  it('YouTube: a hidden subscriber count is null', async () => {
    const s = script([{ body: { items: [{ statistics: { hiddenSubscriberCount: true, subscriberCount: '0', viewCount: '5', videoCount: '2' } }] } }]);
    expect(await youtubeChannelCounts(s.http, 'tok')).toEqual({ followers: null, views: 5, posts: 2 });
  });

  it('Instagram: likes and comments; views are insights and are not asked for', async () => {
    const s = script([{ body: { like_count: 12, comments_count: 4 } }, { body: { followers_count: 350, media_count: 9 } }]);
    expect(await instagramMediaCounts(s.http, 'tok', '1789')).toEqual({ views: null, likes: 12, comments: 4 });
    expect(s.calls[0]).toContain('fields=like_count%2Ccomments_count');
    expect(s.calls[0]).not.toMatch(/insights/);
    expect(await instagramAccountCounts(s.http, 'tok')).toEqual({ followers: 350, views: null, posts: 9 });
  });

  it('a refusal comes back in the platform’s own words', async () => {
    const s = script([{ status: 403, body: { error: { message: 'quotaExceeded' } } }]);
    await expect(youtubeChannelCounts(s.http, 'tok')).rejects.toThrow('YouTube 403: quotaExceeded');
  });

  it('no sign-in is asked for an insights permission (the owner chose public counts)', () => {
    const oauth = read('src/broadcast/oauth.ts');
    expect(oauth).not.toMatch(/insights|yt-analytics/);
  });
});

describe('what the page cannot count, it says', () => {
  it('names a reason for every unmeasured figure', () => {
    for (const v of Object.values(NOT_MEASURED)) expect(v.length).toBeGreaterThan(30);
    const svc = read('src/broadcast/content-analytics.service.ts');
    for (const k of ['reach', 'impressions', 'saves', 'profileVisits', 'avgWatchTime', 'completionRate', 'conversions', 'uniqueReach']) {
      expect(svc).toMatch(new RegExp(`${k}: fig\\(null, null`));
    }
  });

  it('Threads is never asked for counts it does not give', () => {
    const svc = read('src/broadcast/content-analytics.service.ts');
    expect(svc).not.toMatch(/graph\.threads\.net/);
    expect(svc).toContain("channel === 'youtube'");
    expect(svc).toContain("channel === 'instagram'");
  });

  it('the analytics routes sit behind the /dev locks and only Refresh reaches out', () => {
    const ctl = read('src/broadcast/broadcast.controller.ts');
    expect(ctl).toMatch(/@Controller\('dev\/media'\)\s*\n@UseGuards\(DevPasswordGuard\)/);
    expect(ctl).toContain("@Get('analytics')");
    expect(ctl).toContain("@Get('analytics/:id')");
    expect(ctl).toContain("@Post('analytics/refresh')");
  });

  it('the migration creates the three tables and the three columns, and nothing else', () => {
    const sql = read('prisma/migrations/20260917T150000_content_analytics/migration.sql');
    expect(sql.match(/CREATE TABLE "(\w+)"/g)).toEqual(['CREATE TABLE "MediaMetric"', 'CREATE TABLE "ChannelMetric"', 'CREATE TABLE "SocialArrival"']);
    expect(sql).not.toMatch(/DROP|ALTER COLUMN/);
    for (const c of ['series', 'episode', 'campaign']) expect(sql).toContain(`ALTER TABLE "MediaPost" ADD COLUMN "${c}" TEXT;`);
  });
});

/**
 * Owner, 17 Sep: "make sure all YouTube, insta and threads are for global
 * audience around the world including US clients". The drafted words and the
 * upload metadata are the part of that the code owns.
 */
describe('the words are written for the whole world', () => {
  const service = readFileSync(join(__dirname, 'broadcast.service.ts'), 'utf8');
  it('drafts in international English with American spelling, not English (India)', () => {
    expect(service).not.toContain('English (India)');
    expect(service).toMatch(/the whole world, the United States included/);
    expect(service).toMatch(/American spelling/);
  });
  it('tags every upload as plain English, with no region in the language code', () => {
    const w: Words = { title: 'T', description: 'D', tags: [], caption: 'C', threadsText: 'X', privacy: 'public', aiDisclosure: false };
    const fitness = topic('fitness') as NonNullable<ReturnType<typeof topic>>;
    const meta = youtubeMeta(w, fitness);
    expect(meta.snippet.defaultLanguage).toBe('en');
    expect(meta.snippet.defaultAudioLanguage).toBe('en');
    expect(fitness.disclaimer).toBe('Check with a doctor before starting a new exercise program.');
  });
});
