import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { RedisService } from '../shared/redis/redis.service';

/**
 * Source of truth for online/offline/lastSeen.
 * Live state lives in Redis (fast, ephemeral); we persist to Postgres on
 * connect/disconnect and periodically so lastSeen survives restarts.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Register a live socket.
   *
   * `sockets` is the count AFTER this one, and it is returned rather than
   * thrown away because the gateway needs it: `addSocket` is a Redis SADD, so
   * the Nth socket for a citizen sees N, and that is the only race-free place
   * to decide whether there are too many. (1M-DAU pass, 6 Sep — before it, one
   * account could hold five hundred open sockets and nothing counted them.)
   */
  async markOnline(userId: string, socketId: string): Promise<{ transitioned: boolean; sockets: number }> {
    const sockets = await this.redis.addSocket(userId, socketId);
    // First connection -> transitioned to online.
    if (sockets === 1) await this.persistStatus(userId, true);
    return { transitioned: sockets === 1, sockets };
  }

  async markOffline(userId: string, socketId: string): Promise<boolean> {
    const remaining = await this.redis.removeSocket(userId, socketId);
    if (remaining === 0) {
      await this.persistStatus(userId, false);
      return true; // last connection closed -> transitioned to offline
    }
    return false;
  }

  async isOnline(userId: string): Promise<boolean> {
    return this.redis.isOnline(userId);
  }

  async heartbeat(userId: string): Promise<void> {
    await this.redis.heartbeat(userId);
  }

  private async persistStatus(userId: string, online: boolean): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { onlineStatus: online, lastSeen: new Date() },
      });
    } catch (e) {
      this.logger.warn(`persistStatus failed for ${userId}: ${(e as Error).message}`);
    }
  }
}
