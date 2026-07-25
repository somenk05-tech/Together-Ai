import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from '../connections/connection.util';
import { MasterProfileService } from './master-profile.service';

export interface HubContribution { hub: string; label: string; summary: string; href: string; }
export interface ProfileSection { key: string; label: string; value: string | null; }
export interface ProfileSummary { hubs: HubContribution[]; sections: ProfileSection[]; memberSince: string; profileImage: string | null; }

export type Relationship = 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked';

/** Derived, activity-based reputation & city points — no stored/dummy values. */
export interface ProfileStats { posts: number; reputation: number; cityPoints: number; connections: number; followers: number; following: number; }

/** The signed-in citizen's own social profile (My Profile page). */
export interface MyProfile {
  id: string; handle: string; name: string; profileImage: string | null;
  bio: string | null; city: string | null; website: string | null;
  email: string | null; verified: boolean; memberSince: string; stats: ProfileStats;
}

/** Another citizen's public profile (People tab → View Profile). Never exposes email. */
export interface PublicProfile {
  id: string; handle: string; name: string; profileImage: string | null;
  bio: string | null; city: string | null; website: string | null;
  verified: boolean; memberSince: string; stats: ProfileStats; relationship: Relationship;
}

interface UserRow {
  id: string; handle: string; name: string; email: string | null; profileImage: string | null;
  emailVerified: boolean; createdAt: Date; bio: string | null; city: string | null; website: string | null;
}

