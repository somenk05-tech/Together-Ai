import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { spawn } from 'child_process';
import { PrismaService } from '../shared/prisma/prisma.service';
import { BlockingService } from '../connections/blocking.service';
import { ConnectionsService } from '../connections/connections.service';
import { RECORD_CAP } from '../shared/paging';
import { SocialGateway } from './social.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageProvider } from '../media/storage.provider';
import type { CreateCommentDto, CreatePostDto, FeedQueryDto } from './dto/social.dto';

const AUTHOR_SELECT = { id: true, handle: true, name: true, profileImage: true } as const;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: SocialGateway,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageProvider,
    private readonly connections: ConnectionsService,
    private readonly blocking: BlockingService,
  ) {}

  /** Set a video post's cover: extract the frame at `timeSec` with ffmpeg from
   *  the stored video, upload it, and pin it as the media's thumbUrl — so the
   *  poster is fixed once and grids never fetch the video to render a frame. */
  async setCover(userId: string, postId: string, timeSec: number) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, include: { media: true } });
    if (!post) throw new NotFoundException('post not found');
    if (post.authorId !== userId) throw new ForbiddenException('not your post');
    const video = (post.media ?? []).find((m) => m.kind === 'video');
    if (!video) throw new ForbiddenException('this post has no video');
    const jpeg = await this.extractFrame(video.url, Math.max(0, Number(timeSec) || 0));
    if (!jpeg) throw new InternalServerErrorException('could not extract that frame');
    const thumbUrl = await this.storage.putObject(userId, jpeg, 'image/jpeg', 'jpg');
    await this.prisma.postMedia.update({ where: { id: video.id }, data: { thumbUrl } });
    return { ok: true, thumbUrl };
  }

  /** Grab a single JPEG frame at `timeSec` from a video URL via ffmpeg (stdout).
   *  `-ss` before `-i` seeks first, so only the needed bytes are fetched. */
  private extractFrame(videoUrl: string, timeSec: number): Promise<Buffer | null> {
    return new Promise((resolve) => {
      try {
        const ff = spawn('ffmpeg', [
          '-ss', String(timeSec), '-i', videoUrl,
          '-frames:v', '1', '-q:v', '3', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
        ], { stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks: Buffer[] = [];
        ff.stdout.on('data', (d: Buffer) => chunks.push(d));
        ff.on('error', () => resolve(null));
        ff.on('close', (code) => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
      } catch { resolve(null); }
    });
  }

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

  /** All userIds in a block relationship with this user (either direction).
   *  Reads BOTH the Block table and connection-level blocks — this used to read
   *  only the first, so someone blocked on their connection record still had
   *  their posts in the feed. See connections/blocking.ts. */
  private async blockedWith(userId: string): Promise<Set<string>> {
    return this.blocking.blockedWith(userId);
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
        category: (dto as { category?: string }).category ?? null,
        musicUrl: (dto as { musicUrl?: string }).musicUrl ?? null,
        musicTitle: this.clean((dto as { musicTitle?: string }).musicTitle),
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

  /** Edit a post's caption/text and/or its Work/Personal category (author only).
   *  Media stays as-is. `category: null` clears the category. */
  async updatePost(userId: string, postId: string, dto: { text?: string; category?: 'work' | 'personal' | null }) {
    const existing = await this.prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!existing) throw new NotFoundException('post not found');
    if (existing.authorId !== userId) throw new ForbiddenException('not your post');
    const data: { text?: string | null; category?: string | null } = {};
    if (dto.text !== undefined) data.text = this.clean(dto.text);
    if (dto.category !== undefined) data.category = dto.category ?? null;
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: data as never,
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
    if (filter === 'friends') {
      // Friends = your ACCEPTED connections only (real friends), never the whole
      // city and never people you merely follow one-way. Your own posts are
      // excluded (you aren't your own connection).
      const conns = await this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
        select: { userOneId: true, userTwoId: true },
      });
      const blocked = await this.blockedWith(userId);
      network = conns
        .map((c) => (c.userOneId === userId ? c.userTwoId : c.userOneId))
        .filter((id) => !blocked.has(id));
    }
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
    // The Videos (reels) tab is CITY-WIDE: it surfaces every user's PUBLIC video,
    // not just your network — so the reels scroll runs through the whole city's
    // uploads. Friends/family-audience posts still only come from your circle,
    // and blocked users (either direction) are excluded.
    /**
     * p17: "the feed must show all content other users tagged Public."
     *
     * It did not. Every lens except Videos was bounded by
     * `authorId: { in: network }`, so a post somebody deliberately marked
     * Public was invisible to anyone who did not already follow them or share a
     * connection. A city feed that only shows you people you already know is an
     * address book.
     *
     * For You is now city-wide for PUBLIC posts, and still bounded for the rest:
     * friends-audience posts come from your connections and family-audience
     * posts from your family, exactly as before. Marking something Public is the
     * citizen saying they want it seen; this is the app finally doing that.
     *
     * Friends and Following stay bounded, because that is what they are for.
     */
    const cityWide = filter === 'videos' || filter === 'foryou' || filter === 'trending' || filter === 'nearby';
    const blockedSet = cityWide ? [...(await this.blockedWith(userId))] : [];
    const audienceWhere = cityWide
      ? {
          OR: [
            { authorId: userId },
            // Public means public. No network bound on this branch — that was
            // the bug.
            { audience: 'public' },
            { audience: 'friends', authorId: { in: network } },
            { audience: 'family', authorId: { in: familyIds } },
          ],
        }
      : {
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
        // City-wide videos aren't bounded to your network; every other lens is.
        ...(cityWide
          ? (blockedSet.length ? { authorId: { notIn: blockedSet } } : {})
          : { authorId: { in: network } }),
        ...(filter === 'nearby' ? { lat: { not: null } } : {}),
        ...(filter === 'trending' ? { createdAt: { gte: weekAgo } } : {}),
        // Photos / Videos sections: only posts carrying that media kind.
        ...(filter === 'photos' ? { media: { some: { kind: 'image' } } } : {}),
        ...(filter === 'videos' ? { media: { some: { kind: 'video' } } } : {}),
        // Thoughts: Twitter-style text-only posts — no media, real caption,
        // and not a repost.
        ...(filter === 'thoughts' ? { media: { none: {} }, text: { not: null }, repostOfId: null } : {}),
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
        repostOf: {
          include: {
            author: { select: AUTHOR_SELECT },
            media: true,
            _count: { select: { likes: true, comments: true } },
            likes: { where: { userId }, select: { id: true } },
          },
        },
      } as never,
    });
    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    return {
      items: page.map((p) => this.shapeFeedRow(p)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Shape a feed row, unwrapping reposts: a repost renders the ORIGINAL post's
   *  content (so like/comment target the original) with a `repostedBy` label and
   *  a `key` unique to this feed entry, dated at the share time. */
  private shapeFeedRow(row: unknown) {
    const r = row as {
      id: string; createdAt: Date; repostOfId?: string | null;
      author: { name: string; handle: string };
      _count: { likes: number; comments: number }; likes: unknown[];
      repostOf?: { _count: { likes: number; comments: number }; likes: unknown[] } | null;
    };
    if (r.repostOfId && r.repostOf) {
      const o = r.repostOf;
      const shaped = this.shapePost(o as never, o._count, (o.likes?.length ?? 0) > 0);
      return { ...shaped, key: r.id, createdAt: r.createdAt.toISOString(), repostedBy: { name: r.author.name, handle: r.author.handle } };
    }
    const shaped = this.shapePost(row as never, r._count, (r.likes?.length ?? 0) > 0);
    return { ...shaped, key: r.id, repostedBy: null };
  }

  /** Repost (share to feed) another citizen's post. Idempotent per user+post.
   *  Appears at the top of the reposter's network feed as "shared by …". */
  async repost(userId: string, postId: string) {
    const original = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, audience: true } });
    if (!original) throw new NotFoundException('post not found');
    await this.assertCanView(userId, original);
    const existing = await this.prisma.post.findFirst({ where: { authorId: userId, repostOfId: postId } as never, select: { id: true } });
    if (existing) return { reposted: true };
    const row = await this.prisma.post.create({
      data: { authorId: userId, repostOfId: postId, audience: 'public' } as never,
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, select: { id: true } },
        repostOf: {
          include: {
            author: { select: AUTHOR_SELECT },
            media: true,
            _count: { select: { likes: true, comments: true } },
            likes: { where: { userId }, select: { id: true } },
          },
        },
      } as never,
    });
    const shaped = this.shapeFeedRow(row);
    const recipients = await this.postRecipients(userId, 'public');
    this.gateway.postNew(shaped, recipients);
    if (original.authorId !== userId) {
      void this.actorName(userId).then((name) =>
        this.notifications.create({
          userId: original.authorId, actorId: userId, kind: 'repost',
          title: `${name} shared your post`, href: '/social/feed', entityId: postId,
        }));
    }
    return { reposted: true };
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
      take: RECORD_CAP,
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
    // Same rule the profile grid uses — see ConnectionsService.visibleAudiences.
    const allowed = await this.connections.visibleAudiences(userId, post.authorId);
    if (allowed.includes(aud)) return;
    if (aud === 'family') throw new ForbiddenException('This post is for family only.');
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
    const px = p as unknown as { audience?: string | null; placeName?: string | null; taggedJson?: string | null; musicUrl?: string | null; musicTitle?: string | null };
    let tagged: Array<{ id: string; name: string; handle: string }> = [];
    try { tagged = px.taggedJson ? JSON.parse(px.taggedJson) : []; } catch { tagged = []; }
    return {
      id: p.id,
      text: p.text,
      feeling: p.feeling,
      audience: px.audience ?? 'public',
      placeName: px.placeName ?? null,
      musicUrl: px.musicUrl ?? null,
      musicTitle: px.musicTitle ?? null,
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
