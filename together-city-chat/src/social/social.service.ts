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

  /** Followers = people who follow you OR are connected to you. */
  async followers(userId: string) {
    const [rows, conns] = await Promise.all([
      this.prisma.follow.findMany({ where: { followeeId: userId }, select: { follower: { select: AUTHOR_SELECT } } }),
      this.prisma.connection.findMany({
        where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
        include: { userOne: { select: AUTHOR_SELECT }, userTwo: { select: AUTHOR_SELECT } },
      }),
    ]);
    const byId = new Map<string, { id: string; handle: string; name: string; profileImage: string | null }>();
    for (const r of rows) byId.set(r.follower.id, r.follower);
    for (const c of conns) {
      const u = c.userOneId === userId ? c.userTwo : c.userOne;
      byId.set(u.id, u);
    }
    return [...byId.values()];
  }

  /** Following = people you follow OR are connected to (mutual with connections). */
  async following(userId: string) {
    const network = await this.networkIds(userId);
    const others = network.filter((id) => id !== userId);
    if (!others.length) return [];
    const users = await this.prisma.user.findMany({ where: { id: { in: others } }, select: AUTHOR_SELECT });
    return users;
  }

  // ─────────────── posts ───────────────
  async createPost(userId: string, dto: CreatePostDto) {
    const post = await this.prisma.post.create({
      data: {
        authorId: userId,
        text: dto.text?.trim() ?? null,
        feeling: dto.feeling ?? null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        media: dto.media?.length
          ? { create: dto.media.map((m) => ({ url: m.url, kind: m.kind, thumbUrl: m.thumbUrl ?? null })) }
          : undefined,
      },
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
    const network = await this.networkIds(userId);
    const posts = await this.prisma.post.findMany({
      where: { authorId: { in: network } },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
    return {
      id: p.id,
      text: p.text,
      feeling: p.feeling,
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
