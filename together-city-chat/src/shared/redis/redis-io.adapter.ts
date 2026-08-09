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
 * ── WHY THIS FILE STOPPED BEING QUIET ────────────────────────────────────────
 *
 * It used to `try { connect } catch { logger.warn }`, leave the adapter
 * undefined, and never try again. Read the failure honestly and it is not
 * graceful degradation, it is a silent downgrade from "chat works" to "chat
 * works for whoever happens to share an instance with you", announced once, at
 * `warn`, in a log nobody reads, at the one moment nobody is watching: boot.
 * Two seconds of Redis being slow to accept connections during a deploy and the
 * process runs the rest of its life with no adapter and no memory of why.
 *
 * Three changes, and the third is the one that matters:
 *
 * 1. The failure logs at ERROR and says what it costs, in a sentence an
 *    operator can act on. A warning is for something that might matter.
 * 2. It RETRIES, forever, with backoff. Redis being unreachable at second 0 of
 *    a deploy says nothing about second 30, and the old code treated the two as
 *    the same fact.
 * 3. `createIOServer` installs the adapter LATE if it has to. The server is
 *    built once at boot, so a retry that succeeds afterwards had no way to
 *    attach itself — the fix keeps the server reference and calls
 *    `server.adapter()` the moment a connection lands, which Socket.IO permits
 *    at any time.
 *
 * It still does not refuse to boot. A single-instance deployment with no Redis
 * is a legitimate configuration, and taking the whole API down over a fan-out
 * mechanism would trade a partial outage for a total one. What it will not do
 * any more is fail this way in silence.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger('RedisIoAdapter');
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private server?: Server;
  private attached = false;
  private attempt = 0;
  private stopped = false;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  /** Resolves once the first attempt has been made — success or failure. */
  async connectToRedis(): Promise<void> {
    await this.tryConnect();
    if (!this.adapterConstructor) this.scheduleRetry();
  }

  /** Exposed for the guard test and for a health endpoint to read. */
  get fannedOut(): boolean {
    return this.attached;
  }

  stop(): void {
    this.stopped = true;
  }

  private async tryConnect(): Promise<void> {
    this.attempt += 1;
    try {
      // pub/sub clients: maxRetriesPerRequest must be null for the subscriber.
      const pubClient = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
      const subClient = pubClient.duplicate();
      // ioredis reconnects these on its own once they have connected at least
      // once; the handlers exist so a later drop is not silent either.
      pubClient.on('error', (e) => this.logger.error(`Redis pub error: ${e.message}`));
      subClient.on('error', (e) => this.logger.error(`Redis sub error: ${e.message}`));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.attachIfPossible();
      this.logger.log('Socket.IO Redis adapter connected — chat fans out across instances.');
    } catch (e) {
      this.logger.error(
        `Redis adapter unavailable (${(e as Error).message}) at ${this.redisUrl.replace(/:[^:@/]*@/, ':***@')} — ` +
          'attempt ' + this.attempt + '. Until it connects, chat does NOT cross backend instances: ' +
          'with more than one replica, a message can reach nobody. Set REDIS_URL or run one replica.',
      );
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.adapterConstructor) return;
    // 2s, 4s, 8s … capped at 30s. Unref'd so it can never hold the process open.
    const delay = Math.min(30_000, 2_000 * 2 ** Math.min(this.attempt - 1, 4));
    const t = setTimeout(() => {
      void this.tryConnect().then(() => {
        if (!this.adapterConstructor) this.scheduleRetry();
      });
    }, delay);
    if (typeof t.unref === 'function') t.unref();
  }

  private attachIfPossible(): void {
    if (this.attached || !this.server || !this.adapterConstructor) return;
    this.server.adapter(this.adapterConstructor);
    this.attached = true;
    this.logger.log('Socket.IO Redis adapter attached to the running server.');
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    this.server = server;
    this.attachIfPossible();
    return server;
  }
}
