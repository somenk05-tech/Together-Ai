import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { buildLookupSeed } from './lookup.data';

export interface LookupOption { code: string; label: string; parentCode: string | null }

/**
 * Standardized master-data lookups (countries, states, cities, languages, …).
 * Seeds idempotently on boot so every hub reads the same values; serves filtered,
 * searchable option lists to the dropdown components.
 */
@Injectable()
export class LookupsService implements OnModuleInit {
  private readonly logger = new Logger(LookupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // The Lookup model is new; access it through a narrow cast until the committed
  // Prisma client is regenerated (matches the offline-client pattern used elsewhere).
  private get repo() {
    return (this.prisma as unknown as {
      lookup: {
        count(args?: unknown): Promise<number>;
        createMany(args: unknown): Promise<{ count: number }>;
        findMany(args: unknown): Promise<LookupOption[]>;
      };
    }).lookup;
  }

  async onModuleInit(): Promise<void> {
    try {
      const seed = buildLookupSeed();
      const res = await this.repo.createMany({ data: seed, skipDuplicates: true });
      if (res.count) this.logger.log(`Seeded ${res.count} lookup options`);
    } catch (e) {
      // Non-fatal: on a fresh DB the table may not exist until db push completes.
      this.logger.warn(`Lookup seed skipped: ${(e as Error).message}`);
    }
  }

  async list(category: string, parent?: string, q?: string, limit = 200): Promise<LookupOption[]> {
    const cat = (category ?? '').trim();
    if (!cat) return [];
    const where: Record<string, unknown> = { category: cat, active: true };
    if (parent && parent.trim()) where.parentCode = parent.trim();
    if (q && q.trim()) where.label = { contains: q.trim(), mode: 'insensitive' };
    try {
      return await this.repo.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        take: Math.min(Math.max(limit, 1), 500),
        select: { code: true, label: true, parentCode: true },
      });
    } catch (e) {
      this.logger.warn(`Lookup list(${cat}) failed: ${(e as Error).message}`);
      return [];
    }
  }
}
