import { swallowed } from '../../shared/swallow';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const PRESENCE_KEY = (userId: string) => `presence:${userId}`;
const SOCKETS_KEY = (userId: string) => `sockets:${userId}`;
const OPEN_CONV_KEY = (userId: string) => `openconv:${userId}`;

/**
 * Presence + ephemeral chat state in Redis.
 *
 * ── DEGRADING GRACEFULLY IS NOT THE SAME AS DEGRADING TO A LIE ──────────────
 *
 * Every method used to short-circuit on `!healthy` and return the value that
 * happens to type-check: `addSocket` returned 1, `removeSocket` returned 0,
 * `getOpenConversation` returned null. Those are not neutral. `1` means "this
 * is your FIRST socket" and `0` means "that was your LAST", so with Redis down
 * a citizen with two tabs was announced online on every connect and offline the
 * moment they closed either one — and `null` from `getOpenConversation` means
 * "no chat open", so the push suppression that stops your phone buzzing for the
 * conversation you are literally looking at never fired.
 *
 * A no-op that returns a confident wrong answer is worse than one that throws,
 * because nothing upstream can tell. So the fallback is now an honest
 * in-process one: the same bookkeeping, held in memory, correct for exactly the
 * deployment that has no Redis — a single instance. On several instances
 * without Redis it is wrong in the same direction it always was, and that
 * deployment now says so loudly at boot (see redis-io.adapter.ts).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private healthy = false;
  /** In-process mirror used only while Redis is down. */
  private readonly localSockets = new Map<string, Set<string>>();
  private readonly localOpenConv = new Map<string, Map<string, string>>();

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

  /** Is the connection live? Callers that must degrade rather than throw read
   *  this before reaching for `raw` — see throttler-redis.storage.ts. */
  get up(): boolean {
    return this.healthy;
  }

  /** Register a live socket for a user; returns the new socket count. */
  async addSocket(userId: string, socketId: string): Promise<number> {
    if (!this.healthy) {
      const set = this.localSockets.get(userId) ?? new Set<string>();
      set.add(socketId);
      this.localSockets.set(userId, set);
      return set.size;
    }
    await this.client.sadd(SOCKETS_KEY(userId), socketId);
    /* Both keys expire. `presence:` used to be written here with NO TTL, so a
       disconnect this process never saw (a crashed instance, a killed deploy)
       left the citizen online forever; and `sockets:` accumulated dead ids the
       same way, so its count never returned to zero again. The heartbeat —
       every 30s from a connected client — refreshes both; 90s of silence is offline. */
    await this.client.set(PRESENCE_KEY(userId), Date.now().toString(), 'EX', 90);
    await this.client.expire(SOCKETS_KEY(userId), 90);
    return this.client.scard(SOCKETS_KEY(userId));
  }

  /** Remove a socket; returns remaining socket count (0 = user went offline). */
  async removeSocket(userId: string, socketId: string): Promise<number> {
    if (!this.healthy) {
      const set = this.localSockets.get(userId);
      if (!set) return 0;
      set.delete(socketId);
      if (!set.size) this.localSockets.delete(userId);
      return set.size;
    }
    await this.client.srem(SOCKETS_KEY(userId), socketId);
    const remaining = await this.client.scard(SOCKETS_KEY(userId));
    if (remaining === 0) await this.client.del(PRESENCE_KEY(userId));
    return remaining;
  }

  async isOnline(userId: string): Promise<boolean> {
    if (!this.healthy) return (this.localSockets.get(userId)?.size ?? 0) > 0;
    return (await this.client.exists(PRESENCE_KEY(userId))) === 1;
  }

  async heartbeat(userId: string): Promise<void> {
    if (!this.healthy) return;
    await this.client.set(PRESENCE_KEY(userId), Date.now().toString(), 'EX', 90);
    await this.client.expire(SOCKETS_KEY(userId), 90);
  }

  /** Track which conversation each SOCKET has open (suppresses push).
   *
   *  Keyed per socket, not per user: with one shared value, a second tab
   *  closing — or the phone disconnecting — cleared the state for the tab
   *  still reading, and its owner started getting pushed for the conversation
   *  on their own screen. A hash of socketId → conversationId means each
   *  connection speaks only for itself. */
  async setOpenConversation(userId: string, conversationId: string | null, socketId: string): Promise<void> {
    if (!this.healthy) {
      const per = this.localOpenConv.get(userId) ?? new Map<string, string>();
      if (conversationId) per.set(socketId, conversationId);
      else per.delete(socketId);
      if (per.size) this.localOpenConv.set(userId, per);
      else this.localOpenConv.delete(userId);
      return;
    }
    if (conversationId) {
      try {
        await this.client.hset(OPEN_CONV_KEY(userId), socketId, conversationId);
      } catch {
        // The previous schema stored a plain string at this key (WRONGTYPE
        // for an hour after deploy, until its old EX ran out) — replace it.
        await this.client.del(OPEN_CONV_KEY(userId));
        await this.client.hset(OPEN_CONV_KEY(userId), socketId, conversationId);
      }
      await this.client.expire(OPEN_CONV_KEY(userId), 3600);
    } else {
      await this.client.hdel(OPEN_CONV_KEY(userId), socketId).catch(swallowed('redis.setOpenConversation', 0));
    }
  }

  /** Every conversation any of this user's live sockets has open. */
  async openConversationsOf(userId: string): Promise<string[]> {
    if (!this.healthy) return [...(this.localOpenConv.get(userId)?.values() ?? [])];
    return this.client.hvals(OPEN_CONV_KEY(userId)).catch(swallowed('redis.openConversationsOf', [] as string[]));
  }
}
