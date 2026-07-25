import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SocialGateway } from './social.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateCommentDto, CreatePostDto, FeedQueryDto } from './dto/social.dto';

const AUTHOR_SELECT = { id: true, handle: true, name: true, profileImage: true } as const;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: SocialGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The people whose posts you see = yourself + everyone you follow + everyone
   * you're connected to (accepted connections auto-follow, so this is mostly the
   * follow graph; connections are unioned in as a safety net). Keeps the feed to
   * your circle — strangers' posts don't appear.
   */
  private async networkIds(userId: string): Promise<string[]> {
    const [follows, conns, blocked] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
        select: { userOneId: true, userTwoId: true },
      }),
      this.blockedWith(userId),
    ]);
    const ids = new Set<string>([userId]);
    for (const f of follows) ids.add(f.followeeId);
    for (const c of conns) ids.add(c.userOneId === userId ? c.userTwoId : c.userOneId);
    // Never surface anyone you've blocked, or who has blocked you.
    for (const b of blocked) ids.delete(b);
    ids.add(userId); // your own posts always stay visible to you
    return [...ids];
  }

  /** All userIds in a block relationship with this user (either direction). */
  private async blockedWith(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.block
      .findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } })
      .catch(() => [] as { blockerId: string; blockedId: string }[]);
    const set = new Set<string>();
    for (const r of rows) set.add(r.blockerId === userId ? r.blockedId : r.blockerId);
    return set;
  }

  /** Strip HTML tags from free text (defense-in-depth against stored XSS). */
  private clean(s: string | null | undefined): string | null {
    if (s == null) return null;
    const stripped = s.replace(/<[^>]*>/g, '').trim();
    return stripped.length ? stripped : null;
  }

  /** The set of userIds THIS user follows (their outbound follow edges). */
  private async myFollowingSet(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } });
    return new Set(rows.map((r) => r.followeeId));
  }

  /** Followers = people who follow you OR are connected to you. Each carries
   *  `iFollow` (do you follow them back?) so the UI shows Following / Follow back. */
  async followers(userId: string) {
    const [rows, conns, iFollow] = await Promise.all([
      this.prisma.follow.findMany({ where: { followeeId: userId }, select: { follower: { select: AUTHOR_SELECT } } }),
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
        include: { userOne: { select: AUTHOR_SELECT }, userTwo: { select: AUTHOR_SELECT } },
      }),
      this.myFollowingSet(userId),
    ]);
    const byId = new Map<string, { id: string; handle: string; name: string; profileImage: string | null }>();
    for (const r of rows) byId.set(r.follower.id, r.follower);
    for (const c of conns) {
      const u = c.userOneId === userId ? c.userTwo : c.userOne;
      byId.set(u.id, u);
    }
    return [...byId.values()].map((u) => ({ ...u, followsMe: true, iFollow: iFollow.has(u.id) }));
  }

  /** Following = people you follow OR are connected to (connections are mutual).
   *  Each carries `followsMe` so the UI can flag mutuals. */
  async following(userId: string) {
    const network = await this.networkIds(userId);
    const others = network.filter((id) => id !== userId);
    if (!others.length) return [];
    const [users, followerRows] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: others } }, select: AUTHOR_SELECT }),
      this.prisma.follow.findMany({ where: { followeeId: userId }, select: { followerId: true } }),
    ]);
    const followsMe = new Set(followerRows.map((r) => r.followerId));
    return users.map((u) => ({ ...u, iFollow: true, followsMe: followsMe.has(u.id) }));
  }

  /** Follow another citizen (idempotent). You can't follow yourself. */
  async follow(userId: string, targetRef: string) {
    const ref = (targetRef ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!ref) throw new NotFoundException('No citizen specified.');
    const target = await this.prisma.user.findFirst({ where: { OR: [{ id: targetRef }, { handle: ref }] }, select: { id: true } });
    if (!target) throw new NotFoundException('No citizen with that handle.');
    if (target.id === userId) throw new ForbiddenException("You can't follow yourself.");
    const before = await this.prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: target.id } } }).catch(() => null);
    await this.prisma.follow.createMany({ data: [{ followerId: userId, followeeId: target.id }], skipDuplicates: true });
    // Notify only on a genuinely new follow (not a repeat).
    if (!before) {
      void this.actorName(userId).then((name) =>
        this.notifications.create({
          userId: target.id, actorId: userId, kind: 'follow',
          title: `${name} started following you`, href: '/social/profile', entityId: userId,
        }));
    }
    return { following: true, userId: target.id };
  }

  /** Stop following someone (removes only your outbound follow edge). If you're
   *  connected, they remain in your circle via the connection — by design. */
  async unfollow(userId: string, targetId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId: userId, followeeId: targetId } });
    return { following: false, userId: targetId };
  }

  // ─────────────── posts ───────────────
  async createPost(userId: string, dto: CreatePostDto) {
    const audience = dto.audience ?? 'public';
    const tagged = dto.tagged?.length
      ? dto.tagged.map((t) => ({ id: t.id, name: this.clean(t.name) ?? '', handle: this.clean(t.handle) ?? '' }))
      : null;
    const post = await this.prisma.post.create({
      data: {
        authorId: userId,
        text: this.clean(dto.text),
        feeling: this.clean(dto.feeling),
        audience,
        placeName: this.clean(dto.placeName),
        taggedJson: tagged ? JSON.stringify(tagged) : null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        media: dto.media?.length
          ? { create: dto.media.map((m) => ({ url: m.url, kind: m.kind, thumbUrl: m.thumbUrl ?? null })) }
          : undefined,
      } as never,
      include: { author: { select: AUTHOR_SELECT }, media: true },
    });
    const shaped = this.shapePost(post, { likes: 0, comments: 0 }, false);
    const recipients = await this.postRecipients(userId, audience);
    this.gateway.postNew(shaped, recipients);
    // "Your post is now live" — self-notification (no actor, so not skipped).
    void this.notifications.create({
      userId, kind: 'post_live', title: 'Your post is now live',
      body: post.text ? post.text.slice(0, 80) : 'Shared to your city.', href: '/social/feed', entityId: post.id,
    });
    return shaped;
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('post not found');
    if (post.authorId !== userId) throw new ForbiddenException('not your post');
    const recipients = await this.postRecipients(post.authorId, (post as unknown as { audience?: string | null }).audience);
    await this.prisma.post.delete({ where: { id: postId } });
    this.gateway.postDeleted(postId, recipients);
    return { ok: true };
  }

  /** Edit a post's caption/text (author only). Media stays as-is. */
  async updatePost(userId: string, postId: string, text: string) {
    const existing = await this.prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!existing) throw new NotFoundException('post not found');
    if (existing.authorId !== userId) throw new ForbiddenException('not your post');
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { text: this.clean(text) },
      include: { author: { select: AUTHOR_SELECT }, media: true, _count: { select: { likes: true, comments: true } }, likes: { where: { userId }, select: { id: true } } },
    });
    const u = updated as unknown as { _count: { likes: number; comments: number }; likes: unknown[] };
    return this.shapePost(updated as never, u._count, u.likes.length > 0);
  }

  /** Cursor-paginated feed, newest first. Cursor = last post id of the previous page. */
  async feed(userId: string, query: FeedQueryDto) {
    const { cursor, limit } = query;
    const filter = (query as { filter?: string }).filter ?? 'foryou';
    let network = await this.networkIds(userId);
    // Five feed lenses (spec): For You (whole network) · Friends (connections
    // only, not yourself) · Nearby (geo-pinned posts) · Trending (most-liked
    // this week) · Following (people you follow).
    if (filter === 'friends') network = network.filter((id) => id !== userId);
    if (filter === 'following') {
      const follows = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } });
      network = follows.map((f) => f.followeeId);
    }
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    // Audience gate pushed INTO the query (Universal Connection Model) so that
    // pagination math operates on already-visible rows. Previously the gate ran
    // in memory after `take: limit+1`, which silently truncated pages and
    // stalled the cursor whenever a hidden post fell inside the window.
    // Visible = your own posts (any audience) OR public/friends OR a family post
    // from a family connection. Others' private posts never match.
    const familyIds = [...(await this.familyIds(userId))];
    const audienceWhere = {
      OR: [
        { authorId: userId },
        { audience: { in: ['public', 'friends'] } },
        { audience: 'family', authorId: { in: familyIds } },
      ],
    };
    // Ignore a stale/deleted cursor instead of 500-ing on it.
    let cursorClause: { cursor: { id: string }; skip: number } | object = {};
    if (cursor) {
      const exists = await this.prisma.post.findUnique({ where: { id: cursor }, select: { id: true } });
      if (exists) cursorClause = { cursor: { id: cursor }, skip: 1 };
    }
    const posts = await this.prisma.post.findMany({
      where: {
        authorId: { in: network },
        ...(filter === 'nearby' ? { lat: { not: null } } : {}),
        ...(filter === 'trending' ? { createdAt: { gte: weekAgo } } : {}),
        ...audienceWhere,
      },
      take: limit + 1,
      ...cursorClause,
      orderBy: (filter === 'trending'
        ? [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }]) as never,
      include: {
        author: { select: AUTHOR_SELECT },
        media: true,
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, select: { id: true } },
      },
    });
    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    return {
      items: page.map((p) => this.shapePost(p, p._count, p.likes.length > 0)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Accepted connections marked as FAMILY (for family-audience posts). */
  private async familyIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED' as never,
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
    }).catch(() => []);
    return new Set(
      rows
        .filter((r) => ((r as unknown as { relationship?: string | null }).relationship ?? '') === 'family')
        .map((r) => (r.userOneId === userId ? r.userTwoId : r.userOneId)),
    );
  }

  /** Posts that carry geo coordinates — powers the Social map (your network). */
  async map(userId: string) {
    const network = await this.networkIds(userId);
    const familyIds = [...(await this.familyIds(userId))];
    const posts = await this.prisma.post.findMany({
      where: {
        lat: { not: null },
        lng: { not: null },
        authorId: { in: network },
        // Same audience gate as the feed — never leak private/family geo-posts.
        OR: [
          { authorId: userId },
          { audience: { in: ['public', 'friends'] } },
          { audience: 'family', authorId: { in: familyIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { author: { select: AUTHOR_SELECT }, media: true, _count: { select: { likes: true, comments: true } } },
    });
    return posts.map((p) => this.shapePost(p, p._count, false));
  }

  // ─────────────── comments ───────────────
  async comment(userId: string, postId: string, dto: CreateCommentDto) {
    const post = await this.assertPost(postId);
    await this.assertCanView(userId, post);
    const comment = await this.prisma.comment.create({
      data: { postId, authorId: userId, text: this.clean(dto.text) ?? '' },
      include: { author: { select: AUTHOR_SELECT } },
    });
    const shaped = {
      id: comment.id,
      postId,
      text: comment.text,
      author: comment.author,
      createdAt: comment.createdAt.toISOString(),
    };
    const recipients = await this.postRecipients(post.authorId, post.audience);
    this.gateway.commentNew(shaped, recipients);
    // Notify the post author that someone commented.
    void this.notifications.create({
      userId: post.authorId, actorId: userId, kind: 'comment',
      title: `${comment.author.name} commented on your post`,
      body: comment.text.slice(0, 80), href: '/social/feed', entityId: postId,
    });
    return shaped;
  }

  async comments(userId: string, postId: string) {
    const post = await this.assertPost(postId);
    await this.assertCanView(userId, post);
    const rows = await this.prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return rows.map((c) => ({
      id: c.id,
      postId,
      text: c.text,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  // ─────────────── likes ───────────────
  /** Idempotent toggle — returns the new state + count. */
  async toggleLike(userId: string, postId: string) {
    const post = await this.assertPost(postId);
    await this.assertCanView(userId, post);
    const existing = await this.prisma.like.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      await this.prisma.like.delete({ where: { id: existing.id } });
    } else {
      // createMany({skipDuplicates}) is idempotent under a concurrent double-tap
      // (the unique [postId,userId] index would otherwise 500 on the 2nd write).
      await this.prisma.like.createMany({ data: [{ postId, userId }], skipDuplicates: true });
    }
    const likes = await this.prisma.like.count({ where: { postId } });
    const result = { postId, liked: !existing, likes };
    const recipients = await this.postRecipients(post.authorId, post.audience);
    this.gateway.likeChanged(result, recipients);
    // Notify the author when a NEW like lands (not on unlike).
    if (!existing) {
      void this.actorName(userId).then((name) =>
        this.notifications.create({
          userId: post.authorId, actorId: userId, kind: 'like',
          title: `${name} liked your post`, href: '/social/feed', entityId: postId,
        }));
    }
    return result;
  }

  // ─────────────── blocking & reporting (safety) ───────────────
  /** Block a citizen — hides both users from each other and drops any follow edges. */
  async block(userId: string, targetRef: string) {
    const ref = (targetRef ?? '').trim().replace(/^@/, '').toLowerCase();
    const target = await this.prisma.user.findFirst({
      where: { OR: [{ id: targetRef }, { handle: ref }] },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('No citizen with that handle.');
    if (target.id === userId) throw new ForbiddenException("You can't block yourself.");
    await this.prisma.block.createMany({
      data: [{ blockerId: userId, blockedId: target.id }],
      skipDuplicates: true,
    });
    // Sever any follow edges in both directions so neither appears in the other's circle.
    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: userId, followeeId: target.id },
          { followerId: target.id, followeeId: userId },
        ],
      },
    });
    return { blocked: true, userId: target.id };
  }

  async unblock(userId: string, targetId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    return { blocked: false, userId: targetId };
  }

  async listBlocks(userId: string) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: AUTHOR_SELECT } },
    });
    return rows.map((r) => r.blocked);
  }

  /** File a report against a user, post or comment (feeds a moderation queue). */
  async report(userId: string, dto: { targetType: string; targetId: string; reason?: string }) {
    const type = dto.targetType;
    if (!['user', 'post', 'comment'].includes(type)) throw new ForbiddenException('invalid report target');
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: type,
        targetId: dto.targetId,
        reason: this.clean(dto.reason) ?? null,
      },
    });
    return { reported: true };
  }

  /** Users allowed to receive live updates for a post, given its audience.
   *  Always includes the author; excludes anyone in a block relationship. */
  private async postRecipients(authorId: string, audience: string | null | undefined): Promise<string[]> {
    const aud = audience ?? 'public';
    const ids = new Set<string>([authorId]);
    if (aud === 'private') return [...ids];
    const [conns, blocked] = await Promise.all([
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED' as never, OR: [{ userOneId: authorId }, { userTwoId: authorId }] },
      }),
      this.blockedWith(authorId),
    ]);
    const other = (r: { userOneId: string; userTwoId: string }) => (r.userOneId === authorId ? r.userTwoId : r.userOneId);
    if (aud === 'family') {
      for (const r of conns) if (((r as unknown as { relationship?: string | null }).relationship ?? '') === 'family') ids.add(other(r));
    } else {
      // friends & public: all accepted connections
      for (const r of conns) ids.add(other(r));
      if (aud === 'public') {
        const followers = await this.prisma.follow.findMany({ where: { followeeId: authorId }, select: { followerId: true } });
        for (const f of followers) ids.add(f.followerId);
      }
    }
    for (const b of blocked) ids.delete(b);
    ids.add(authorId);
    return [...ids];
  }

  /** Throw unless `userId` may view/interact with this post. Mirrors the feed's
   *  visibility rule exactly, so anything you can SEE you can also like/comment:
   *   • public  → any citizen
   *   • friends → anyone in the author's circle (you follow them OR are connected)
   *   • family  → a family-relationship connection
   *   • private → the author alone
   *  Blocks (either direction) always deny. */
  private async assertCanView(userId: string, post: { authorId: string; audience?: string | null }) {
    if (post.authorId === userId) return;
    const blocked = await this.blockedWith(userId);
    if (blocked.has(post.authorId)) throw new ForbiddenException('You do not have access to this post.');
    const aud = post.audience ?? 'public';
    if (aud === 'public') return; // public posts are viewable by any citizen
    if (aud === 'private') throw new ForbiddenException('This post is private.');
    const [follows, conns] = await Promise.all([
      this.prisma.follow
        .findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: post.authorId } } })
        .catch(() => null),
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED' as never, OR: [{ userOneId: post.authorId }, { userTwoId: post.authorId }] },
      }),
    ]);
    const conn = conns.find((r) => (r.userOneId === post.authorId ? r.userTwoId : r.userOneId) === userId);
    if (aud === 'family') {
      if (conn && ((conn as unknown as { relationship?: string | null }).relationship ?? '') === 'family') return;
      throw new ForbiddenException('This post is for family only.');
    }
    // friends: a follow OR any accepted connection puts you in the circle
    if (follows || conn) return;
    throw new ForbiddenException('You do not have access to this post.');
  }

  // ─────────────── helpers ───────────────
  private async assertPost(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, audience: true } });
    if (!post) throw new NotFoundException('post not found');
    return post;
  }

  /** The display name of whoever triggered a notification. */
  private async actorName(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
    return u?.name ?? 'Someone';
  }

  private shapePost(
    p: {
      id: string;
      text: string | null;
      feeling: string | null;
      lat: number | null;
      lng: number | null;
      createdAt: Date;
      author: { id: string; handle: string; name: string; profileImage: string | null };
      media: { id: string; url: string; kind: string; thumbUrl: string | null }[];
    },
    counts: { likes: number; comments: number },
    likedByMe: boolean,
  ) {
    const px = p as unknown as { audience?: string | null; placeName?: string | null; taggedJson?: string | null };
    let tagged: Array<{ id: string; name: string; handle: string }> = [];
    try { tagged = px.taggedJson ? JSON.parse(px.taggedJson) : []; } catch { tagged = []; }
    return {
      id: p.id,
      text: p.text,
      feeling: p.feeling,
      audience: px.audience ?? 'public',
      placeName: px.placeName ?? null,
      tagged,
      lat: p.lat,
      lng: p.lng,
      author: p.author,
      media: p.media.map((m) => ({ id: m.id, url: m.url, kind: m.kind, thumbUrl: m.thumbUrl })),
      likes: counts.likes,
      comments: counts.comments,
      likedByMe,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
