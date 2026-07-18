import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

export interface HubContribution { hub: string; label: string; summary: string; href: string; }
export interface ProfileSection { key: string; label: string; value: string | null; }
export interface ProfileSummary { hubs: HubContribution[]; sections: ProfileSection[]; memberSince: string; }

/**
 * Aggregates the signed-in user's identity + any cross-hub contributions.
 * Hub tables are added per-module; until a hub persists data it simply
 * contributes nothing (matching the vanilla "starts empty" behaviour).
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string): Promise<ProfileSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { handle: true, name: true, createdAt: true, onlineStatus: true },
    });
    const hubs: HubContribution[] = [];
    // TODO: as hubs land, push contributions here (nutrition plan saved, etc.)
    const sections: ProfileSection[] = [
      { key: 'name', label: 'Name', value: user?.name ?? null },
      { key: 'handle', label: 'Handle', value: user ? `@${user.handle}` : null },
      { key: 'email', label: 'City email', value: user ? `${user.handle}@togethercity.tech` : null },
    ];
    return { hubs, sections, memberSince: (user?.createdAt ?? new Date()).toISOString() };
  }

  async updateSection(userId: string, key: string, value: string): Promise<ProfileSummary> {
    if (key === 'name') {
      await this.prisma.user.update({ where: { id: userId }, data: { name: value } });
    }
    return this.summary(userId);
  }
}
