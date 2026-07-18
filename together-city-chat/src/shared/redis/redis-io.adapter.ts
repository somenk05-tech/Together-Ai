import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions, Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

/**
 * Socket.IO adapter backed by Redis pub/sub so real-time chat works across
 * MANY backend instances (horizontal scaling). Without it, a message sent to a
 * user connected to instance A never reaches a user on instance B.
 *
 * Degrades gracefully: if Redis is unreachable, it logs and runs single-instance
 * (chat still works, just not fanned out across replicas).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('RedisIoAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    try {
      // pub/sub clients: maxRetriesPerRequest must be null for the subscriber.
      const pubClient = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
      const subClient = pubClient.duplicate();
      pubClient.on('error', (e) => this.logger.warn(`Redis pub error: ${e.message}`));
      subClient.on('error', (e) => this.logger.warn(`Redis sub error: ${e.message}`));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.IO Redis adapter connected — chat scales across instances.');
    } catch (e) {
      this.logger.warn(
        `Redis adapter unavailable (${(e as Error).message}) — running single-instance chat.`,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
