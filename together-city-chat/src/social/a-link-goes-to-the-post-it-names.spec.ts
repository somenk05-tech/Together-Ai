/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SocialService } from './social.service';

/**
 * ── A LINK GOES TO THE POST IT NAMES (30 Aug audit) ─────────────────────────
 *
 * Every card shared into a chat carried `deepLink: '/social/feed'` under a
 * button reading "View Post →", and every notification about a post —
 * "somebody liked your post", "somebody commented" — carried the same href.
 * All of them opened the reader's own feed. That is not the post; it may not
 * contain the post; and for a friends-only post seen through a share, it
 * cannot contain the post.
 *
 * `social.post()` is the destination those links now have. A single-row read
 * is exactly where a permission gets forgotten, so this file states the four
 * that must hold — and each test is written so that it fails against a naive
 * `findUnique` that just returns the row.
 */

const ME = 'me-0000';
const THEM = 'them-1111';

type Over = {
  row?: any;
  blocked?: string[];
  visibleAudiences?: string[];
};

function svc(over: Over = {}) {
  const prisma = {
    post: { findUnique: async () => over.row ?? null },
  } as any;
  const storage = {
    signPostMedia: async (values: Array<string | null>) => new Map(
      values.filter(Boolean).map((v) => [v as string, `https://signed.example/${v as string}?sig=abc`]),
    ),
  } as any;
  const blocking = { blockedWith: async () => new Set<string>(over.blocked ?? []) } as any;
  const connections = { visibleAudiences: async () => over.visibleAudiences ?? [] } as any;
  return new SocialService(
    prisma, {} as never, {} as never, storage, connections, blocking, {} as never,
  );
}

const author = { id: THEM, handle: 'them', name: 'Them', profileImage: null };
const base = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  authorId: THEM,
  text: 'hello',
  audience: 'public',
  moderation: 'visible',
  feeling: null,
  placeName: null,
  taggedJson: null,
  lat: null,
  lng: null,
  musicUrl: null,
  musicTitle: null,
  category: null,
  createdAt: new Date(),
  author,
  media: [{ id: 'm1', url: 'social/them-1111/a.jpg', kind: 'image', thumbUrl: null }],
  _count: { likes: 2, comments: 1 },
  likes: [],
  repostOfId: null,
  repostOf: null,
  ...over,
});

describe('one post by id, through the same gates as the feed', () => {
  it('returns a public post, with its media signed rather than keyed', async () => {
    const out: any = await svc({ row: base() }).post(ME, 'p1');
    expect(out.id).toBe('p1');
    // The key never leaves. This is the whole point of the private bucket.
    expect(out.media[0].url).toMatch(/^https:\/\/signed\.example\//);
    expect(out.media[0].url).not.toBe('social/them-1111/a.jpg');
  });

  it('404s a post a moderator removed', async () => {
    await expect(svc({ row: base({ moderation: 'removed' }) }).post(ME, 'p1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('still shows the author their own removed post', async () => {
    // Silent disappearance is how somebody concludes the app ate their evening
    // and posts it again. The author sees it; nobody else does.
    const out: any = await svc({ row: base({ authorId: ME, moderation: 'removed' }) }).post(ME, 'p1');
    expect(out.id).toBe('p1');
  });

  it('404s a post that does not exist', async () => {
    await expect(svc({ row: null }).post(ME, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a friends-only post to somebody outside the circle', async () => {
    await expect(svc({ row: base({ audience: 'friends' }), visibleAudiences: [] }).post(ME, 'p1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a friends-only post to somebody inside it', async () => {
    const out: any = await svc({ row: base({ audience: 'friends' }), visibleAudiences: ['friends'] }).post(ME, 'p1');
    expect(out.id).toBe('p1');
  });

  it('refuses a post by somebody the reader has blocked', async () => {
    await expect(svc({ row: base(), blocked: [THEM] }).post(ME, 'p1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a private post to anybody but its author', async () => {
    await expect(svc({ row: base({ audience: 'private' }) }).post(ME, 'p1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * THE ONE A NAIVE IMPLEMENTATION GETS WRONG.
   *
   * A share is a row of its own with its own audience; the card renders the
   * ORIGINAL's text, media and author. So checking the share and stopping
   * there serves the original to anybody holding the share's id — which is
   * precisely the hole `repostWhere` exists to close on the feed.
   */
  it('refuses a share whose original is friends-only and the reader is not', async () => {
    const shared = base({
      id: 's1', authorId: 'someone-else', audience: 'public', text: null, media: [], repostOfId: 'p1',
      repostOf: base({ audience: 'friends' }),
    });
    await expect(svc({ row: shared, visibleAudiences: [] }).post(ME, 's1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a share whose original a moderator removed', async () => {
    const shared = base({
      id: 's1', authorId: 'someone-else', audience: 'public', text: null, media: [], repostOfId: 'p1',
      repostOf: base({ moderation: 'removed' }),
    });
    await expect(svc({ row: shared }).post(ME, 's1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unwraps a share, so the link shows the post rather than an empty stub', async () => {
    const shared = base({
      id: 's1', authorId: 'someone-else', audience: 'public', text: null, media: [], repostOfId: 'p1',
      author: { id: 'someone-else', handle: 'x', name: 'X', profileImage: null },
      repostOf: base(),
    });
    const out: any = await svc({ row: shared }).post(ME, 's1');
    expect(out.text).toBe('hello');
    expect(out.author.handle).toBe('them');
    expect(out.media[0].url).toMatch(/^https:\/\/signed\.example\//);
  });
});
