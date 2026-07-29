import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConnectionStatus, ConnectionType, Connection, User } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from './connection.util';
import { RequestConnectionDto, RespondConnectionDto, UpdateModulesDto } from './dto/connections.dto';
import { UNIVERSAL_SLUGS, PERMISSIONED_SLUGS, isHub, isUniversalHub } from './hubs.registry';
import { ConnectionsGateway } from './connections.gateway';
import { NotificationsService } from '../notifications/notifications.service';

/** Shape the UI consumes: the OTHER party + a friendly status + direction. */
export interface ShapedConnection {
  id: string;
  status: 'pending' | 'accepted' | 'blocked';
  incoming: boolean; // true when the OTHER person sent the request (you can accept)
  relationship: string | null;
  modules: string[]; // Universal Connection Model — module permissions on this ONE record
  hubPermissions: Record<string, boolean>; // the SAME data as a hub→on/off map (single source)
  user: { id: string; handle: string; name: string; profileImage: string | null };
}

const DEFAULT_MODULES = ['social'];
/** Chat + Mail are universal: silently added to every grant set. Unknown/removed
 *  hub keys (grocery, pantry, calendar…) are stripped here, so legacy rows can
 *  never resurface a deleted hub anywhere in the API. */
const withUniversal = (mods: string[]): string[] => [...new Set([...UNIVERSAL_SLUGS, ...mods.filter(isHub)])];
const parseModules = (raw: unknown): string[] => {
  try { const v = JSON.parse(String(raw ?? '')); return withUniversal(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : DEFAULT_MODULES); }
  catch { return withUniversal(DEFAULT_MODULES); }
};
/** The single-source permission record as a hub→boolean map (universal hubs are
 *  always-on and therefore omitted, matching the People UI checkboxes). */
const permissionMap = (modules: string[]): Record<string, boolean> => {
  const on = new Set(modules);
  const map: Record<string, boolean> = {};
  for (const slug of PERMISSIONED_SLUGS) map[slug] = on.has(slug);
  return map;
};

