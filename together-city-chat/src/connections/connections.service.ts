import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConnectionStatus, ConnectionType, Connection, User } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from './connection.util';
import { RequestConnectionDto, RespondConnectionDto } from './dto/connections.dto';

/** Shape the UI consumes: the OTHER party + a friendly status + direction. */
export interface ShapedConnection {
  id: string;
  status: 'pending' | 'accepted' | 'blocked';
  incoming: boolean; // true when the OTHER person sent the request (you can accept)
  user: { id: string; handle: string; name: string; profileImage: string | null };
}

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
      },
      // Re-requesting after a decline/removal re-opens it as pending from this requester.
      update: {},
    });

    // If a prior row exists but was removed/blocked, re-open it as a fresh pending request.
    if (conn.status === ConnectionStatus.REMOVED) {
      const reopened = await this.prisma.connection.update({
        where: { id: conn.id },
        data: { status: ConnectionStatus.PENDING, requestedById: requesterId },
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

  private shape(conn: Connection, meId: string, other: User | null): ShapedConnection {
    return {
      id: conn.id,
      status: STATUS_OUT[conn.status],
      incoming: conn.requestedById !== meId,
      user: other
        ? { id: other.id, handle: other.handle, name: other.name, profileImage: other.profileImage ?? null }
        : { id: '', handle: 'unknown', name: 'Unknown', profileImage: null },
    };
  }
}
