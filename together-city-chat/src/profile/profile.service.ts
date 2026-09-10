import { swallow, swallowed } from '../shared/swallow';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ReadCache } from '../shared/cache/read-cache.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { BlockingService } from '../connections/blocking.service';
import { REACHABLE_ACCOUNT, accountReachable } from '../admin/account-reach';
import { VISIBLE_ONLY } from '../social/post-visibility';
import { AdminAccessService } from '../admin/admin-access.service';
import { StorageProvider } from '../media/storage.provider';
import { ConnectionsService } from '../connections/connections.service';
import { isReservedAdminHandle } from '../auth/admin';
import { orderPair } from '../connections/connection.util';
import { MasterProfileService } from './master-profile.service';
import { parseHiddenHubs, normalizeHiddenHubs, type DesignableHub } from './design-your-services';

export interface HubContribution { hub: string; label: string; summary: string; href: string; }
export interface ProfileSection { key: string; label: string; value: string | null; }
export interface ProfileSummary { hubs: HubContribution[]; sections: ProfileSection[]; memberSince: string; profileImage: string | null; }

export type Relationship = 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked';

/** How long a profile's six numbers may be stale. A reputation score thirty
 *  seconds behind is not wrong in any way a citizen can perceive; a profile
 *  page that re-counts every like an account has ever received on every view
 *  is. Fails open — ReadCache hands back the real value when Redis is
 *  down and the caller never knows. */
const STATS_TTL_SEC = 30;

/** Derived, activity-based reputation & city points — no stored/dummy values. */
export interface ProfileStats { posts: number; reputation: number; cityPoints: number; connections: number; followers: number; following: number; }

/** The signed-in citizen's own social profile (My Profile page). */
export interface MyProfile {
  id: string; handle: string; name: string; profileImage: string | null;
  bio: string | null; city: string | null; website: string | null;
  email: string | null; verified: boolean; memberSince: string; stats: ProfileStats;
  /** True when this account holds the moderator role. Computed from User.role
   *  on every read rather than carried in the JWT, so revoking it takes effect
   *  on the next request instead of on the next sign-in. It is here only so the
   *  client knows whether to offer the queue — every moderation endpoint checks
   *  the role again for itself. */
  isModerator: boolean;
}

