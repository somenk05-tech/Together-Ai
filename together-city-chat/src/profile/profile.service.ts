import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

export interface HubContribution { hub: string; label: string; summary: string; href: string; }
export interface ProfileSection { key: string; label: string; value: string | null; }
export interface ProfileSummary { hubs: HubContribution[]; sections: ProfileSection[]; memberSince: string; profileImage: string | null; }

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
      select: { handle: true, name: true, email: true, phone: true, profileImage: true, createdAt: true },
    });

    // Pull each sector's data in parallel; a hub with nothing contributes nothing.
    const [foodPref, fitness, dating, beauty, wallet, bloodTests, connected, followers, following, posts, mail, plans] =
      await Promise.all([
        this.prisma.foodPref.findUnique({ where: { userId } }),
        this.prisma.fitnessProfile.findUnique({ where: { userId } }),
        this.prisma.datingProfile.findUnique({ where: { userId } }),
        this.prisma.beautyProfile.findUnique({ where: { userId } }),
        this.prisma.cityWallet.findUnique({ where: { userId } }),
        this.prisma.medicalBloodTest.count({ where: { userId } }),
        this.prisma.connection.count({ where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] } }),
        this.prisma.follow.count({ where: { followeeId: userId } }),
        this.prisma.follow.count({ where: { followerId: userId } }),
        this.prisma.post.count({ where: { authorId: userId } }),
        this.prisma.mailAccount.findUnique({ where: { userId } }),
        this.prisma.mealPlan.count({ where: { userId } }),
      ]);

    const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
    const hubs: HubContribution[] = [];
    if (foodPref) hubs.push({ hub: 'nutrition', label: 'Nutrition', summary: `Diet: ${foodPref.diet} · Goal: ${foodPref.goal}`, href: '/nutrition/preferences' });
    if (plans) hubs.push({ hub: 'meal-plans', label: 'Meal plans', summary: `${plans} saved plan${plans > 1 ? 's' : ''}`, href: '/nutrition/weekly' });
    if (bloodTests) hubs.push({ hub: 'medical', label: 'Medical', summary: `${bloodTests} blood test${bloodTests > 1 ? 's' : ''} on file`, href: '/medical/records' });
    if (fitness) hubs.push({ hub: 'fitness', label: 'Fitness', summary: `${fitness.level} · goal: ${fitness.goal}`, href: '/fitness/plan' });
    if (dating) hubs.push({ hub: 'dating', label: 'Dating', summary: dating.visible ? 'Profile visible' : 'Profile hidden', href: '/dating/profile' });
    if (beauty) hubs.push({ hub: 'beauty', label: 'Beauty', summary: `Skin: ${beauty.skinType} · Hair: ${beauty.hairType}`, href: '/beauty/profile' });
    if (wallet) hubs.push({ hub: 'financial', label: 'Financial', summary: `Wallet ${inr(wallet.balanceInr)}`, href: '/financial' });
    hubs.push({ hub: 'social', label: 'Social', summary: `${followers} followers · ${following} following · ${posts} posts`, href: '/social/profile' });
    hubs.push({ hub: 'connections', label: 'Connections', summary: `${connected} connected`, href: '/connections' });
    if (mail) hubs.push({ hub: 'mail', label: 'Mail', summary: mail.address, href: '/mail/inbox' });

    const sections: ProfileSection[] = [
      { key: 'name', label: 'Name', value: user?.name ?? null },
      { key: 'handle', label: 'Handle', value: user ? `@${user.handle}` : null },
      { key: 'email', label: 'City email', value: user ? `${user.handle}@togethercity.tech` : null },
      { key: 'primaryEmail', label: 'Primary email', value: user?.email ?? null },
      { key: 'phone', label: 'Phone', value: user?.phone ?? null },
    ];
    return {
      hubs,
      sections,
      memberSince: (user?.createdAt ?? new Date()).toISOString(),
      profileImage: user?.profileImage ?? null,
    };
  }

  async updateSection(userId: string, key: string, value: string): Promise<ProfileSummary> {
    if (key === 'name') {
      await this.prisma.user.update({ where: { id: userId }, data: { name: value } });
    }
    return this.summary(userId);
  }
}
