import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConnectionStatus, ConnectionType, Connection, User } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from './connection.util';
import { RequestConnectionDto, RespondConnectionDto, UpdateModulesDto, UNIVERSAL_MODULES } from './dto/connections.dto';

/** Shape the UI consumes: the OTHER party + a friendly status + direction. */
export interface ShapedConnection {
  id: string;
  status: 'pending' | 'accepted' | 'blocked';
  incoming: boolean; // true when the OTHER person sent the request (you can accept)
  relationship: string | null;
  modules: string[]; // Universal Connection Model — module permissions on this ONE record
  user: { id: string; handle: string; name: string; profileImage: string | null };
}

const DEFAULT_MODULES = ['chat', 'mail', 'social'];
/** Chat + Mail are universal: silently added to every grant set. */
const withUniversal = (mods: string[]): string[] => [...new Set([...UNIVERSAL_MODULES, ...mods])];
const parseModules = (raw: unknown): string[] => {
  try { const v = JSON.parse(String(raw ?? '')); return withUniversal(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : DEFAULT_MODULES); }
  catch { return withUniversal(DEFAULT_MODULES); }
};

const STATUS_OUT: Record<ConnectionStatus, ShapedConnection['status']> = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  BLOCKED: 'blocked',
  REMOVED: 'blocked',
};

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

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
      return this.shape(reopened, requesterId, target);
    }
    return this.shape(conn, requesterId, target);
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
    }
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
    const otherId = updated.userOneId === userId ? updated.userTwoId : updated.userOneId;
    const other = await this.prisma.user.findUnique({ where: { id: otherId } });
    return this.shape(updated, userId, other);
  }

  /** Two-way sync (hub → People): a hub removing a member for `module` clears
   *  that module on the shared connection record, so the People view never drifts
   *  from what the hub shows. Universal modules are never touched. Safe to call
   *  from any hub; no-op when the pair has no connection or already lacks it. */
  async revokeModuleForPair(userA: string, userB: string, module: string): Promise<void> {
    if (UNIVERSAL_MODULES.includes(module as (typeof UNIVERSAL_MODULES)[number])) return;
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
    await this.prisma.connection.update({
      where: { id: conn.id },
      data: { modulesJson: JSON.stringify(withUniversal(next)) } as never,
    }).catch(() => undefined);
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
    await this.prisma.connection.update({ where: { id: conn.id }, data: { status: ConnectionStatus.REMOVED } });
    await this.unsyncHousehold(conn).catch(() => undefined);
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
    return {
      id: conn.id,
      status: STATUS_OUT[conn.status],
      relationship: (conn as { relationship?: string | null }).relationship ?? null,
      modules: parseModules((conn as { modulesJson?: string | null }).modulesJson),
      incoming: conn.requestedById !== meId,
      user: other
        ? { id: other.id, handle: other.handle, name: other.name, profileImage: other.profileImage ?? null }
        : { id: '', handle: 'unknown', name: 'Unknown', profileImage: null },
    };
  }
}
