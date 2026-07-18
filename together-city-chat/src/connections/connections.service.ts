import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConnectionStatus, ConnectionType } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from './connection.util';
import { CONNECTION_RULES } from './connection-permission.rules';
import { RequestConnectionDto, RespondConnectionDto } from './dto/connections.dto';

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async request(requesterId: string, dto: RequestConnectionDto) {
    if (requesterId === dto.targetUserId) {
      throw new BadRequestException('Cannot connect to yourself');
    }
    const rule = CONNECTION_RULES[dto.connectionType as ConnectionType];
    // Note: external-event gating (marketplace order, doctor assignment, etc.)
    // is verified by the calling domain before invoking this method; the flag is
    // surfaced so callers/tests can assert it. See ARCHITECTURE.md.
    void rule.requiresExternalEvent;

    const { userOneId, userTwoId } = orderPair(requesterId, dto.targetUserId);
    return this.prisma.connection.upsert({
      where: {
        userOneId_userTwoId_connectionType: {
          userOneId,
          userTwoId,
          connectionType: dto.connectionType as ConnectionType,
        },
      },
      create: {
        userOneId,
        userTwoId,
        connectionType: dto.connectionType as ConnectionType,
        status: ConnectionStatus.PENDING,
        requestedById: requesterId,
      },
      update: {}, // idempotent: re-requesting an existing pending/accepted is a no-op
    });
  }

  async respond(userId: string, dto: RespondConnectionDto) {
    const conn = await this.prisma.connection.findUnique({ where: { id: dto.connectionId } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.userOneId !== userId && conn.userTwoId !== userId) {
      throw new ForbiddenException('Not your connection');
    }
    // The requester cannot accept their own request.
    if (dto.action === 'ACCEPT' && conn.requestedById === userId) {
      throw new ForbiddenException('Wait for the other member to accept.');
    }
    const status: ConnectionStatus =
      dto.action === 'ACCEPT'
        ? ConnectionStatus.ACCEPTED
        : dto.action === 'BLOCK'
          ? ConnectionStatus.BLOCKED
          : dto.action === 'REMOVE'
            ? ConnectionStatus.REMOVED
            : ConnectionStatus.REMOVED; // DECLINE
    return this.prisma.connection.update({
      where: { id: conn.id },
      data: { status },
    });
  }

  async listForUser(userId: string, status?: ConnectionStatus) {
    return this.prisma.connection.findMany({
      where: {
        OR: [{ userOneId: userId }, { userTwoId: userId }],
        ...(status ? { status } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
