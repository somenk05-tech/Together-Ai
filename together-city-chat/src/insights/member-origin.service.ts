import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { hostOf, sourceOf } from './insights-math';

/**
 * WHERE A MEMBER CAME FROM (owner, 16 Sep: "support UTM parameters … show
 * acquisition quality"). The web keeps the first campaign tags and referring
 * site a browser arrived with, and sends them once after sign-in. The FIRST
 * answer is kept; a later visit from an ad does not rewrite how somebody
 * found the city. Only a referring HOST is kept, never a full address.
 */
@Injectable()
export class MemberOriginService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, o: {
    visitor?: string | null; source?: string | null; medium?: string | null; campaign?: string | null;
    content?: string | null; term?: string | null; referrer?: string | null; landedAt?: string | null;
  }): Promise<void> {
    const host = hostOf(o.referrer);
    const source = sourceOf(o.source, o.medium, host);
    const landedAt = o.landedAt ? new Date(o.landedAt) : null;
    await this.prisma.$executeRaw`
      INSERT INTO "MemberOrigin" ("userId", "visitor", "source", "utmSource", "medium", "campaign", "content", "term", "referrer", "landedAt")
      VALUES (${userId}, ${o.visitor ?? null}, ${source}, ${o.source ?? null}, ${o.medium ?? null}, ${o.campaign ?? null},
              ${o.content ?? null}, ${o.term ?? null}, ${host}, ${landedAt})
      ON CONFLICT ("userId") DO NOTHING`;
  }
}
