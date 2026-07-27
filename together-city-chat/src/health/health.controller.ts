import { Controller, Get, Query } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../shared/prisma/prisma.service';

/** Public health/status endpoint. Exposes only non-sensitive booleans — used to
 *  verify the deployment (e.g. whether AI features are configured). No secrets. */
@Controller('health')
export class HealthController {
  constructor(private readonly ai: AiService, private readonly prisma: PrismaService) {}

  @Get()
  status() {
    return {
      ok: true,
      aiEnabled: this.ai.enabled,          // true when an Anthropic key is configured
      photoAnalysis: this.ai.enabled ? 'live' : 'fallback (deterministic)',
      // Bumped on deploys to confirm which backend build is live on Railway.
      build: 'profile-visibility-3',
    };
  }

  /** TEMPORARY diagnostic (no secrets, only counts) — why do public profiles
   *  show no posts? Reports a handle's post counts, audience distribution, and
   *  the count the public-profile query returns. Remove after debugging. */
  @Get('debug-posts')
  async debugPosts(@Query('handle') handleRaw?: string) {
    const handle = (handleRaw ?? '').trim().replace(/^@/, '').toLowerCase();
    if (!handle) return { error: 'pass ?handle=' };
    const u = await this.prisma.user.findUnique({ where: { handle }, select: { id: true } });
    if (!u) return { found: false, handle };
    const out: Record<string, unknown> = { found: true, handle };
    try { out.total = await this.prisma.post.count({ where: { authorId: u.id } }); } catch (e) { out.totalErr = String(e); }
    try { out.nonRepost = await this.prisma.post.count({ where: { authorId: u.id, repostOfId: null } as never }); } catch (e) { out.nonRepostErr = String(e); }
    try {
      const all = (await this.prisma.post.findMany({ where: { authorId: u.id }, select: { audience: true, repostOfId: true } as never })) as unknown as Array<{ audience: string | null; repostOfId: string | null }>;
      const byAudience: Record<string, number> = {};
      let reposts = 0;
      for (const p of all) { const a = p.audience ?? 'NULL'; byAudience[a] = (byAudience[a] ?? 0) + 1; if (p.repostOfId) reposts++; }
      out.byAudience = byAudience;
      out.repostCount = reposts;
    } catch (e) { out.byAudienceErr = String(e); }
    try {
      out.publicProfileQueryCount = await this.prisma.post.count({ where: { authorId: u.id, repostOfId: null, OR: [{ audience: { not: 'private' } }, { audience: null }] } as never });
    } catch (e) { out.publicProfileQueryErr = String(e); }
    try {
      const rows = await this.prisma.post.findMany({
        where: { authorId: u.id, repostOfId: null, OR: [{ audience: { not: 'private' } }, { audience: null }] } as never,
        orderBy: [{ sortIndex: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] as never,
        take: 3,
        include: { media: true, _count: { select: { likes: true, comments: true } }, author: { select: { id: true, handle: true } }, likes: { where: { userId: u.id }, select: { id: true } } },
      });
      out.sampleFindManyCount = rows.length;
    } catch (e) { out.findManyErr = String(e); }
    return out;
  }
}
