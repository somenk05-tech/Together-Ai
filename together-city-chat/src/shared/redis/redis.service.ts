import { swallowed } from '../../shared/swallow';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const PRESENCE_KEY = (userId: string) => `presence:${userId}`;
const SOCKETS_KEY = (userId: string) => `sockets:${userId}`;
const OPEN_CONV_KEY = (userId: string) => `openconv:${userId}`;

/**
 * Presence + ephemeral chat state in Redis.
 * Degrades gracefully: if Redis is unavailable, methods no-op rather than crash
 * the socket layer (online status simply falls back to the DB column).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private healthy = false;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.client = new Redis(config.get<string>('redisUrl') ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    this.client.on('ready', () => (this.healthy = true));
    this.client.on('error', (e) => {
      this.healthy = false;
      this.logger.warn(`Redis unavailable: ${e.message}`);
    });
    void this.client.connect().catch(swallowed('shared.constructor', undefined));
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  get raw(): Redis {
    return this.client;
  }

  /** Register a live socket for a user; returns the new socket count. */
  async addSocket(userId: string, socketId: string): Promise<number> {
    if (!this.healthy) return 1;
    await this.client.sadd(SOCKETS_KEY(userId), socketId);
    await this.client.set(PRESENCE_KEY(userId), Date.now().toString());
    return this.client.scard(SOCKETS_KEY(userId));
  }

  /** Remove a socket; returns remaining socket count (0 = user went offline). */
  async removeSocket(userId: string, socketId: string): Promise<number> {
    if (!this.healthy) return 0;
    await this.client.srem(SOCKETS_KEY(userId), socketId);
    const remaining = await this.client.scard(SOCKETS_KEY(userId));
    if (remaining === 0) await this.client.del(PRESENCE_KEY(userId));
    return remaining;
  }

  async isOnline(userId: string): Promise<boolean> {
    if (!this.healthy) return false;
    return (await this.client.exists(PRESENCE_KEY(userId))) === 1;
  }

  async heartbeat(userId: string): Promise<void> {
    if (!this.healthy) return;
    await this.client.set(PRESENCE_KEY(userId), Date.now().toString(), 'EX', 60);
  }

  /** Track which conversation a user currently has open (suppresses push). */
  async setOpenConversation(userId: string, conversationId: string | null): Promise<void> {
    if (!this.healthy) return;
    if (conversationId) await this.client.set(OPEN_CONV_KEY(userId), conversationId, 'EX', 3600);
    else await this.client.del(OPEN_CONV_KEY(userId));
  }

  async getOpenConversation(userId: string): Promise<string | null> {
    if (!this.healthy) return null;
    return this.client.get(OPEN_CONV_KEY(userId));
  }
}
