import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PresenceService } from './presence.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, handle: true, name: true, profileImage: true, lastSeen: true },
    });
  }

  /** Online users among a caller's accepted connections. */
  async onlineContacts(userId: string): Promise<string[]> {
    const conns = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
      select: { userOneId: true, userTwoId: true },
    });
    const contactIds = conns.map((c) => (c.userOneId === userId ? c.userTwoId : c.userOneId));
    const online: string[] = [];
    for (const id of contactIds) if (await this.presence.isOnline(id)) online.push(id);
    return online;
  }

  async registerDeviceToken(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }
}
