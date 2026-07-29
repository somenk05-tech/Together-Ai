import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import type { CreateThoughtDto, ListThoughtsDto, UpdateThoughtDto } from './dto/thoughts.dto';

/**
 * A private journal.
 *
 * Every query here is scoped by userId — not because a helper enforces it, but
 * because there is no reading of a thought that is not the author reading their
 * own. A thought has no audience, so "whose is it" is never a question with an
 * interesting answer.
 *
 * A missing thought and someone else's thought both answer 404. Distinguishing
 * them would confirm to a stranger that a given id exists.
 */
interface ThoughtRow {
  id: string;
  userId: string;
  title: string | null;
  body: string;
  mood: string | null;
  tags: string | null;
  visibility: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

@Injectable()
export class ThoughtsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The generated Prisma client in this checkout predates Thought — `prisma
   * generate` needs network access that the build environment does not have —
   * so the delegate is reached through one narrow accessor instead of a cast at
   * every call site.
   *
   * Delete this and use `this.prisma.thought` directly once the client is
   * regenerated. It is worth doing promptly: while these queries go through a
   * cast, the query-scoping guard in src/security cannot see them, so the
   * userId filters below are checked by review rather than by the suite.
   */
  private get table() {
    return (this.prisma as unknown as {
      thought: {
        findMany(a: unknown): Promise<ThoughtRow[]>;
        findFirst(a: unknown): Promise<ThoughtRow | null>;
        create(a: unknown): Promise<ThoughtRow>;
        updateMany(a: unknown): Promise<{ count: number }>;
      };
    }).thought;
  }

  private shape(t: ThoughtRow) {
    return {
      id: t.id,
      title: t.title,
      body: t.body,
      mood: t.mood,
      tags: t.tags ? t.tags.split(',').filter(Boolean) : [],
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private packTags(tags?: string[]): string | null {
    if (!tags) return null;
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    return clean.length ? clean.join(',') : null;
  }

  /** Newest first, cursor-paginated. A journal only grows, so it is never unbounded. */
  async list(userId: string, dto: ListThoughtsDto) {
    const take = dto.limit ?? 20;
    const rows = await this.table.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(dto.q
          ? { OR: [{ title: { contains: dto.q, mode: 'insensitive' as const } }, { body: { contains: dto.q, mode: 'insensitive' as const } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((t) => this.shape(t)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async get(userId: string, id: string) {
    const t = await this.table.findFirst({ where: { id, userId, deletedAt: null } });
    if (!t) throw new NotFoundException('No such thought.');
    return this.shape(t);
  }

  async create(userId: string, dto: CreateThoughtDto) {
    const t = await this.table.create({
      data: {
        userId,
        title: dto.title ?? null,
        body: dto.body,
        mood: dto.mood ?? null,
        tags: this.packTags(dto.tags),
      },
    });
    return this.shape(t);
  }

  async update(userId: string, id: string, dto: UpdateThoughtDto) {
    // updateMany scoped by userId, so ownership is enforced by the query rather
    // than by a check that a later edit could forget to keep.
    const res = await this.table.updateMany({
      where: { id, userId, deletedAt: null },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.mood !== undefined ? { mood: dto.mood } : {}),
        ...(dto.tags !== undefined ? { tags: this.packTags(dto.tags) } : {}),
      },
    });
    if (res.count === 0) throw new NotFoundException('No such thought.');
    return this.get(userId, id);
  }

  /** Soft delete — it leaves every list at once and stays recoverable. */
  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const res = await this.table.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('No such thought.');
    return { ok: true };
  }
}
