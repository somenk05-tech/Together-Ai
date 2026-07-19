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
      ...this.nutritionSections(foodPref),
      ...this.datingSections(dating),
    ];
    return {
      hubs,
      sections,
      memberSince: (user?.createdAt ?? new Date()).toISOString(),
      profileImage: user?.profileImage ?? null,
    };
  }

  /** Flatten the full food-preference profile into profile rows so everything
   *  set on the Nutrition preferences page is visible on the profile. */
  private nutritionSections(foodPref: unknown): ProfileSection[] {
    const p = foodPref as {
      diet?: string; goal?: string; activity?: number; heightCm?: number | null; weightKg?: number | null;
      age?: number | null; sex?: string | null; extras?: string | null;
    } | null;
    if (!p) return [];
    let ex: {
      cuisineMix?: Record<string, number>; cuisines?: string[]; proteins?: string[]; meats?: string[];
      pattern?: string; allergies?: string; excluded?: string; budgetInr?: number | null; maxCookMin?: number | null; conditions?: string;
      healthConditions?: string[]; equipment?: string[]; healthGoals?: string[];
    } = {};
    try { ex = p.extras ? JSON.parse(p.extras) : {}; } catch { ex = {}; }

    const actLabel = (a?: number) => a == null ? null
      : a <= 1.3 ? 'Sedentary' : a <= 1.5 ? 'Lightly active' : a <= 1.7 ? 'Moderately active' : a <= 1.9 ? 'Very active' : 'Athlete';
    const goalLabel = ({ lose: 'Weight loss', maintain: 'Maintain', gain: 'Muscle gain' } as Record<string, string>)[p.goal ?? ''] ?? p.goal ?? null;
    const cuisines = ex.cuisineMix && Object.keys(ex.cuisineMix).length
      ? Object.entries(ex.cuisineMix).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}%`).join(' · ')
      : (ex.cuisines ?? []).join(', ');
    const body = [p.age && `${p.age}y`, p.sex, p.heightCm && `${p.heightCm}cm`, p.weightKg && `${p.weightKg}kg`].filter(Boolean).join(' · ');

    const rows: ProfileSection[] = [
      { key: 'n_diet', label: 'Diet', value: p.diet ?? null },
      { key: 'n_goal', label: 'Nutrition goal', value: goalLabel },
      { key: 'n_hgoals', label: 'Health goals', value: (ex.healthGoals ?? []).join(', ') || null },
      { key: 'n_conditions', label: 'Health conditions', value: (ex.healthConditions ?? []).join(', ') || null },
      { key: 'n_equipment', label: 'Kitchen equipment', value: (ex.equipment ?? []).join(', ') || null },
      { key: 'n_activity', label: 'Activity level', value: actLabel(p.activity) },
      { key: 'n_body', label: 'Body stats', value: body || null },
      { key: 'n_cuisines', label: 'Cuisine mix', value: cuisines || null },
      { key: 'n_proteins', label: 'Protein sources', value: (ex.proteins ?? []).join(', ') || null },
      { key: 'n_meats', label: 'Meats', value: (ex.meats ?? []).join(', ') || null },
      { key: 'n_pattern', label: 'Nutrition pattern', value: ex.pattern ?? null },
      { key: 'n_allergies', label: 'Allergies', value: ex.allergies || null },
      { key: 'n_avoids', label: 'Foods avoided', value: ex.excluded || null },
      { key: 'n_budget', label: 'Grocery budget', value: ex.budgetInr ? `₹${ex.budgetInr}/day` : null },
    ];
    return rows.filter((r) => r.value);
  }

  /** Key dating-profile fields, for the unified profile view. */
  private datingSections(dating: unknown): ProfileSection[] {
    const d = dating as { gender?: string; seeking?: string; extras?: string | null } | null;
    if (!d) return [];
    let ex: {
      relationshipGoal?: string; city?: string; state?: string; profession?: string; education?: string;
      personalityTraits?: string[]; values?: string[]; heightCm?: number | null;
    } = {};
    try { ex = d.extras ? JSON.parse(d.extras) : {}; } catch { ex = {}; }
    const seek = ({ any: 'Anyone', male: 'Men', female: 'Women', nonbinary: 'Non-binary' } as Record<string, string>)[d.seeking ?? ''] ?? null;
    const rows: ProfileSection[] = [
      { key: 'd_goal', label: 'Relationship goal', value: ex.relationshipGoal ?? null },
      { key: 'd_seeking', label: 'Dating · seeking', value: seek },
      { key: 'd_loc', label: 'Dating · location', value: [ex.city, ex.state].filter(Boolean).join(', ') || null },
      { key: 'd_work', label: 'Dating · profession', value: ex.profession ?? null },
      { key: 'd_traits', label: 'Personality', value: (ex.personalityTraits ?? []).join(', ') || null },
      { key: 'd_values', label: 'Values', value: (ex.values ?? []).join(', ') || null },
    ];
    return rows.filter((r) => r.value);
  }

  async updateSection(userId: string, key: string, value: string): Promise<ProfileSummary> {
    if (key === 'name') {
      await this.prisma.user.update({ where: { id: userId }, data: { name: value } });
    }
    return this.summary(userId);
  }
}
