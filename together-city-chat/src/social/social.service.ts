import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SocialGateway } from './social.gateway';
import type { CreateCommentDto, CreatePostDto, FeedQueryDto } from './dto/social.dto';

const AUTHOR_SELECT = { id: true, handle: true, name: true, profileImage: true } as const;

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: SocialGateway,
  ) {}

  /**
   * The people whose posts you see = yourself + everyone you follow + everyone
   * you're connected to (accepted connections auto-follow, so this is mostly the
   * follow graph; connections are unioned in as a safety net). Keeps the feed to
   * your circle — strangers' posts don't appear.
   */
  private async networkIds(userId: string): Promise<string[]> {
    const [follows, conns] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
        select: { userOneId: true, userTwoId: true },
      }),
    ]);
    const ids = new Set<string>([userId]);
    for (const f of follows) ids.add(f.followeeId);
    for (const c of conns) ids.add(c.userOneId === userId ? c.userTwoId : c.userOneId);
    return [...ids];
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
    await this.prisma.follow.createMany({ data: [{ followerId: userId, followeeId: target.id }], skipDuplicates: true });
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
    const post = await this.prisma.post.create({
      data: {
        authorId: userId,
        text: dto.text?.trim() ?? null,
        feeling: dto.feeling ?? null,
        audience: dto.audience ?? 'public',
        placeName: dto.placeName?.trim() || null,
        taggedJson: dto.tagged?.length ? JSON.stringify(dto.tagged) : null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        media: dto.media?.length
          ? { create: dto.media.map((m) => ({ url: m.url, kind: m.kind, thumbUrl: m.thumbUrl ?? null })) }
          : undefined,
      } as never,
      include: { author: { select: AUTHOR_SELECT }, media: true },
    });
    const shaped = this.shapePost(post, { likes: 0, comments: 0 }, false);
    this.gateway.postNew(shaped);
    return shaped;
  }

  async deletePost(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('post not found');
    if (post.authorId !== userId) throw new ForbiddenException('not your post');
    await this.prisma.post.delete({ where: { id: postId } });
    this.gateway.postDeleted(postId);
    return { ok: true };
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
    const posts = await this.prisma.post.findMany({
      where: {
        authorId: { in: network },
        ...(filter === 'nearby' ? { lat: { not: null } } : {}),
        ...(filter === 'trending' ? { createdAt: { gte: weekAgo } } : {}),
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
    // Audience gate (Universal Connection Model): public → network; friends →
    // any accepted connection; family → connections whose relationship is
    // family; private → the author alone. Feed is already network-scoped, so
    // only family/private need the extra check here.
    const familyIds = await this.familyIds(userId);
    const visible = posts.filter((p) => {
      const aud = (p as unknown as { audience?: string | null }).audience ?? 'public';
      if (p.authorId === userId) return true;
      if (aud === 'private') return false;
      if (aud === 'family') return familyIds.has(p.authorId);
      return true; // public | friends — network-scoped already
    });
    const hasMore = visible.length > limit;
    const page = hasMore ? visible.slice(0, limit) : visible;
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
    const posts = await this.prisma.post.findMany({
      where: { lat: { not: null }, lng: { not: null }, authorId: { in: network } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { author: { select: AUTHOR_SELECT }, media: true, _count: { select: { likes: true, comments: true } } },
    });
    return posts.map((p) => this.shapePost(p, p._count, false));
  }

  // ─────────────── comments ───────────────
  async comment(userId: string, postId: string, dto: CreateCommentDto) {
    await this.assertPost(postId);
    const comment = await this.prisma.comment.create({
      data: { postId, authorId: userId, text: dto.text.trim() },
      include: { author: { select: AUTHOR_SELECT } },
    });
    const shaped = {
      id: comment.id,
      postId,
      text: comment.text,
      author: comment.author,
      createdAt: comment.createdAt.toISOString(),
    };
    this.gateway.commentNew(shaped);
    return shaped;
  }

  async comments(postId: string) {
    await this.assertPost(postId);
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
    await this.assertPost(postId);
    const existing = await this.prisma.like.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) await this.prisma.like.delete({ where: { id: existing.id } });
    else await this.prisma.like.create({ data: { postId, userId } });
    const likes = await this.prisma.like.count({ where: { postId } });
    const result = { postId, liked: !existing, likes };
    this.gateway.likeChanged(result);
    return result;
  }

  // ─────────────── helpers ───────────────
  private async assertPost(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('post not found');
    return post;
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