/** Another citizen's public profile (People tab → View Profile). Never exposes email. */
export interface PublicProfile {
  id: string; handle: string; name: string; profileImage: string | null;
  bio: string | null; city: string | null; website: string | null;
  verified: boolean; memberSince: string; stats: ProfileStats; relationship: Relationship;
  iFollow: boolean; isMe: boolean;
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
    private readonly connections: ConnectionsService,
    private readonly blocking: BlockingService,
    private readonly access: AdminAccessService,
    private readonly storage: StorageProvider,
    @Optional() private readonly cache?: ReadCache,
  ) {}

  /**
   * Which of these posts the VIEWER has saved (launch gate, third reading,
   * 4 Sep). The feed sends `savedByMe` on every card; these two grids did
   * not, so the same PostCard rendered "Save" over a post already saved, and
   * tapping it unsaved the post while the label stayed "Save". Read through
   * the same cast SocialService uses, and swallowed the same way: a grid
   * that cannot say what you saved is a grid; one that 500s is not.
   */
  private async savedSetFor(viewerId: string, postIds: string[]): Promise<Set<string>> {
    const table = (this.prisma as unknown as {
      bookmark?: { findMany: (a: unknown) => Promise<Array<{ postId: string }>> };
    }).bookmark;
    if (!table || !postIds.length) return new Set();
    const found = await table.findMany({ where: { userId: viewerId, postId: { in: postIds } }, select: { postId: true }, take: postIds.length })
      .catch(swallowed('profile.posts.savedSet', [] as Array<{ postId: string }>));
    return new Set(found.map((b) => b.postId));
  }

  /** DESIGN YOUR SERVICES — read which hubs this citizen keeps off the street.
   *  Null, empty and corrupt all read as the whole city; see the module. */
  async services(userId: string): Promise<{ hidden: DesignableHub[] }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { hiddenHubsJson: true },
    });
    return { hidden: parseHiddenHubs(u?.hiddenHubsJson) };
  }

  /** DESIGN YOUR SERVICES — replace the citizen's design with the list sent.
   *  The controller has already refused unknown keys; normalising again here
   *  keeps the stored string canonical whatever order the client clicked in. */
  async designServices(userId: string, hidden: readonly string[]): Promise<{ hidden: DesignableHub[] }> {
    const next = normalizeHiddenHubs(hidden);
    await this.prisma.user.update({
      where: { id: userId },
      data: { hiddenHubsJson: JSON.stringify(next) },
    });
    return { hidden: next };
  }

  async summary(userId: string): Promise<ProfileSummary> {
    // The three verification columns are new enough that a checked-out client
    // may not have them yet, so the select is cast and the result is given the
    // shape it actually has. Same reason the rest of the file uses UserRow.
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        handle: true, name: true, email: true, phone: true, profileImage: true, createdAt: true,
        emailVerified: true, emailVerifiedAt: true, phoneE164: true, phoneVerifiedAt: true,
      },
    })) as unknown as {
      handle: string; name: string; email: string | null; phone: string | null;
      profileImage: string | null; createdAt: Date;
      emailVerified: boolean; emailVerifiedAt: Date | null;
      phoneE164: string | null; phoneVerifiedAt: Date | null;
    } | null;

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

    /**
     * Has the citizen actually answered, or is this a row of column defaults?
     *
     * Registration creates FoodPref, BeautyProfile and FitnessProfile before the
     * citizen has said anything, and their defaults read exactly like answers —
     * "everything", "maintain", "normal", "straight", "beginner", and an age of
     * 35. Reporting those as the citizen's own is what the review photographed
     * on p1: a brand-new account describing a person who did not exist.
     *
     * The check is the explicit column, not a comparison against the defaults,
     * because "everything" and "maintain" are also perfectly good real answers.
     *
     * Takes `unknown` and reads the column defensively, the same loose-accessor
     * pattern the rest of this codebase uses for freshly-migrated fields: the
     * generated Prisma client only knows about `answeredAt` after the next
     * `prisma generate`, and a service should not fail to compile on the order
     * in which two build steps happen to run.
     */
    const answered = (row: unknown): boolean =>
      Boolean((row as { answeredAt?: Date | null } | null)?.answeredAt);

    const hubs: HubContribution[] = [];
    if (answered(foodPref)) hubs.push({ hub: 'nutrition', label: 'Nutrition', summary: `Diet: ${foodPref!.diet} · Goal: ${foodPref!.goal}`, href: '/nutrition/preferences' });
    if (plans) hubs.push({ hub: 'meal-plans', label: 'Meal plans', summary: `${plans} saved plan${plans > 1 ? 's' : ''}`, href: '/nutrition/weekly' });
    if (bloodTests) hubs.push({ hub: 'medical', label: 'Medical', summary: `${bloodTests} blood test${bloodTests > 1 ? 's' : ''} on file`, href: '/medical/records' });
    if (answered(fitness)) hubs.push({ hub: 'fitness', label: 'Fitness', summary: `${fitness!.level} · goal: ${fitness!.goal}`, href: '/fitness/plan' });
    if (dating) hubs.push({ hub: 'dating', label: 'Matchmaking', summary: dating.visible ? 'Profile visible' : 'Profile hidden', href: '/matchmaking/profile' });
    if (answered(beauty)) hubs.push({ hub: 'beauty', label: 'Beauty', summary: `Skin: ${beauty!.skinType} · Hair: ${beauty!.hairType}`, href: '/beauty/profile' });
    if (wallet) hubs.push({ hub: 'financial', label: 'Financial', summary: `Wallet ${inr(wallet.balanceInr)}`, href: '/financial' });
    // Only once there is something to count. Zero followers, zero following and
    // zero posts is a true statement and a pointless one — and on a new account
    // it was the whole of "Your data across Together City", which is an empty
    // state dressed as a dashboard.
    if (followers || following || posts) hubs.push({ hub: 'social', label: 'Social', summary: `${followers} followers · ${following} following · ${posts} posts`, href: '/social/profile' });
    if (connected) hubs.push({ hub: 'connections', label: 'Connections', summary: `${connected} connected`, href: '/connections' });
    if (mail) hubs.push({ hub: 'mail', label: 'Mail', summary: mail.address, href: '/mail/inbox' });

    const sections: ProfileSection[] = [
      { key: 'name', label: 'Name', value: user?.name ?? null },
      { key: 'handle', label: 'Handle', value: user ? `@${user.handle}` : null },
      { key: 'email', label: 'City email', value: user ? `${user.handle}@togethercity.app` : null },
      // The verified marker is part of the VALUE, not a separate field, because
      // the alternative — a bare address that may or may not be confirmed — is
      // the thing the review objected to: a screen stating something it has not
      // checked. An unverified address reads as unverified everywhere it shows.
      { key: 'primaryEmail', label: 'Primary email', value: verifiedLabel(user?.email ?? null, !!user?.emailVerified) },
      { key: 'phone', label: 'Phone', value: verifiedLabel(user?.phoneE164 ?? user?.phone ?? null, !!user?.phoneVerifiedAt) },
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
      { key: 'd_seeking', label: 'Matchmaking · seeking', value: seek },
      { key: 'd_loc', label: 'Matchmaking · location', value: [ex.city, ex.state].filter(Boolean).join(', ') || null },
      { key: 'd_work', label: 'Matchmaking · profession', value: ex.profession ?? null },
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
  };

  /** Reputation & city points derived from real activity — 0 for a brand-new
   *  account, growing as the citizen posts and connects. Never seeded. */
  async statsFor(userId: string): Promise<ProfileStats> {
    /**
     * ── SIX NUMBERS, AND ONE OF THEM WAS A WAY TO KILL THE CONTAINER ───────
     *
     * This read EVERY follower row, EVERY followee row and every accepted
     * connection, to build three `Set`s and take their `.size`. The comment
     * defending it — "a truncated set is a wrong number on the profile, not a
     * slow one" — was right about truncation and wrong about the remedy: the
     * numbers are exact either way, and only one of the two shapes
     * materialises half a million rows in this process when somebody opens a
     * popular account's profile. A handful of clients on `GET /profile/:handle`
     * for the city's biggest account was an out-of-memory kill, from an
     * endpoint that needs no permission at all. (1M-DAU pass, 6 Sep.)
     *
     * The union is preserved exactly. `followers` is (follow edges to me) ∪
     * (my connections, which are mutual follows), so its size is
     * |follows| + |connections| − |overlap|, and each of those three is a
     * COUNT. The overlap count is bounded by the connection id set, which is
     * socially bounded in a way a follower list is not — a person accepts
     * hundreds of connections and can be followed by millions — so that one
     * read stays as it was.
     *
     * The engagement counts underneath are still `count()` over every like and
     * comment the author has ever received, which is index-only but grows with
     * the account. The cache below is what makes that affordable today; the
     * real answer is a denormalised `likeCount` / `commentCount` on Post,
     * incremented at the write, and it is a bigger change than this pass.
     */
    return this.cache
      ? this.cache.wrap(`profile:stats:${userId}`, STATS_TTL_SEC, () => this.computeStats(userId))
      : this.computeStats(userId);
  }

  private async computeStats(userId: string): Promise<ProfileStats> {
    // unbounded: the accepted-connection id set — socially bounded; feeds the
    // overlap counts below rather than a list
    const connRows = await this.prisma.connection.findMany({
      where: { status: 'ACCEPTED', OR: [{ userOneId: userId }, { userTwoId: userId }] },
      select: { userOneId: true, userTwoId: true },
    });
    const connIds = connRows.map((c) => (c.userOneId === userId ? c.userTwoId : c.userOneId));
    const connections = connRows.length;

    const [posts, sums, sharesReceived, followerCount, followeeCount, followerOverlap, followeeOverlap] = await Promise.all([
      this.prisma.post.count({ where: { authorId: userId, repostOfId: null } }),
      /**
       * ── OFF THE COLUMNS NOW, NOT OFF A JOIN (1M-DAU pass, 6 Sep) ─────────
       *
       * These were `like.count({ where: { post: { authorId } } })` and its
       * comment twin, which Prisma compiles to
       *   SELECT COUNT(*) FROM "Like"
       *    WHERE "postId" IN (SELECT id FROM "Post" WHERE "authorId" = $1)
       * — every like row for every post the author ever wrote, exactly counted,
       * on a page load. The comment version was worse, because `Comment` had no
       * index on `authorId` at all until this pass.
       *
       * `Post.likeCount` / `Post.commentCount` are written where the like and
       * the comment land, so the same two numbers are one indexed aggregate
       * over the author's own posts. `_sum` is null for an author with no
       * posts, which is the `?? 0` below.
       */
      this.postSums(userId),
      // Shares = reposts of this citizen's posts.
      // Someone else's repost of your post: a removed one is not a share.
      this.prisma.post.count({ where: { ...VISIBLE_ONLY, repostOf: { authorId: userId } } }),
      this.prisma.follow.count({ where: { followeeId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
      // The two intersections, so the union is exact without either list.
      connIds.length ? this.prisma.follow.count({ where: { followeeId: userId, followerId: { in: connIds } } }) : Promise.resolve(0),
      connIds.length ? this.prisma.follow.count({ where: { followerId: userId, followeeId: { in: connIds } } }) : Promise.resolve(0),
    ]);
    // Followers/following mirror the real lists: follow edges unioned with
    // connections (which are mutual follows), de-duplicated.
    const likesReceived = sums.likes;
    const commentsReceived = sums.comments;
    const followers = followerCount + connections - followerOverlap;
    const following = followeeCount + connections - followeeOverlap;
    // Reputation rewards engagement your posts earn plus real connections;
    // city points reward contribution volume. Simple, transparent, real.
    const reputation = likesReceived + commentsReceived * 2 + connections * 3;
    // City points = likes + shares your posts have earned.
    const cityPoints = likesReceived + sharesReceived;
    return { posts, reputation, cityPoints, connections, followers, following };
  }

  /**
   * Likes and comments received across everything this citizen has posted, from
   * the kept counters rather than from a join. Clamped at zero for the same
   * reason `countsOf` clamps in social.service.ts: a counter that drifted below
   * zero is a bug to repair, not a negative number to show on a profile.
   */
  private async postSums(userId: string): Promise<{ likes: number; comments: number }> {
    const agg = await (this.prisma.post as unknown as {
      aggregate(a: unknown): Promise<{ _sum: { likeCount: number | null; commentCount: number | null } }>;
    }).aggregate({ where: { authorId: userId }, _sum: { likeCount: true, commentCount: true } });
    return {
      likes: Math.max(0, agg._sum.likeCount ?? 0),
      comments: Math.max(0, agg._sum.commentCount ?? 0),
    };
  }

  /** The signed-in citizen's own profile. */
  async me(userId: string): Promise<MyProfile> {
    const u = (await this.prisma.user.findUnique({ where: { id: userId }, select: this.userSelect })) as unknown as UserRow | null;
    if (!u) throw new NotFoundException('Account not found');
    // THE DOOR SIGN READS THE SAME SYSTEM AS THE DOOR (launch audit, 27 Aug).
    // This asked `User.role === 'admin'` — the MODERATION_ADMINS system — while
    // the moderation queue itself is gated on the AdminGrant permission map. So
    // the settings link appeared for people the queue would 403, and did not
    // appear for the moderators who could actually open it, who then had to
    // know the URL. `moderation.read` is exactly what the queue asks for.
    const [stats, isModerator] = await Promise.all([
      this.statsFor(userId),
      this.access.holds(userId, 'moderation.read'),
    ]);
    return {
      id: u.id, handle: u.handle, name: u.name, profileImage: u.profileImage,
      bio: u.bio, city: u.city, website: u.website, email: u.email,
      verified: u.emailVerified, memberSince: u.createdAt.toISOString(), stats,
      isModerator,
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
      // Moderator handles can't be renamed into. Authorisation reads User.role
      // now, so taking the name grants nothing — but leaving it claimable
      // invites impersonation of a moderator, which is its own problem.
      const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
      if (isReservedAdminHandle(handle, me?.handle)) throw new ConflictException('That handle is already taken.');
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
      await this.prisma.user.update({ where: { id: userId }, data: data });
    }
    // City is a shared field — write it back to the Master Profile so every hub
    // picks it up (spec: hubs write shared fields to the single source of truth).
    if (dto.city !== undefined) {
      await swallow(this.masterProfile.syncShared(userId, { city: (data.city as string | null) ?? undefined }, 'social'), 'master-profile city sync from social', { userId });
    }
    return this.me(userId);
  }

  /** The citizen's own posts, newest-first, cursor-paginated for the profile grid. */
  async myPosts(userId: string, cursor?: string, limit = 18) {
    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.post.findMany({
      where: { authorId: userId, repostOfId: null },
      /* THE ARRANGEMENT, THEN EVERYTHING THE AUTHOR NEVER ARRANGED.
         sortIndex asc, nulls last: an author who has pressed Rearrange has an
         explicit order, and the posts they never touched follow it newest
         first.

         A NEW POST IS ABOVE THE ARRANGEMENT, NOT BELOW IT (owner, 8 Sep), and
         that is settled where the post is WRITTEN rather than here:
         SocialService.createPost gives it one index below the author's
         smallest, so it lands first and nothing else moves. This comment used
         to claim nulls surfaced at the top, which is the opposite of what
         `nulls: 'last'` does — the claim was the bug's hiding place. */
      orderBy: [
        { sortIndex: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        media: true,
        _count: { select: { likes: true, comments: true } },
        author: { select: { id: true, handle: true, name: true, profileImage: true } },
        likes: { where: { userId }, select: { id: true } },
      },
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    // Post media is a private key now, signed on read (30 Aug audit). One pass
    // for the page, the same way SocialService.signMediaOf does it, or the grid
    // renders every photograph as a broken image.
    const [signed, saved] = await Promise.all([
      this.storage.signPostMedia(page.flatMap((p) => (p.media ?? []).flatMap((m) => [m.url, m.thumbUrl]))),
      this.savedSetFor(userId, page.map((p) => p.id)),
    ]);
    return {
      items: page.map((p) => {
        const px = p as unknown as {
          audience?: string | null; placeName?: string | null; taggedJson?: string | null; category?: string | null;
          author: { id: string; handle: string; name: string; profileImage: string | null };
          likes: unknown[]; _count: { likes: number; comments: number };
        };
        let tagged: Array<{ id: string; name: string; handle: string }> = [];
        try { tagged = px.taggedJson ? JSON.parse(px.taggedJson) : []; } catch { tagged = []; }
        return {
          id: p.id,
          text: p.text ?? null,
          feeling: p.feeling ?? null,
          createdAt: p.createdAt.toISOString(),
          outdoor: p.lat != null && p.lng != null,
          media: (p.media ?? []).map((m) => ({
            url: signed.get(m.url) ?? m.url,
            kind: m.kind,
            thumbUrl: m.thumbUrl ? (signed.get(m.thumbUrl) ?? m.thumbUrl) : null,
          })),
          likeCount: px._count.likes,
          commentCount: px._count.comments,
          // Full-card fields — so the profile can render the same PostCard as the feed.
          author: px.author,
          audience: px.audience ?? 'public',
          placeName: px.placeName ?? null,
          tagged,
          likedByMe: px.likes.length > 0,
          savedByMe: saved.has(p.id),
          category: px.category ?? null,
          // Hidden by its author (owner, 10 Sep) — shown on their own grid with
          // "Hidden · only you can see this", invisible to everybody else.
          hidden: (p as { moderation?: string | null }).moderation === 'hidden',
        };
      }),
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
    // unbounded: `in:` of the caller's id list bounds it
    const owned = await this.prisma.post.findMany({
      where: { id: { in: ids }, authorId: userId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    const updates = ids
      .filter((id) => ownedSet.has(id))
      .map((id, index) =>
        this.prisma.post.update({ where: { id }, data: { sortIndex: index } }),
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
    const u = (await this.prisma.user.findUnique({
      where: { handle },
      select: {
        id: true, handle: true, name: true, email: true, profileImage: true,
        emailVerified: true, createdAt: true, bio: true, city: true, website: true,
        deletedAt: true, suspendedAt: true,
      },
    })) as unknown as (UserRow & { deletedAt?: Date | null; suspendedAt?: Date | null }) | null;
    // A deleted account has no public profile — it reads exactly like a handle
    // that never existed. AND NEITHER HAS A SUSPENDED ONE (this audit): a
    // suspension was a login block and nothing more, so the account closed for
    // harassment kept its page, its photograph and its grid. One predicate for
    // both — see admin/account-reach.ts.
    if (!u || !accountReachable(u)) throw new NotFoundException('No citizen with that handle.');
    /**
     * ── AND A BLOCK READS THE SAME WAY (31 Aug audit) ──────────────────────
     *
     * `publicPosts` below has always returned an empty grid for a blocked
     * pair. This header did not check at all — so a citizen you blocked could
     * type your handle and read your name, photograph, bio, city, website,
     * member-since and your follower, following and post counts, under an
     * empty grid. Everything but the pictures.
     *
     * `blocking.ts` already states the intended rule, in the docblock on
     * `blockedMessage`: blocking somebody "removes them from the feed, from
     * search and from your circle, so their profile is the one page you can no
     * longer reach". That was written as a fact and enforced nowhere. It is
     * why the unblock path is Settings → Blocked citizens rather than their
     * profile — the product already assumed this.
     *
     * The same sentence as a deleted account, deliberately. A different one
     * would tell the reader that a specific citizen exists and has shut them
     * out, which is exactly the fact a block is meant not to hand over.
     * Symmetric, like every other block check here.
     */
    if (u.id !== viewerId && await this.blocking.isBlocked(viewerId, u.id)) {
      throw new NotFoundException('No citizen with that handle.');
    }
    const stats = await this.statsFor(u.id);
    let relationship: Relationship = 'none';
    let iFollow = false;
    const isMe = u.id === viewerId;
    if (!isMe) {
      const { userOneId, userTwoId } = orderPair(viewerId, u.id);
      const [conn, follow] = await Promise.all([
        this.prisma.connection.findFirst({ where: { userOneId, userTwoId, connectionType: 'FRIEND' }, select: { status: true, requestedById: true } }),
        swallow(this.prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: u.id } }, select: { followerId: true } }), 'profile view: follow-state read', { viewerId }),
      ]);
      relationship = this.relationshipOf(conn?.status, conn?.requestedById, viewerId);
      iFollow = Boolean(follow);
    }
    return {
      id: u.id, handle: u.handle, name: u.name, profileImage: u.profileImage,
      bio: u.bio, city: u.city, website: u.website,
      verified: u.emailVerified, memberSince: u.createdAt.toISOString(), stats, relationship, iFollow, isMe,
    };
  }

  /** Read-only view of another citizen's posts (grid), respecting audience &
   *  blocks. Strangers see only public posts; accepted friends also see
   *  friends-audience posts. Never returns private/family posts of others. */
  async publicPosts(viewerId: string, handleRaw: string, cursor?: string, limit = 18) {
    const handle = (handleRaw ?? '').trim().replace(/^@/, '').toLowerCase();
    const u = await this.prisma.user.findUnique({ where: { handle }, select: { id: true, deletedAt: true, suspendedAt: true } });
    if (!u || !accountReachable(u)) throw new NotFoundException('No citizen with that handle.');
    // Blocked either way → nothing to show. This used to read the Block table
    // directly and so missed a connection-level block; connections/blocking.ts
    // is now the one place that knows what blocked means.
    if (await this.blocking.isBlocked(viewerId, u.id)) return { items: [], nextCursor: null };

    // The audience rule lives in ConnectionsService — see visibleAudiences().
    // It used to be duplicated here and in SocialService, and the two copies had
    // already drifted apart once: a "friends" post was visible in this grid to
    // any signed-in citizen while the feed correctly refused it.
    //
    // NOTE: `audience` is a NON-NULL column (default 'public'), so there must
    // be no `{ audience: null }` branch — Prisma rejects it ("Argument
    // `audience` is missing"), which previously threw and returned an empty grid.
    const allowed = await this.connections.visibleAudiences(viewerId, u.id);

    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.post.findMany({
      where: { ...VISIBLE_ONLY, authorId: u.id, repostOfId: null, audience: { in: allowed } },
      orderBy: [{ sortIndex: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        media: true,
        _count: { select: { likes: true, comments: true } },
        author: { select: { id: true, handle: true, name: true, profileImage: true } },
        likes: { where: { userId: viewerId }, select: { id: true } },
      },
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    // Post media is a private key now, signed on read (30 Aug audit). One pass
    // for the page, the same way SocialService.signMediaOf does it, or the grid
    // renders every photograph as a broken image.
    const [signed, saved] = await Promise.all([
      this.storage.signPostMedia(page.flatMap((p) => (p.media ?? []).flatMap((m) => [m.url, m.thumbUrl]))),
      this.savedSetFor(viewerId, page.map((p) => p.id)),
    ]);
    return {
      items: page.map((p) => {
        const px = p as unknown as {
          audience?: string | null; placeName?: string | null; taggedJson?: string | null; category?: string | null;
          author: { id: string; handle: string; name: string; profileImage: string | null };
          likes: unknown[]; _count: { likes: number; comments: number };
        };
        let tagged: Array<{ id: string; name: string; handle: string }> = [];
        try { tagged = px.taggedJson ? JSON.parse(px.taggedJson) : []; } catch { tagged = []; }
        return {
          id: p.id,
          text: p.text ?? null,
          feeling: p.feeling ?? null,
          createdAt: p.createdAt.toISOString(),
          outdoor: p.lat != null && p.lng != null,
          media: (p.media ?? []).map((m) => ({
            url: signed.get(m.url) ?? m.url,
            kind: m.kind,
            thumbUrl: m.thumbUrl ? (signed.get(m.thumbUrl) ?? m.thumbUrl) : null,
          })),
          likeCount: px._count.likes,
          commentCount: px._count.comments,
          author: px.author,
          audience: px.audience ?? 'public',
          placeName: px.placeName ?? null,
          tagged,
          likedByMe: px.likes.length > 0,
          savedByMe: saved.has(p.id),
          category: px.category ?? null,
        };
      }),
      nextCursor: hasMore ? page[page.length - 1].id : null,
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
    /**
     * ── BLOCKED CITIZENS ARE NOT IN THE DIRECTORY (31 Aug audit) ───────────
     *
     * This had no block filter, so a person you blocked came back in People
     * search — for both of you — with their name, photograph and city, and a
     * relationship chip inviting a connection request. `blocking.ts` says
     * plainly that a block "removes them from the feed, from search and from
     * your circle"; search was the third of those and it was never written.
     *
     * `notIn` rather than a post-filter, so the page is full: filtering twelve
     * results afterwards would quietly return eleven. The set is the same
     * union every other read uses, both directions.
     */
    const blocked = [...(await this.blocking.blockedWith(viewerId))];
    const rows = (await this.prisma.user.findMany({
      where: {
        id: { not: viewerId, ...(blocked.length ? { notIn: blocked } : {}) },
        // Deleted accounts were never discoverable; suspended ones were, until
        // this audit — search was one of the nine read paths a suspension did
        // not reach. See admin/account-reach.ts.
        ...REACHABLE_ACCOUNT,
        OR: [
          { handle: { startsWith: handleQ } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, handle: true, name: true, profileImage: true, city: true, emailVerified: true },
      take: 12,
    })) as unknown as Array<{ id: string; handle: string; name: string; profileImage: string | null; city: string | null; emailVerified: boolean }>;

    // One query for the viewer's connections, mapped to each result.
    const ids = rows.map((r) => r.id);
    const conns = ids.length
      // unbounded: `in:` of at most 12 search results bounds it
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

/**
 * Render a contact value with its verification state, or nothing at all.
 *
 * Returning null for an empty value rather than "Not set" is deliberate: the
 * empty state belongs to the component that renders the row, and a service that
 * invents display copy makes it impossible for the UI to tell "we have nothing"
 * apart from "we have the string 'Not set'".
 */
function verifiedLabel(value: string | null, verified: boolean): string | null {
  if (!value) return null;
  return verified ? `${value} · verified` : `${value} · unverified`;
}
