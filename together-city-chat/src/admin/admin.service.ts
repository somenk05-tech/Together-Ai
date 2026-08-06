import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AdminAccessService } from './admin-access.service';
import { PERMISSIONS, ROLES, type Permission } from './permissions';

/**
 * THE FIRST CONSOLE SCREEN, AND THE ONE WITH SOMEBODY WAITING ON IT.
 *
 * Listings sit at moderation: 'pending' and nothing has ever surfaced them.
 * A citizen who filled in the whole form is looking at a page that says their
 * business is not live yet, and there is no queue anywhere that a person could
 * open to change that. That is the screen worth building first — not the
 * dashboard of counters, which mostly counts things that do not exist yet.
 *
 * Every decision goes through AdminAccessService.act(), so it is impossible to
 * approve a listing without the permission and without a written reason. That
 * is the whole point of having built the substrate before the screen.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService,
  ) {}

  /**
   * Who the caller is, in console terms.
   *
   * Returns the permission KEYS and their sentences, so the screen can hide
   * what this person cannot do rather than showing them buttons that will
   * refuse. Hiding is a courtesy; the guard is the security.
   */
  async me(userId: string) {
    const roles = await this.access.rolesOf(userId);
    const perms = await this.access.permissionsOf(userId);
    return {
      roles,
      permissions: perms.map((key) => ({ key, label: PERMISSIONS[key] })),
      // The whole map, so a founder can see what a role would grant before
      // granting it. Reading the table is not an action.
      roleCatalogue: Object.fromEntries(Object.entries(ROLES).map(([r, ps]) => [r, [...ps]])),
    };
  }

  /**
   * Everything waiting on a decision.
   *
   * Oldest first, deliberately. A queue sorted newest-first starves its own
   * tail: the listing nobody got to on Monday is the listing nobody gets to
   * ever, and it belongs to the citizen who has been waiting longest.
   */
  async queue(userId: string) {
    await this.access.assert(userId, 'business.read');
    const rows = await this.prisma.serviceListing.findMany({
      where: { moderation: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }) as unknown as Array<{
      id: string; ownerId: string; businessName: string; categoryKey: string; city: string;
      areas: string; about: string | null; photosJson: string; createdAt: Date; slug: string | null;
    }>;
    if (!rows.length) return { items: [], waiting: 0 };

    // One read for the owners rather than one per row — a queue of two hundred
    // listings is not two hundred queries.
    const owners = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.ownerId))] } },
      select: { id: true, name: true, handle: true, createdAt: true },
      take: 200,
    });
    const byId = new Map(owners.map((o) => [o.id, o]));

    const parse = (json: string): Array<{ url: string }> => {
      try { return JSON.parse(json) as Array<{ url: string }>; } catch { return []; }
    };
    const now = Date.now();
    return {
      waiting: rows.length,
      items: rows.map((r) => {
        const o = byId.get(r.ownerId);
        return {
          id: r.id, slug: r.slug,
          businessName: r.businessName, categoryKey: r.categoryKey,
          city: r.city, areas: r.areas.split(',').map((a) => a.trim()).filter(Boolean),
          about: r.about, photos: parse(r.photosJson).map((p) => p.url).slice(0, 5),
          createdAt: r.createdAt.toISOString(),
          // The number the queue is actually about.
          waitingHours: Math.floor((now - r.createdAt.getTime()) / 3_600_000),
          owner: o ? { name: o.name, handle: o.handle, joinedAt: o.createdAt.toISOString() } : null,
        };
      }),
    };
  }

  /**
   * Approve, reject or suspend — and say why, every time.
   *
   * The reason is not paperwork. A rejected business is a person who will ask
   * what was wrong with their listing, and an answer that exists only in the
   * moderator's memory is an answer nobody can give a week later.
   */
  async decide(userId: string, id: string, decision: 'approved' | 'rejected' | 'removed', reason: string, ip?: string | null) {
    const need: Permission = decision === 'removed' ? 'business.suspend' : 'business.approve';
    const row = await this.prisma.serviceListing.findUnique({ where: { id } }) as { moderation: string } | null;
    if (!row) throw new NotFoundException('listing not found');

    return this.access.act({
      actorId: userId, need,
      action: `listing.${decision}`, entity: 'listing', entityId: id,
      before: { moderation: row.moderation }, after: { moderation: decision },
      reason, ip,
    }, async () => {
      await this.prisma.serviceListing.update({ where: { id }, data: { moderation: decision } });
      return { id, moderation: decision };
    });
  }

  /**
   * The log, newest first, because reading it is nearly always "what just
   * happened".
   */
  async audit(userId: string, q: { entity?: string; entityId?: string; actorId?: string }) {
    await this.access.assert(userId, 'audit.read');
    const rows = await this.prisma.adminAudit.findMany({
      where: {
        ...(q.entity ? { entity: q.entity } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
        ...(q.actorId ? { actorId: q.actorId } : {}),
      },
      orderBy: { at: 'desc' },
      take: 200,
    });
    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorId))] } },
      select: { id: true, name: true, handle: true }, take: 200,
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      items: rows.map((r) => ({
        id: r.id, action: r.action, entity: r.entity, entityId: r.entityId,
        before: r.before, after: r.after, reason: r.reason,
        at: r.at.toISOString(),
        // The IP is recorded and NOT returned. It exists so a compromised
        // account can be traced by somebody with database access, not so that
        // every reader of the log collects their colleagues' home addresses.
        actor: byId.get(r.actorId) ? { name: byId.get(r.actorId)!.name, handle: byId.get(r.actorId)!.handle } : null,
      })),
    };
  }
}