const STATUS_OUT: Record<ConnectionStatus, ShapedConnection['status']> = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  BLOCKED: 'blocked',
  REMOVED: 'blocked',
};

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ConnectionsGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /** Broadcast a permission change to BOTH members so every open page (People +
   *  each hub) invalidates and re-reads the shared store — no manual refresh. */
  private broadcast(conn: Connection): void {
    const modules = parseModules((conn as { modulesJson?: string | null }).modulesJson);
    this.gateway.permissionsChanged([conn.userOneId, conn.userTwoId], {
      connectionId: conn.id,
      status: STATUS_OUT[conn.status],
      relationship: (conn as { relationship?: string | null }).relationship ?? null,
      modules,
      hubPermissions: permissionMap(modules),
    });
  }

  /** Send (or re-send) a friend request by handle. Idempotent per pair. */
  async request(requesterId: string, dto: RequestConnectionDto): Promise<ShapedConnection> {
    const handle = dto.handle.trim().replace(/^@/, '').toLowerCase();
    if (!handle) throw new BadRequestException('Enter a handle.');
    const target = await this.prisma.user.findUnique({ where: { handle } });
    if (!target) throw new NotFoundException('No citizen with that handle.');
    if (target.id === requesterId) throw new BadRequestException('You can’t connect with yourself.');

    const { userOneId, userTwoId } = orderPair(requesterId, target.id);
    const conn = await this.prisma.connection.upsert({
      where: {
        userOneId_userTwoId_connectionType: {
          userOneId,
          userTwoId,
          connectionType: ConnectionType.FRIEND,
        },
      },
      create: {
        userOneId,
        userTwoId,
        connectionType: ConnectionType.FRIEND,
        status: ConnectionStatus.PENDING,
        requestedById: requesterId,
        relationship: dto.relationship ?? null,
        modulesJson: JSON.stringify(withUniversal(dto.modules ?? DEFAULT_MODULES)),
      } as never,
      // Re-requesting refreshes the requested modules/relationship.
      update: dto.modules?.length || dto.relationship ? {
        ...(dto.modules?.length ? { modulesJson: JSON.stringify(withUniversal(dto.modules)) } : {}),
        ...(dto.relationship ? { relationship: dto.relationship } : {}),
      } as never : {},
    });

    // If a prior row exists but was removed/blocked, re-open it as a fresh pending request.
    if (conn.status === ConnectionStatus.REMOVED) {
      const reopened = await this.prisma.connection.update({
        where: { id: conn.id },
        data: {
          status: ConnectionStatus.PENDING, requestedById: requesterId,
          relationship: dto.relationship ?? null,
          modulesJson: JSON.stringify(withUniversal(dto.modules ?? DEFAULT_MODULES)),
        } as never,
      });
      this.broadcast(reopened);
      void this.notifyRequest(requesterId, target.id);
      return this.shape(reopened, requesterId, target);
    }
    this.broadcast(conn);
    void this.notifyRequest(requesterId, target.id);
    return this.shape(conn, requesterId, target);
  }

  /** Tell the recipient a connection request arrived. */
  private async notifyRequest(requesterId: string, recipientId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: requesterId }, select: { name: true } }).catch(() => null);
    await this.notifications.create({
      userId: recipientId, actorId: requesterId, kind: 'connection_request',
      title: `${u?.name ?? 'Someone'} sent you a connection request`, href: '/connections', entityId: requesterId,
    });
  }

  /** Accept or block a request. Only the recipient may accept. */
  async respond(userId: string, dto: RespondConnectionDto): Promise<ShapedConnection> {
    const conn = await this.prisma.connection.findUnique({ where: { id: dto.connectionId } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.userOneId !== userId && conn.userTwoId !== userId) {
      throw new ForbiddenException('Not your connection');
    }
    if (dto.status === 'accepted' && conn.requestedById === userId) {
      throw new ForbiddenException('Wait for the other member to accept.');
    }
    const status =
      dto.status === 'accepted' ? ConnectionStatus.ACCEPTED : ConnectionStatus.BLOCKED;
    const updated = await this.prisma.connection.update({
      where: { id: conn.id },
      data: { status },
    });
    // Dating privacy (Connection Exclusion): the moment two people become
    // connected in People — or one blocks the other — they must disappear from
    // each other's Dating Hub. Tear down any dating match state + cached
    // compatibility between them. (COUPLE is Dating's own relationship, so it's
    // never torn down here; it's created directly by the Dating Hub.)
    if (updated.connectionType !== ConnectionType.COUPLE) {
      await this.purgeDatingBetween(updated.userOneId, updated.userTwoId).catch(() => undefined);
    }
    // Accepting a connection makes the two people follow each other (Social hub).
    if (status === ConnectionStatus.ACCEPTED) {
      await this.prisma.follow.createMany({
        data: [
          { followerId: updated.userOneId, followeeId: updated.userTwoId },
          { followerId: updated.userTwoId, followeeId: updated.userOneId },
        ],
        skipDuplicates: true,
      });
      // System Sync (Universal Connection Model): accepting in People connects
      // the granted modules everywhere — no separate hub invitations.
      await this.syncModules(updated).catch(() => undefined);
      // Tell the original requester their request was accepted.
      const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
      void this.notifications.create({
        userId: updated.requestedById, actorId: userId, kind: 'connection_accepted',
        title: `${me?.name ?? 'Someone'} accepted your connection request`, href: '/connections', entityId: userId,
      });
    }
    this.broadcast(updated);
    const otherId = updated.userOneId === userId ? updated.userTwoId : updated.userOneId;
    const other = await this.prisma.user.findUnique({ where: { id: otherId } });
    return this.shape(updated, userId, other);
  }

  /** Every connection this user is part of (friend graph), newest first. */
  async listForUser(userId: string, status?: string): Promise<ShapedConnection[]> {
    const rows = await this.prisma.connection.findMany({
      where: {
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        connectionType: ConnectionType.FRIEND,
        status: { not: ConnectionStatus.REMOVED },
      },
      include: { userOne: true, userTwo: true },
      orderBy: { updatedAt: 'desc' },
    });
    let shaped = rows.map((r) =>
      this.shape(r, userId, r.userOneId === userId ? r.userTwo : r.userOne),
    );
    if (status) shaped = shaped.filter((c) => c.status === status);
    return shaped;
  }

  /** Shareable recipients for the Universal Share Sheet: accepted connections,
   *  flagged as family (from the relationship label) so the sheet can group them.
   *  One consistent recipient source across every hub. */
  async recipients(userId: string): Promise<Array<{ id: string; handle: string; name: string; avatar: string | null; relationship: string | null; family: boolean }>> {
    const FAMILY_RE = /mother|father|\bmom\b|\bdad\b|parent|son|daughter|brother|sister|sibling|spouse|wife|husband|partner|family|cousin|uncle|aunt|grand|nephew|niece|in-law/i;
    const all = await this.listForUser(userId, 'accepted');
    return all
      .map((c) => ({
        id: c.user.id, handle: c.user.handle, name: c.user.name, avatar: c.user.profileImage ?? null,
        relationship: c.relationship ?? null,
        family: !!c.relationship && FAMILY_RE.test(c.relationship),
      }));
  }

  /** One record, many permissions: hubs query THIS. */
  async updateModules(userId: string, connectionId: string, dto: UpdateModulesDto): Promise<ShapedConnection> {
    const conn = await this.prisma.connection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.userOneId !== userId && conn.userTwoId !== userId) throw new ForbiddenException('Not your connection');
    const before = parseModules((conn as { modulesJson?: string | null }).modulesJson);
    const modules = withUniversal(dto.modules);
    const updated = await this.prisma.connection.update({
      where: { id: conn.id },
      data: {
        modulesJson: JSON.stringify(modules),
        ...(dto.relationship ? { relationship: dto.relationship } : {}),
      } as never,
    });
    if (updated.status === ConnectionStatus.ACCEPTED) {
      await this.syncModules(updated).catch(() => undefined);
      // Revoking a module disconnects that hub too (nutrition → household).
      if (before.includes('nutrition') && !modules.includes('nutrition')) {
        await this.unsyncHousehold(updated).catch(() => undefined);
      }
    }
    this.broadcast(updated);
    const otherId = updated.userOneId === userId ? updated.userTwoId : updated.userOneId;
    const other = await this.prisma.user.findUnique({ where: { id: otherId } });
    return this.shape(updated, userId, other);
  }

  /** SINGLE SOURCE OF TRUTH write path — set a full hub→boolean permission map on
   *  ONE connection record. The People page checkbox grid uses this
   *  (PATCH /connections/:id/permissions); every hub reads the same store. */
  async setPermissions(userId: string, connectionId: string, map: Record<string, boolean>, relationship?: string): Promise<ShapedConnection> {
    const conn = await this.prisma.connection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.userOneId !== userId && conn.userTwoId !== userId) throw new ForbiddenException('Not your connection');
    // Start from the current set, then apply only permissioned (non-universal) keys.
    const current = new Set(parseModules((conn as { modulesJson?: string | null }).modulesJson));
    for (const [slug, on] of Object.entries(map)) {
      if (!isHub(slug) || isUniversalHub(slug)) continue; // ignore unknown & universal
      if (on) current.add(slug); else current.delete(slug);
    }
    return this.updateModules(userId, connectionId, { modules: [...current], relationship: relationship as UpdateModulesDto['relationship'] });
  }

  /** Toggle ONE hub for ONE connection — the write path behind
   *  PATCH /hub/:hub/members. Updates the same shared permission store. */
  async setHubMember(userId: string, hub: string, connectionId: string, enabled: boolean): Promise<ShapedConnection> {
    if (!isHub(hub)) throw new BadRequestException('Unknown hub');
    if (isUniversalHub(hub)) throw new BadRequestException('Chat & Mail are universal and always on.');
    return this.setPermissions(userId, connectionId, { [hub]: enabled });
  }

  /** THE hub permission gate — reads the shared store, never hardcodes membership.
   *  True iff the two users share an ACCEPTED connection with `hub` granted. */
  async canAccessHub(a: string, b: string, hub: string): Promise<boolean> {
    if (a === b) return true;
    if (isUniversalHub(hub)) {
      const { userOneId, userTwoId } = orderPair(a, b);
      const c = await this.prisma.connection.findFirst({ where: { userOneId, userTwoId, status: ConnectionStatus.ACCEPTED }, select: { id: true } });
      return !!c;
    }
    const { userOneId, userTwoId } = orderPair(a, b);
    const conn = await this.prisma.connection.findFirst({
      where: { userOneId, userTwoId, status: ConnectionStatus.ACCEPTED },
    }).catch(() => null);
    if (!conn) return false;
    return parseModules((conn as { modulesJson?: string | null }).modulesJson).includes(hub);
  }

  /** Throws 403 unless `viewer` may access `owner`'s `hub` per the shared store. */
  async assertHubAccess(viewer: string, owner: string, hub: string): Promise<void> {
    if (!(await this.canAccessHub(viewer, owner, hub))) {
      throw new ForbiddenException(`No ${hub} access for this member.`);
    }
  }

  /**
   * Which post audiences `viewer` is entitled to see of `owner`'s posts.
   *
   * ONE implementation, because there used to be two. The profile grid and the
   * feed each carried their own copy of this rule, and they had already drifted
   * once — a "friends" post was visible in the grid to any signed-in citizen
   * while the feed correctly refused it. An audience setting that holds in one
   * place and not another is worse than not offering the setting at all, and
   * two copies of a rule will always drift again.
   *
   * A connection now counts only while Social is granted on it. That checkbox
   * is what a citizen believes controls exactly this, and until now it did
   * nothing: switching Social off left the other person still inside the
   * friends circle. Following is untouched — choosing to follow someone is its
   * own consent, and is not something the followee's hub toggles revoke.
   */
  async visibleAudiences(viewer: string, owner: string): Promise<string[]> {
    if (viewer === owner) return ['public', 'friends', 'family', 'private'];

    const { userOneId, userTwoId } = orderPair(viewer, owner);
    const [follows, conn] = await Promise.all([
      this.prisma.follow
        .findUnique({ where: { followerId_followeeId: { followerId: viewer, followeeId: owner } }, select: { id: true } })
        .catch(() => null),
      this.prisma.connection
        .findFirst({ where: { userOneId, userTwoId, status: ConnectionStatus.ACCEPTED } })
        .catch(() => null),
    ]);

    const social = conn
      ? parseModules((conn as { modulesJson?: string | null }).modulesJson).includes('social')
      : false;

    const allowed = ['public'];
    if (follows || social) allowed.push('friends');
    if (social && ((conn as { relationship?: string | null } | null)?.relationship ?? '') === 'family') {
      allowed.push('family');
    }
    return allowed;
  }

  /** Two-way sync (hub → People): a hub removing a member for `module` clears
   *  that module on the shared connection record, so the People view never drifts
   *  from what the hub shows. Universal modules are never touched. Safe to call
   *  from any hub; no-op when the pair has no connection or already lacks it. */
  async revokeModuleForPair(userA: string, userB: string, module: string): Promise<void> {
    if (isUniversalHub(module)) return;
    const { userOneId, userTwoId } = orderPair(userA, userB);
    const conn = await this.prisma.connection.findUnique({
      where: {
        userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType: ConnectionType.FRIEND },
      },
    }).catch(() => null);
    if (!conn) return;
    const current = parseModules((conn as { modulesJson?: string | null }).modulesJson);
    if (!current.includes(module)) return;
    const next = current.filter((m) => m !== module);
    const updated = await this.prisma.connection.update({
      where: { id: conn.id },
      data: { modulesJson: JSON.stringify(withUniversal(next)) } as never,
    }).catch(() => null);
    if (updated) this.broadcast(updated); // two-way sync → refresh People + hub lists
  }

  /** Everyone connected to this user FOR a given module — what every hub
   *  displays ("Connected via People") instead of running its own invites. */
  async listForModule(userId: string, module: string): Promise<ShapedConnection[]> {
    const all = await this.listForUser(userId, 'accepted');
    return all.filter((c) => c.modules.includes(module));
  }

  /** Remove a connection entirely — instantly disconnects the pair from EVERY
   *  hub (People, household/nutrition, medical family, travel …). */
  async remove(userId: string, connectionId: string): Promise<{ removed: true }> {
    const conn = await this.prisma.connection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.userOneId !== userId && conn.userTwoId !== userId) throw new ForbiddenException('Not your connection');
    const removed = await this.prisma.connection.update({ where: { id: conn.id }, data: { status: ConnectionStatus.REMOVED } });
    await this.unsyncHousehold(conn).catch(() => undefined);
    this.broadcast(removed); // disconnects everywhere — refresh People + every hub list
    // Social follows end with the connection.
    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: conn.userOneId, followeeId: conn.userTwoId },
          { followerId: conn.userTwoId, followeeId: conn.userOneId },
        ],
      },
    }).catch(() => undefined);
    return { removed: true };
  }

  /** End any household link between the two users (both directions). */
  /** Remove a pair from each other's Dating Hub: delete any dating-match state
   *  and cached compatibility between them (privacy rule — connections are never
   *  dating candidates). The dating conversation, if any, stays as their normal
   *  People chat (archive policy). */
  private async purgeDatingBetween(a: string, b: string): Promise<void> {
    await this.prisma.datingMatch.deleteMany({
      where: { OR: [{ userOneId: a, userTwoId: b }, { userOneId: b, userTwoId: a }] },
    }).catch(() => undefined);
    await (this.prisma as unknown as { compatibilityScore: { deleteMany(x: unknown): Promise<unknown> } }).compatibilityScore
      .deleteMany({ where: { OR: [{ userA: a, userB: b }, { userA: b, userB: a }] } }).catch(() => undefined);
  }

  private async unsyncHousehold(conn: Connection): Promise<void> {
    const household = (this.prisma as unknown as {
      householdMember: { updateMany: (a: unknown) => Promise<unknown> };
    }).householdMember;
    await household.updateMany({
      where: {
        OR: [
          { ownerId: conn.userOneId, memberUserId: conn.userTwoId },
          { ownerId: conn.userTwoId, memberUserId: conn.userOneId },
        ],
      },
      data: { status: 'removed' },
    }).catch(() => undefined);
  }

  /** Propagate granted modules into hub systems (accept once, connected everywhere). */
  private async syncModules(conn: Connection): Promise<void> {
    const modules = parseModules((conn as { modulesJson?: string | null }).modulesJson);
    // Nutrition Family Hub: the requester becomes the household owner, the
    // acceptor joins as an accepted member — replaces the separate invite flow.
    if (modules.includes('nutrition')) {
      const ownerId = conn.requestedById;
      const memberUserId = conn.userOneId === ownerId ? conn.userTwoId : conn.userOneId;
      const household = (this.prisma as unknown as {
        householdMember: {
          findFirst: (a: unknown) => Promise<{ id: string; status: string } | null>;
          create: (a: unknown) => Promise<unknown>;
          update: (a: unknown) => Promise<unknown>;
        };
      }).householdMember;
      const existing = await household.findFirst({ where: { ownerId, memberUserId } }).catch(() => null);
      if (!existing) {
        await household.create({ data: { ownerId, memberUserId, role: 'adult', status: 'accepted', requestedById: ownerId } }).catch(() => undefined);
      } else if (existing.status !== 'accepted') {
        await household.update({ where: { id: existing.id }, data: { status: 'accepted' } }).catch(() => undefined);
      }
    }
    // Medical reads the household; travel/entertainment/etc consume the record
    // directly via listForModule — nothing extra to create.
  }

  private shape(conn: Connection, meId: string, other: User | null): ShapedConnection {
    const modules = parseModules((conn as { modulesJson?: string | null }).modulesJson);
    return {
      id: conn.id,
      status: STATUS_OUT[conn.status],
      relationship: (conn as { relationship?: string | null }).relationship ?? null,
      modules,
      hubPermissions: permissionMap(modules),
      incoming: conn.requestedById !== meId,
      user: other
        ? { id: other.id, handle: other.handle, name: other.name, profileImage: other.profileImage ?? null }
        : { id: '', handle: 'unknown', name: 'Unknown', profileImage: null },
    };
  }
}
