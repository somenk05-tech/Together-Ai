import { callJson, query, type Http } from './http';

/**
 * ── WHAT A PLATFORM SAYS ANYBODY CAN SEE (owner, 17 Sep) ────────────────────
 *
 * The owner chose public counts only: no insights permission, no reconnect.
 * These are the reads the existing sign-ins allow —
 *
 *   YouTube    youtube.readonly: a video's views, likes and comments
 *              (videos.list?part=statistics, fifty ids a call, 1 quota unit);
 *              the channel's subscribers, views and uploads.
 *   Instagram  instagram_business_basic: a media's likes and comments; the
 *              account's followers and media count. Views, reach and saves
 *              are insights and are not asked for.
 *   Threads    threads_basic gives no counts at all — likes, views and
 *              followers are all insights. Nothing is read.
 *
 * A number the platform hides (a channel that hides its subscriber count) is
 * null, never zero.
 */
export interface PublicCounts { views: number | null; likes: number | null; comments: number | null }
export interface AccountCounts { followers: number | null; views: number | null; posts: number | null }

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 2_147_483_647) : null;
};

const YT = 'https://www.googleapis.com/youtube/v3';
const IG = 'https://graph.instagram.com';

export async function youtubeVideoCounts(http: Http, access: string, ids: string[]): Promise<Map<string, PublicCounts>> {
  const out = new Map<string, PublicCounts>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const r = await callJson<{ items?: Array<{ id: string; statistics?: Record<string, unknown> }> }>(
      http, 'YouTube', query(`${YT}/videos`, { part: 'statistics', id: batch.join(','), maxResults: '50' }),
      { headers: { Authorization: `Bearer ${access}` } },
    );
    for (const it of r.items ?? []) {
      const s = it.statistics ?? {};
      out.set(it.id, { views: num(s.viewCount), likes: num(s.likeCount), comments: num(s.commentCount) });
    }
  }
  return out;
}

export async function youtubeChannelCounts(http: Http, access: string): Promise<AccountCounts> {
  const r = await callJson<{ items?: Array<{ statistics?: Record<string, unknown> }> }>(
    http, 'YouTube', query(`${YT}/channels`, { part: 'statistics', mine: 'true' }),
    { headers: { Authorization: `Bearer ${access}` } },
  );
  const s = r.items?.[0]?.statistics ?? {};
  return {
    followers: s.hiddenSubscriberCount === true ? null : num(s.subscriberCount),
    views: num(s.viewCount),
    posts: num(s.videoCount),
  };
}

export async function instagramMediaCounts(http: Http, access: string, mediaId: string): Promise<PublicCounts> {
  const r = await callJson<Record<string, unknown>>(
    http, 'Instagram', query(`${IG}/${mediaId}`, { fields: 'like_count,comments_count', access_token: access }),
  );
  return { views: null, likes: num(r.like_count), comments: num(r.comments_count) };
}

export async function instagramAccountCounts(http: Http, access: string): Promise<AccountCounts> {
  const r = await callJson<Record<string, unknown>>(
    http, 'Instagram', query(`${IG}/me`, { fields: 'followers_count,media_count', access_token: access }),
  );
  return { followers: num(r.followers_count), views: null, posts: num(r.media_count) };
}