/**
 * Aggregates the signed-in user's identity + any cross-hub contributions.
 * Hub tables are added per-module; until a hub persists data it simply
 * contributes nothing (matching the vanilla "starts empty" behaviour).
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
  ) {}

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

  // ─────────────────────────── Social profile ───────────────────────────

  private readonly userSelect = {
    id: true, handle: true, name: true, email: true, profileImage: true,
    emailVerified: true, createdAt: true, bio: true, city: true, website: true,
  } as never;

  /** Reputation & city points derived from real activity — 0 for a brand-new
   *  account, growing as the citizen posts and connects. Never seeded. */
  async statsFor(userId: string): Promise<ProfileStats> {
    const [posts, likesReceived, commentsReceived, followerRows, followeeRows, connRows] = await Promise.all([
      this.prisma.post.count({ where: { authorId: userId } }),
      this.prisma.like.count({ where: { post: { authorId: userId } } }),
      this.prisma.comment.count({ where: { post: { authorId: userId } } }),
      this.prisma.follow.findMany({ where: { followeeId: userId }, select: { followerId: true } }),
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
      this.prisma.connection.findMany({ where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] }, select: { userOneId: true, userTwoId: true } }),
    ]);
    const connIds = connRows.map((c) => (c.userOneId === userId ? c.userTwoId : c.userOneId));
    const connections = connRows.length;
    // Followers/following mirror the real lists: follow edges unioned with
    // connections (which are mutual follows), de-duplicated.
    const followers = new Set([...followerRows.map((r) => r.followerId), ...connIds]).size;
    const following = new Set([...followeeRows.map((r) => r.followeeId), ...connIds]).size;
    // Reputation rewards engagement your posts earn plus real connections;
    // city points reward contribution volume. Simple, transparent, real.
    const reputation = likesReceived + commentsReceived * 2 + connections * 3;
    const cityPoints = posts * 10 + likesReceived + commentsReceived;
    return { posts, reputation, cityPoints, connections, followers, following };
  }

  /** The signed-in citizen's own profile. */
  async me(userId: string): Promise<MyProfile> {
    const u = (await this.prisma.user.findUnique({ where: { id: userId }, select: this.userSelect })) as unknown as UserRow | null;
    if (!u) throw new NotFoundException('Account not found');
    const stats = await this.statsFor(userId);
    return {
      id: u.id, handle: u.handle, name: u.name, profileImage: u.profileImage,
      bio: u.bio, city: u.city, website: u.website, email: u.email,
      verified: u.emailVerified, memberSince: u.createdAt.toISOString(), stats,
    };
  }

  /** Update editable profile fields. Handle changes are validated for uniqueness. */
  async updateProfile(
    userId: string,
    dto: { name?: string; handle?: string; bio?: string; city?: string; website?: string },
  ): Promise<MyProfile> {
    const data: Record<string, string | null> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 1 || name.length > 80) throw new BadRequestException('Name must be 1–80 characters.');
      data.name = name;
    }
    if (dto.handle !== undefined) {
      const handle = dto.handle.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_.]{3,30}$/.test(handle)) throw new BadRequestException('Handle must be 3–30 chars: letters, numbers, _ or .');
      const clash = await this.prisma.user.findUnique({ where: { handle } });
      if (clash && clash.id !== userId) throw new ConflictException('That handle is already taken.');
      data.handle = handle;
    }
    if (dto.bio !== undefined) {
      const bio = dto.bio.trim();
      if (bio.length > 280) throw new BadRequestException('Bio must be 280 characters or fewer.');
      data.bio = bio || null;
    }
    if (dto.city !== undefined) data.city = dto.city.trim().slice(0, 80) || null;
    if (dto.website !== undefined) {
      const site = dto.website.trim();
      if (site && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(site)) throw new BadRequestException('Enter a valid URL (https://…).');
      data.website = site || null;
    }
    if (Object.keys(data).length) {
      await this.prisma.user.update({ where: { id: userId }, data: data as never });
    }
    // City is a shared field — write it back to the Master Profile so every hub
    // picks it up (spec: hubs write shared fields to the single source of truth).
    if (dto.city !== undefined) {
      await this.masterProfile.syncShared(userId, { city: (data.city as string | null) ?? undefined }, 'social').catch(() => undefined);
    }
    return this.me(userId);
  }

  /** The citizen's own posts, newest-first, cursor-paginated for the profile grid. */
  async myPosts(userId: string, cursor?: string, limit = 18) {
    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.post.findMany({
      where: { authorId: userId },
      // Author's custom profile arrangement first (sortIndex 0,1,2…), then any
      // un-arranged posts newest-first. New posts (null sortIndex) surface at top
      // of the un-arranged group.
      orderBy: [
        { sortIndex: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ] as never,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { media: true, _count: { select: { likes: true, comments: true } } },
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((p) => ({
        id: p.id,
        text: p.text ?? null,
        feeling: p.feeling ?? null,
        createdAt: p.createdAt.toISOString(),
        outdoor: p.lat != null && p.lng != null,
        media: (p.media ?? []).map((m) => ({ url: m.url, kind: m.kind, thumbUrl: m.thumbUrl ?? null })),
        likeCount: (p as unknown as { _count: { likes: number } })._count.likes,
        commentCount: (p as unknown as { _count: { comments: number } })._count.comments,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Save the author's custom order for their profile grid. `order` is the full
   *  list of post ids in the desired top-to-bottom order; each gets sortIndex =
   *  its position. Ids that aren't the caller's posts are ignored. */
  async reorderPosts(userId: string, order: string[]) {
    const ids = Array.isArray(order) ? order.filter((x) => typeof x === 'string') : [];
    if (!ids.length) return { ok: true, ordered: 0 };
    // Only reindex posts that actually belong to the caller.
    const owned = await this.prisma.post.findMany({
      where: { id: { in: ids }, authorId: userId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    const updates = ids
      .filter((id) => ownedSet.has(id))
      .map((id, index) =>
        this.prisma.post.update({ where: { id }, data: { sortIndex: index } as never }),
      );
    await this.prisma.$transaction(updates);
    return { ok: true, ordered: updates.length };
  }

  private relationshipOf(status: string | undefined, requestedById: string | undefined, viewerId: string): Relationship {
    if (status === 'ACCEPTED') return 'accepted';
    if (status === 'BLOCKED') return 'blocked';
    if (status === 'PENDING') return requestedById === viewerId ? 'pending_out' : 'pending_in';
    return 'none';
  }

  /** View another citizen's public profile by handle (never exposes email). */
  async publicProfile(viewerId: string, handleRaw: string): Promise<PublicProfile> {
    const handle = (handleRaw ?? '').trim().replace(/^@/, '').toLowerCase();
    const u = (await this.prisma.user.findUnique({ where: { handle }, select: this.userSelect })) as unknown as UserRow | null;
    if (!u) throw new NotFoundException('No citizen with that handle.');
    const stats = await this.statsFor(u.id);
    let relationship: Relationship = 'none';
    if (u.id !== viewerId) {
      const { userOneId, userTwoId } = orderPair(viewerId, u.id);
      const conn = await this.prisma.connection.findFirst({ where: { userOneId, userTwoId, connectionType: 'FRIEND' }, select: { status: true, requestedById: true } });
      relationship = this.relationshipOf(conn?.status, conn?.requestedById, viewerId);
    }
    return {
      id: u.id, handle: u.handle, name: u.name, profileImage: u.profileImage,
      bio: u.bio, city: u.city, website: u.website,
      verified: u.emailVerified, memberSince: u.createdAt.toISOString(), stats, relationship,
    };
  }

  /**
   * People search — match by handle (prefix) or name (contains). This is a
   * typed lookup, not a browsable directory: an empty/very short query returns
   * nothing, so members aren't enumerable. Excludes the searcher.
   */
  async searchPeople(viewerId: string, qRaw: string) {
    const q = (qRaw ?? '').trim().replace(/^@/, '');
    if (q.length < 2) return { items: [] as unknown[] };
    const handleQ = q.toLowerCase();
    const rows = (await this.prisma.user.findMany({
      where: {
        id: { not: viewerId },
        OR: [
          { handle: { startsWith: handleQ } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, handle: true, name: true, profileImage: true, city: true, emailVerified: true } as never,
      take: 12,
    })) as unknown as Array<{ id: string; handle: string; name: string; profileImage: string | null; city: string | null; emailVerified: boolean }>;

    // One query for the viewer's connections, mapped to each result.
    const ids = rows.map((r) => r.id);
    const conns = ids.length
      ? await this.prisma.connection.findMany({
          where: { connectionType: 'FRIEND', OR: [
            { userOneId: viewerId, userTwoId: { in: ids } },
            { userTwoId: viewerId, userOneId: { in: ids } },
          ] },
          select: { userOneId: true, userTwoId: true, status: true, requestedById: true },
        })
      : [];
    const byOther = new Map(conns.map((c) => [c.userOneId === viewerId ? c.userTwoId : c.userOneId, c]));

    return {
      items: rows.map((r) => {
        const c = byOther.get(r.id);
        return {
          id: r.id, handle: r.handle, name: r.name, profileImage: r.profileImage,
          city: r.city, verified: r.emailVerified,
          relationship: this.relationshipOf(c?.status, c?.requestedById, viewerId),
        };
      }),
    };
  }
}
